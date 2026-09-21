import { appendFile, readFile } from 'node:fs/promises';

type Reviewer = 'A' | 'B';
type Packet = {
  blind_id: string;
  current_memory_state: Array<{ id: string; content: string }>;
  current_evidence: string;
  candidate_memories: Array<{ id: string; content: string }>;
};
type Protocol = {
  system_prompt: string;
  reviewers: Record<Reviewer, Record<string, any>>;
};

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

async function fetchWithRetry(init: RequestInit) {
  const retryable = new Set([408, 409, 429, 500, 502, 503, 504]);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        init,
      );
      if (response.ok) return { response, attempts: attempt };
      const body = await response.text();
      if (!retryable.has(response.status)) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`);
      }
      lastError = new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`Reviewer request failed: ${safeMessage(lastError)}`);
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const object = /\{[\s\S]*\}/.exec(text)?.[0];
    if (object) return JSON.parse(object);
    throw new Error('No JSON object found.');
  }
}

function validate(
  value: unknown,
  candidateIds: string[],
): { value: Record<string, unknown> | null; error: string | null } {
  if (!value || typeof value !== 'object') return { value: null, error: 'not_object' };
  const item = value as Record<string, unknown>;
  if (!['ADD', 'UPDATE', 'DELETE', 'NOOP'].includes(String(item.operation))) {
    return { value: null, error: 'invalid_operation' };
  }
  if (!['NONE', ...candidateIds].includes(String(item.target))) {
    return { value: null, error: 'invalid_target' };
  }
  if (typeof item.policy_applicable !== 'boolean') {
    return { value: null, error: 'invalid_policy_applicable' };
  }
  if (!['NONE', 'LOW', 'MATERIAL'].includes(String(item.ambiguity))) {
    return { value: null, error: 'invalid_ambiguity' };
  }
  if (typeof item.short_reason !== 'string') {
    return { value: null, error: 'invalid_reason' };
  }
  const operation = String(item.operation);
  const target = String(item.target);
  if (
    ((operation === 'ADD' || operation === 'NOOP') && target !== 'NONE') ||
    ((operation === 'UPDATE' || operation === 'DELETE') && target === 'NONE')
  ) {
    return { value: null, error: 'operation_target_contract_violation' };
  }
  return { value: item, error: null };
}

async function runPacket(
  reviewer: Reviewer,
  packet: Packet,
  policy: unknown,
  protocol: Protocol,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  const config = protocol.reviewers[reviewer];
  const candidateIds = packet.candidate_memories.map(item => item.id);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      operation: { type: 'string', enum: ['ADD', 'UPDATE', 'DELETE', 'NOOP'] },
      target: { type: 'string', enum: ['NONE', ...candidateIds] },
      policy_applicable: { type: 'boolean' },
      ambiguity: { type: 'string', enum: ['NONE', 'LOW', 'MATERIAL'] },
      short_reason: { type: 'string' },
    },
    required: [
      'operation',
      'target',
      'policy_applicable',
      'ambiguity',
      'short_reason',
    ],
  };
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: protocol.system_prompt },
      { role: 'user', content: JSON.stringify({ frozen_memory_policy: policy, ...packet }) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'construct_review', strict: true, schema },
    },
  };
  if (reviewer === 'A') {
    body.reasoning = config.reasoning;
    body.max_completion_tokens = config.max_completion_tokens;
  } else {
    body.temperature = config.temperature;
    body.max_tokens = config.max_tokens;
  }
  const started = performance.now();
  const { response, attempts } = await fetchWithRetry({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/MemTensor/MemOps',
      'X-Title': `MemOps Phase 3 Blind Reviewer ${reviewer}`,
    },
    body: JSON.stringify(body),
  });
  const raw = (await response.json()) as Record<string, any>;
  const content = raw.choices?.[0]?.message?.content;
  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = extractJson(String(content ?? ''));
  } catch (error) {
    parseError = safeMessage(error);
  }
  const checked = validate(parsed, candidateIds);
  parseError = parseError ?? checked.error;
  return {
    blind_id: packet.blind_id,
    reviewer,
    model: config.model,
    review: checked.value,
    raw_output: content ?? null,
    raw_response_safe: {
      id: raw.id ?? null,
      model: raw.model ?? config.model,
      provider: raw.provider ?? null,
      choices: raw.choices ?? null,
      usage: raw.usage ?? null,
    },
    latency_ms: Math.round((performance.now() - started) * 100) / 100,
    usage: raw.usage ?? null,
    parse_error: parseError,
    attempts,
  };
}

async function existingIds(file: string) {
  try {
    return new Set(
      (await readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line).blind_id as string),
    );
  } catch (error: any) {
    if (error?.code === 'ENOENT') return new Set<string>();
    throw error;
  }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, concurrency) }, async () => {
      while (cursor < items.length) await worker(items[cursor++]);
    }),
  );
}

async function main() {
  const reviewer = process.argv.find(item => item.startsWith('--reviewer='))?.split('=')[1] as Reviewer;
  if (!['A', 'B'].includes(reviewer)) throw new Error('--reviewer=A|B required');
  const document = JSON.parse(await readFile('audit/blind_packets.json', 'utf8')) as {
    frozen_memory_policy: unknown;
    packets: Packet[];
  };
  const protocol = JSON.parse(
    await readFile('phase3/reviewer_protocols.json', 'utf8'),
  ) as Protocol;
  const output = `audit/reviewer_${reviewer}_raw.jsonl`;
  const done = await existingIds(output);
  const remaining = document.packets.filter(item => !done.has(item.blind_id));
  let completed = done.size;
  await pool(remaining, 4, async packet => {
    const result = await runPacket(
      reviewer,
      packet,
      document.frozen_memory_policy,
      protocol,
    );
    await appendFile(output, `${JSON.stringify(result)}\n`);
    completed += 1;
    console.log(`[reviewer ${reviewer} ${completed}/${document.packets.length}] ${packet.blind_id}`);
  });
}

await main();

