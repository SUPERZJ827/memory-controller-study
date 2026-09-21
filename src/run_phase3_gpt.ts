import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { runGpt56Sol } from './phase3_gpt_controller.js';
import {
  cloneState,
  executePrediction,
  renderState,
  statesEqual,
  type StateEntry,
} from './phase2_executor.js';

type Mode = 'preflight' | 'transitions' | 'trajectories';
type TransitionCase = {
  id: string;
  existing_memories: Array<{ id: string; content: string }>;
  new_fact: string;
  gold_operation: string;
  gold_target: string;
  slices: Record<string, boolean>;
  source: unknown;
};
type TrajectoryStep = {
  step_id: string;
  new_fact: string;
  gold_operation: 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';
  gold_target: string;
  slices: Record<string, boolean>;
  source: unknown;
  executor: {
    semantic_target_id: string;
    target_name: string;
    old_value: string | null;
    new_value: string | null;
  };
  gold_pre_state: StateEntry[];
  gold_post_state: StateEntry[];
};
type Trajectory = {
  id: string;
  source_file: string;
  initial_state: StateEntry[];
  canonical_memory_ids: Record<string, string>;
  steps: TrajectoryStep[];
  gold_final_state: StateEntry[];
};

const PREFLIGHT_IDS = [
  'memops-t001',
  'memops-t002',
  'memops-t003',
  'memops-t004',
  'memops-t005',
];

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function args() {
  const parsed = Object.fromEntries(
    process.argv.slice(2).map(item => {
      const [key, value = 'true'] = item.replace(/^--/, '').split('=', 2);
      return [key, value];
    }),
  );
  const mode = parsed.mode as Mode;
  if (!['preflight', 'transitions', 'trajectories'].includes(mode)) {
    throw new Error('--mode=preflight|transitions|trajectories is required');
  }
  return { mode, concurrency: Number(parsed.concurrency ?? 4) };
}

async function existingIds(file: string): Promise<Set<string>> {
  try {
    const content = await readFile(file, 'utf8');
    return new Set(
      content
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line).id as string),
    );
  } catch (error: any) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function pool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, concurrency) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    }),
  );
}

async function transitionRecord(testCase: TransitionCase) {
  const result = await runGpt56Sol({
    existingMemories: testCase.existing_memories,
    newFact: testCase.new_fact,
  });
  return {
    id: testCase.id,
    controller: 'gpt56sol',
    model: 'openai/gpt-5.6-sol',
    gold_operation: testCase.gold_operation,
    gold_target: testCase.gold_target,
    pred_operation: result.prediction.operation,
    pred_target: result.prediction.target,
    operation_correct: result.prediction.operation === testCase.gold_operation,
    target_correct: result.prediction.target === testCase.gold_target,
    joint_correct:
      result.prediction.operation === testCase.gold_operation &&
      result.prediction.target === testCase.gold_target,
    slices: testCase.slices,
    source: testCase.source,
    input: {
      existing_memories: testCase.existing_memories,
      new_fact: testCase.new_fact,
    },
    ...result,
  };
}

async function preflight() {
  const document = JSON.parse(
    await readFile('data/memops_transition_cases.json', 'utf8'),
  ) as { cases: TransitionCase[] };
  const cases = PREFLIGHT_IDS.map(
    id => document.cases.find(item => item.id === id) as TransitionCase,
  );
  const records = [];
  for (const testCase of cases) {
    const record = await transitionRecord(testCase);
    records.push(record);
    console.log(
      `[preflight ${records.length}/5] ${testCase.id} parse=${record.parse_error ?? 'OK'}`,
    );
  }
  const protocolRaw = await readFile('phase3/gpt56sol_protocol.json');
  const pass =
    records.length === 5 && records.every(record => record.parse_error === null);
  const report = {
    pass,
    parse_successes: records.filter(record => record.parse_error === null).length,
    total: records.length,
    protocol_sha256: sha256(protocolRaw),
    protocol_file: 'phase3/gpt56sol_protocol.json',
    records,
  };
  await writeFile(
    'results/phase3/preflight_gpt56sol.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!pass) {
    throw new Error('GPT-5.6 Sol preflight did not achieve 5/5 parse success.');
  }
  await writeFile(
    'phase3/gpt56sol_frozen_manifest.json',
    `${JSON.stringify(
      {
        frozen_after_preflight: true,
        protocol_sha256: report.protocol_sha256,
        preflight_result_sha256: sha256(
          `${JSON.stringify(report, null, 2)}\n`,
        ),
        model: 'openai/gpt-5.6-sol',
        reasoning_effort: 'medium',
        max_completion_tokens: 512,
        transition_cases_sha256:
          '6156f02056c9dcf5d890cbcdc5c3db7a33698b4a5ba2fa0283da668b5d475447',
        trajectories_sha256:
          '92b27bdacba25fc7631b77ddc9b913ef2ef8b640fd2c702a445ba3996a439ca0',
      },
      null,
      2,
    )}\n`,
  );
}

async function transitions(concurrency: number) {
  const document = JSON.parse(
    await readFile('data/memops_transition_cases.json', 'utf8'),
  ) as { cases: TransitionCase[] };
  const output = 'results/phase3/raw/transitions_gpt56sol.jsonl';
  const done = await existingIds(output);
  const remaining = document.cases.filter(item => !done.has(item.id));
  let completed = done.size;
  await pool(remaining, concurrency, async testCase => {
    const record = await transitionRecord(testCase);
    await appendFile(output, `${JSON.stringify(record)}\n`);
    completed += 1;
    console.log(`[GPT transitions ${completed}/300] ${testCase.id}`);
  });
}

async function runTrajectory(trajectory: Trajectory) {
  let state = cloneState(trajectory.initial_state);
  const maxCanonicalId = Math.max(
    0,
    ...Object.values(trajectory.canonical_memory_ids).map(id =>
      Number(/^M(\d+)$/.exec(id)?.[1] ?? 0),
    ),
  );
  const steps = [];
  for (const step of trajectory.steps) {
    const preState = cloneState(state);
    const inputMemories = renderState(preState);
    const result = await runGpt56Sol({
      existingMemories: inputMemories,
      newFact: step.new_fact,
    });
    const canonicalId =
      trajectory.canonical_memory_ids[step.executor.semantic_target_id] ??
      `M${maxCanonicalId + 1}`;
    const execution = executePrediction({
      state,
      prediction: result.prediction,
      payload: step.executor,
      canonicalId,
      maxCanonicalId,
    });
    state = execution.state;
    steps.push({
      step_id: step.step_id,
      gold_operation: step.gold_operation,
      gold_target: step.gold_target,
      pred_operation: result.prediction.operation,
      pred_target: result.prediction.target,
      operation_correct: result.prediction.operation === step.gold_operation,
      target_correct: result.prediction.target === step.gold_target,
      joint_correct:
        result.prediction.operation === step.gold_operation &&
        result.prediction.target === step.gold_target,
      state_correct: statesEqual(state, step.gold_post_state),
      slices: step.slices,
      source: step.source,
      input: { existing_memories: inputMemories, new_fact: step.new_fact },
      controller_pre_state: preState,
      gold_pre_state: step.gold_pre_state,
      executor_action: execution.action,
      executor_error: execution.error,
      controller_post_state: cloneState(state),
      gold_post_state: step.gold_post_state,
      ...result,
    });
  }
  return {
    id: trajectory.id,
    controller: 'gpt56sol',
    model: 'openai/gpt-5.6-sol',
    source_file: trajectory.source_file,
    initial_state: trajectory.initial_state,
    steps,
    controller_final_state: state,
    gold_final_state: trajectory.gold_final_state,
    final_state_correct: statesEqual(state, trajectory.gold_final_state),
  };
}

async function trajectories(concurrency: number) {
  const document = JSON.parse(
    await readFile('data/memops_trajectories.json', 'utf8'),
  ) as { trajectories: Trajectory[] };
  const output = 'results/phase3/raw/trajectories_gpt56sol.jsonl';
  const done = await existingIds(output);
  const remaining = document.trajectories.filter(item => !done.has(item.id));
  let completed = done.size;
  await pool(remaining, concurrency, async trajectory => {
    const record = await runTrajectory(trajectory);
    await appendFile(output, `${JSON.stringify(record)}\n`);
    completed += 1;
    console.log(`[GPT trajectories ${completed}/25] ${trajectory.id}`);
  });
}

async function main() {
  const options = args();
  await mkdir('results/phase3/raw', { recursive: true });
  if (options.mode === 'preflight') await preflight();
  else if (options.mode === 'transitions') await transitions(options.concurrency);
  else await trajectories(options.concurrency);
}

await main();

