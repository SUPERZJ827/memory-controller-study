import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { runController, type ControllerName } from './phase2_controllers.js';
import { runGpt56Sol } from './phase3_gpt_controller.js';

type StressController = ControllerName | 'gpt56sol';
type StressCase = {
  id: string;
  construction_family: string;
  construction_source: string;
  initial_state: Array<{ id: string; content: string }>;
  evidence: string;
  candidate_memories: Array<{ id: string; content: string }>;
  gold_operation: string;
  gold_target: string;
  rationale: string;
};

async function existingIds(file: string) {
  try {
    return new Set(
      (await readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line).id as string),
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
  const controller = process.argv.find(item => item.startsWith('--controller='))?.split('=')[1] as StressController;
  if (!['jev', 'strong', 'local', 'gpt56sol'].includes(controller)) {
    throw new Error('--controller=jev|gpt56sol|strong|local required');
  }
  const document = JSON.parse(
    await readFile('data/boundary_stress_v1.json', 'utf8'),
  ) as { cases: StressCase[] };
  await mkdir('results/phase3/stress_raw', { recursive: true });
  const output = `results/phase3/stress_raw/${controller}.jsonl`;
  const done = await existingIds(output);
  const remaining = document.cases.filter(item => !done.has(item.id));
  let completed = done.size;
  await pool(remaining, 4, async testCase => {
    const result =
      controller === 'gpt56sol'
        ? await runGpt56Sol({
            existingMemories: testCase.candidate_memories,
            newFact: testCase.evidence,
          })
        : await runController({
            controller,
            existingMemories: testCase.candidate_memories,
            newFact: testCase.evidence,
          });
    const record = {
      id: testCase.id,
      controller,
      model:
        controller === 'gpt56sol'
          ? 'openai/gpt-5.6-sol'
          : controller === 'jev'
            ? 'typesafe/jev-1.13'
            : controller === 'strong'
              ? 'anthropic/claude-sonnet-4.6'
              : 'Qwen3-8B',
      construction_family: testCase.construction_family,
      construction_source: testCase.construction_source,
      gold_operation: testCase.gold_operation,
      gold_target: testCase.gold_target,
      pred_operation: result.prediction.operation,
      pred_target: result.prediction.target,
      operation_correct: result.prediction.operation === testCase.gold_operation,
      target_correct: result.prediction.target === testCase.gold_target,
      joint_correct:
        result.prediction.operation === testCase.gold_operation &&
        result.prediction.target === testCase.gold_target,
      over_mutation:
        testCase.gold_operation === 'NOOP' && result.prediction.operation !== 'NOOP',
      under_mutation:
        testCase.gold_operation !== 'NOOP' && result.prediction.operation === 'NOOP',
      input: {
        existing_memories: testCase.candidate_memories,
        new_fact: testCase.evidence,
      },
      rationale: testCase.rationale,
      ...result,
    };
    await appendFile(output, `${JSON.stringify(record)}\n`);
    completed += 1;
    console.log(`[stress ${controller} ${completed}/180] ${testCase.id}`);
  });
}

await main();

