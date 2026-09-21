import {
  OPERATION_CRITERIA,
  OPERATION_INSTRUCTIONS,
  predictOperation,
  predictTarget,
  sanitizeProviderMetadata,
  type Memory,
} from './jev.js';
import type { MemoryOperation, Prediction } from './phase2_executor.js';

export type ControllerName = 'jev' | 'strong' | 'local';

export type ControllerResult = {
  prediction: Prediction;
  raw_output: unknown;
  operation_probabilities: Record<string, number> | null;
  target_probabilities: Record<string, number> | null;
  latency_ms: number;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
  };
  provider_metadata_safe: unknown;
  parse_error: string | null;
  attempts: number;
};

export const CONTROLLER_MODELS = {
  jev: 'typesafe/jev-1.13',
  strong: 'anthropic/claude-sonnet-4.6',
  local: 'Qwen3-8B',
} as const;

const BASELINE_SYSTEM = `You are a lifecycle-memory operation controller.

Choose exactly one operation under this fixed policy:
- ADD: ${OPERATION_CRITERIA.ADD}
- UPDATE: ${OPERATION_CRITERIA.UPDATE}
- DELETE: ${OPERATION_CRITERIA.DELETE}
- NOOP: ${OPERATION_CRITERIA.NOOP}

Apply the policy only to the supplied current valid memory state and current evidence. Do not infer a definite state change from tentative, hypothetical, future, pending, third-party-unverified, or uncertain language.

Target contract:
- For UPDATE or DELETE, select exactly one current candidate memory ID.
- For ADD or NOOP, target must be NONE.
- Return only the two schema fields operation and target. Do not provide reasoning, memory text, or explanation.`;

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

function addUsage(
  a: { inputTokens: number; outputTokens: number; cost?: number } | undefined,
  b: { inputTokens: number; outputTokens: number; cost?: number } | undefined,
) {
  return {
    input_tokens: (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0),
    output_tokens: (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0),
    cost_usd:
      a?.cost === undefined && b?.cost === undefined
        ? null
        : (a?.cost ?? 0) + (b?.cost ?? 0),
  };
}

async function runJev(
  existingMemories: Memory[],
  newFact: string,
): Promise<ControllerResult> {
  const started = performance.now();
  const operation = await predictOperation(existingMemories, newFact);
  let targetChoice = 'NONE';
  let targetResult: Awaited<ReturnType<typeof predictTarget>> | undefined;
  if (operation.choice === 'UPDATE' || operation.choice === 'DELETE') {
    if (existingMemories.length === 0) {
      return {
        prediction: { operation: operation.choice, target: 'NONE' },
        raw_output: { operation, target: null },
        operation_probabilities: operation.probabilities,
        target_probabilities: null,
        latency_ms: round(performance.now() - started),
        usage: addUsage(operation.usage, undefined),
        provider_metadata_safe: {
          operation: sanitizeProviderMetadata(operation.providerMetadata),
        },
        parse_error: 'target_required_but_candidate_state_empty',
        attempts: 1,
      };
    }
    targetResult = await predictTarget(
      existingMemories,
      newFact,
      operation.choice,
    );
    targetChoice = targetResult.choice;
  }
  const normalized = normalizePrediction(
    { operation: operation.choice, target: targetChoice },
    existingMemories.map(item => item.id),
  );
  return {
    prediction: normalized.prediction,
    raw_output: {
      operation: {
        choice: operation.choice,
        probabilities: operation.probabilities,
      },
      target: targetResult
        ? { choice: targetResult.choice, probabilities: targetResult.probabilities }
        : { choice: 'NONE', probabilities: { NONE: 1 } },
    },
    operation_probabilities: operation.probabilities,
    target_probabilities: targetResult?.probabilities ?? { NONE: 1 },
    latency_ms: round(performance.now() - started),
    usage: addUsage(operation.usage, targetResult?.usage),
    provider_metadata_safe: {
      operation: sanitizeProviderMetadata(operation.providerMetadata),
      target: targetResult
        ? sanitizeProviderMetadata(targetResult.providerMetadata)
        : null,
    },
    parse_error: normalized.error,
    attempts: 1,
  };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return { response, attempts: attempt };
      const body = await response.text();
      if (![408, 409, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
      lastError = new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
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

async function runChatController(
  controller: 'strong' | 'local',
  existingMemories: Memory[],
  newFact: string,
): Promise<ControllerResult> {
  const strong = controller === 'strong';
  const apiKey = strong ? process.env.OPENROUTER_API_KEY : 'sk-1234';
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.');
  const url = strong
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'http://127.0.0.1:9910/v1/chat/completions';
  const candidateIds = existingMemories.map(item => item.id);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      operation: { type: 'string', enum: ['ADD', 'UPDATE', 'DELETE', 'NOOP'] },
      target: { type: 'string', enum: ['NONE', ...candidateIds] },
    },
    required: ['operation', 'target'],
  };
  const body: Record<string, unknown> = {
    model: CONTROLLER_MODELS[controller],
    messages: [
      { role: 'system', content: BASELINE_SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({
          current_valid_memory_state: existingMemories,
          current_evidence: newFact,
          candidate_memory_ids: candidateIds,
        }),
      },
    ],
    max_tokens: 64,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'memory_decision', strict: true, schema },
    },
  };
  if (strong) {
    body.temperature = 0;
  } else {
    body.temperature = 0;
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const started = performance.now();
  const { response, attempts } = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(strong
        ? {
            'HTTP-Referer': 'https://github.com/MemTensor/MemOps',
            'X-Title': 'MemOps Jev Phase 2',
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
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
  const cost =
    typeof usage.cost === 'number'
      ? usage.cost
      : controller === 'local'
        ? 0
        : null;
  return {
    prediction: normalized.prediction,
    raw_output: content,
    operation_probabilities: null,
    target_probabilities: null,
    latency_ms: round(performance.now() - started),
    usage: {
      input_tokens:
        typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      output_tokens:
        typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null,
      cost_usd: cost,
    },
    provider_metadata_safe: {
      id: raw.id ?? null,
      model: raw.model ?? CONTROLLER_MODELS[controller],
      provider: raw.provider ?? (strong ? 'openrouter' : 'local-vllm'),
      finish_reason: raw.choices?.[0]?.finish_reason ?? null,
    },
    parse_error: parseError,
    attempts,
  };
}

export async function runController(args: {
  controller: ControllerName;
  existingMemories: Memory[];
  newFact: string;
}): Promise<ControllerResult> {
  if (args.controller === 'jev') {
    return runJev(args.existingMemories, args.newFact);
  }
  return runChatController(
    args.controller,
    args.existingMemories,
    args.newFact,
  );
}

export const FROZEN_POLICY = {
  OPERATION_INSTRUCTIONS,
  OPERATION_CRITERIA,
};
