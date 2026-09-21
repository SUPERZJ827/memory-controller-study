import { readFile } from 'node:fs/promises';
import type { MemoryOperation, Prediction } from './phase2_executor.js';

export type GptControllerResult = {
  prediction: Prediction;
  raw_output: unknown;
  raw_response_safe: unknown;
  latency_ms: number;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    reasoning_tokens: number | null;
    cost_usd: number | null;
  };
  provider_metadata_safe: unknown;
  parse_error: string | null;
  attempts: number;
};

export type CandidateMemory = { id: string; content: string };

type Protocol = {
  model: string;
  reasoning: { effort: string };
  max_completion_tokens: number;
  system_prompt: string;
};

let protocolCache: Protocol | undefined;

export async function loadGptProtocol(): Promise<Protocol> {
  if (!protocolCache) {
    protocolCache = JSON.parse(
      await readFile('phase3/gpt56sol_protocol.json', 'utf8'),
    ) as Protocol;
  }
  return protocolCache;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function normalizePrediction(
  value: unknown,
  candidateIds: string[],
): { prediction: Prediction; error: string | null } {
  const record =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const operation = record.operation;
  const target = record.target;
  const operations = new Set(['ADD', 'UPDATE', 'DELETE', 'NOOP']);
  const targets = new Set(['NONE', ...candidateIds]);
  if (typeof operation !== 'string' || !operations.has(operation)) {
    return {
      prediction: { operation: 'NOOP', target: 'NONE' },
      error: 'invalid_or_missing_operation',
    };
  }
  if (typeof target !== 'string' || !targets.has(target)) {
    return {
      prediction: { operation: operation as MemoryOperation, target: 'NONE' },
      error: 'invalid_or_missing_target',
    };
  }
  if (
    ((operation === 'ADD' || operation === 'NOOP') && target !== 'NONE') ||
    ((operation === 'UPDATE' || operation === 'DELETE') && target === 'NONE')
  ) {
    return {
      prediction: { operation: operation as MemoryOperation, target },
      error: 'operation_target_contract_violation',
    };
  }
  return {
    prediction: { operation: operation as MemoryOperation, target },
    error: null,
  };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; attempts: number }> {
  let lastError: unknown;
  const retryable = new Set([408, 409, 429, 500, 502, 503, 504]);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return { response, attempts: attempt };
      const responseText = await response.text();
      if (!retryable.has(response.status)) {
        throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 1000)}`);
      }
      lastError = new Error(
        `HTTP ${response.status}: ${responseText.slice(0, 1000)}`,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`Request failed after retries: ${safeMessage(lastError)}`);
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
    if (fenced) return JSON.parse(fenced);
    const object = /\{[\s\S]*\}/.exec(text)?.[0];
    if (object) return JSON.parse(object);
    throw new Error('No JSON object found in model output.');
  }
}

export async function runGpt56Sol(args: {
  existingMemories: CandidateMemory[];
  newFact: string;
}): Promise<GptControllerResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.');
  const protocol = await loadGptProtocol();
  const candidateIds = args.existingMemories.map(item => item.id);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      operation: { type: 'string', enum: ['ADD', 'UPDATE', 'DELETE', 'NOOP'] },
      target: { type: 'string', enum: ['NONE', ...candidateIds] },
    },
    required: ['operation', 'target'],
  };
  const body = {
    model: protocol.model,
    messages: [
      { role: 'system', content: protocol.system_prompt },
      {
        role: 'user',
        content: JSON.stringify({
          current_valid_memory_state: args.existingMemories,
          current_evidence: args.newFact,
          candidate_memory_ids: candidateIds,
        }),
      },
    ],
    reasoning: protocol.reasoning,
    max_completion_tokens: protocol.max_completion_tokens,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'memory_decision', strict: true, schema },
    },
  };

  const started = performance.now();
  const { response, attempts } = await fetchWithRetry(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/MemTensor/MemOps',
        'X-Title': 'MemOps Jev Phase 3',
      },
      body: JSON.stringify(body),
    },
  );
  const raw = (await response.json()) as Record<string, any>;
  const content = raw.choices?.[0]?.message?.content;
  let parsed: unknown = {};
  let parseError: string | null = null;
  try {
    parsed = extractJson(typeof content === 'string' ? content : '');
  } catch (error) {
    parseError = safeMessage(error);
  }
  const normalized = normalizePrediction(parsed, candidateIds);
  parseError = parseError ?? normalized.error;
  const usage = raw.usage ?? {};
  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ??
    usage.completion_tokens_details?.reasoning ??
    null;
  const safeResponse = {
    id: raw.id ?? null,
    model: raw.model ?? protocol.model,
    provider: raw.provider ?? null,
    choices: raw.choices ?? null,
    usage: raw.usage ?? null,
  };
  return {
    prediction: normalized.prediction,
    raw_output: content ?? null,
    raw_response_safe: safeResponse,
    latency_ms: round(performance.now() - started),
    usage: {
      input_tokens:
        typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      output_tokens:
        typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null,
      reasoning_tokens:
        typeof reasoningTokens === 'number' ? reasoningTokens : null,
      cost_usd: typeof usage.cost === 'number' ? usage.cost : null,
    },
    provider_metadata_safe: {
      id: raw.id ?? null,
      model: raw.model ?? protocol.model,
      provider: raw.provider ?? null,
      finish_reason: raw.choices?.[0]?.finish_reason ?? null,
    },
    parse_error: parseError,
    attempts,
  };
}

