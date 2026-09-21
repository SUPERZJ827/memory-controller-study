import { appendFile, mkdir, readFile } from 'node:fs/promises';
import {
  CONTROLLER_MODELS,
  runController,
  type ControllerName,
} from './phase2_controllers.js';
import {
  cloneState,
  executePrediction,
  renderState,
  statesEqual,
  type StateEntry,
} from './phase2_executor.js';

type Layer = 'transitions' | 'trajectories';

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

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(item => {
      const [key, value = 'true'] = item.replace(/^--/, '').split('=', 2);
      return [key, value];
    }),
  );
  const layer = args.layer as Layer;
  const controller = args.controller as ControllerName;
  if (!['transitions', 'trajectories'].includes(layer)) {
    throw new Error('--layer=transitions|trajectories is required');
  }
  if (!['jev', 'strong', 'local'].includes(controller)) {
    throw new Error('--controller=jev|strong|local is required');
  }
  const concurrency = Number(args.concurrency ?? 4);
  const max = args.max ? Number(args.max) : undefined;
  return { layer, controller, concurrency, max };
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
  worker: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function runTransitions(
  controller: ControllerName,
  concurrency: number,
  max?: number,
) {
  const document = JSON.parse(
    await readFile('data/memops_transition_cases.json', 'utf8'),
  ) as { cases: TransitionCase[] };
  const output = `results/raw/transitions_${controller}.jsonl`;
  const done = await existingIds(output);
  const remaining = document.cases.filter(item => !done.has(item.id)).slice(0, max);
  let completed = done.size;
  await pool(remaining, concurrency, async testCase => {
    const result = await runController({
      controller,
      existingMemories: testCase.existing_memories,
      newFact: testCase.new_fact,
    });
    const record = {
      id: testCase.id,
      controller,
      model: CONTROLLER_MODELS[controller],
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
    await appendFile(output, `${JSON.stringify(record)}\n`);
    completed += 1;
    console.log(`[${controller} transitions ${completed}/${document.cases.length}] ${testCase.id}`);
  });
}

async function runTrajectory(
  controller: ControllerName,
  trajectory: Trajectory,
) {
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
    const result = await runController({
      controller,
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
    controller,
    model: CONTROLLER_MODELS[controller],
    source_file: trajectory.source_file,
    initial_state: trajectory.initial_state,
    steps,
    controller_final_state: state,
    gold_final_state: trajectory.gold_final_state,
    final_state_correct: statesEqual(state, trajectory.gold_final_state),
  };
}

async function runTrajectories(
  controller: ControllerName,
  concurrency: number,
  max?: number,
) {
  const document = JSON.parse(
    await readFile('data/memops_trajectories.json', 'utf8'),
  ) as { trajectories: Trajectory[] };
  const output = `results/raw/trajectories_${controller}.jsonl`;
  const done = await existingIds(output);
  const remaining = document.trajectories
    .filter(item => !done.has(item.id))
    .slice(0, max);
  let completed = done.size;
  await pool(remaining, concurrency, async trajectory => {
    const record = await runTrajectory(controller, trajectory);
    await appendFile(output, `${JSON.stringify(record)}\n`);
    completed += 1;
    console.log(
      `[${controller} trajectories ${completed}/${document.trajectories.length}] ${trajectory.id}`,
    );
  });
}

async function main() {
  const { layer, controller, concurrency, max } = parseArgs();
  await mkdir('results/raw', { recursive: true });
  if (layer === 'transitions') {
    await runTransitions(controller, concurrency, max);
  } else {
    await runTrajectories(controller, concurrency, max);
  }
}

await main();

