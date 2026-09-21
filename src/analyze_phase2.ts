import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  CONTROLLER_MODELS,
  FROZEN_POLICY,
  type ControllerName,
} from './phase2_controllers.js';

type Operation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';
type TransitionResult = {
  id: string;
  controller: ControllerName;
  gold_operation: Operation;
  gold_target: string;
  pred_operation: Operation;
  pred_target: string;
  operation_correct: boolean;
  target_correct: boolean;
  joint_correct: boolean;
  operation_probabilities: Record<string, number> | null;
  target_probabilities: Record<string, number> | null;
  latency_ms: number;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
  };
  parse_error: string | null;
  attempts: number;
  slices: Record<string, boolean>;
  input: { existing_memories: unknown[]; new_fact: string };
  [key: string]: unknown;
};
type TrajectoryStepResult = TransitionResult & { state_correct: boolean };
type TrajectoryResult = {
  id: string;
  controller: ControllerName;
  steps: TrajectoryStepResult[];
  final_state_correct: boolean;
  [key: string]: unknown;
};

const CONTROLLERS: ControllerName[] = ['jev', 'strong', 'local'];
const OPERATIONS: Operation[] = ['ADD', 'UPDATE', 'DELETE', 'NOOP'];
const SLICE_NAMES = [
  'ADD',
  'UPDATE',
  'DELETE',
  'NOOP',
  'tentative',
  'retraction',
  'recency_trap',
  'multi_target',
  'candidate_disambiguation',
  'update_chain',
] as const;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function jsonl<T>(file: string): Promise<T[]> {
  return (await readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function accuracy(correct: number, total: number) {
  return {
    correct,
    total,
    value: total ? round(correct / total) : null,
  };
}

function macroF1(rows: TransitionResult[]) {
  const labels = OPERATIONS.filter(label =>
    rows.some(row => row.gold_operation === label),
  );
  const perClass = Object.fromEntries(
    labels.map(label => {
      const tp = rows.filter(
        row => row.gold_operation === label && row.pred_operation === label,
      ).length;
      const fp = rows.filter(
        row => row.gold_operation !== label && row.pred_operation === label,
      ).length;
      const fn = rows.filter(
        row => row.gold_operation === label && row.pred_operation !== label,
      ).length;
      const precision = tp + fp ? tp / (tp + fp) : 0;
      const recall = tp + fn ? tp / (tp + fn) : 0;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      return [label, { precision: round(precision), recall: round(recall), f1: round(f1) }];
    }),
  );
  return {
    value: round(
      Object.values(perClass).reduce((sum, item) => sum + item.f1, 0) /
        labels.length,
    ),
    per_class: perClass,
  };
}

function transitionMetrics(rows: TransitionResult[]) {
  const targeted = rows.filter(row =>
    row.gold_operation === 'UPDATE' || row.gold_operation === 'DELETE',
  );
  return {
    count: rows.length,
    operation_accuracy: accuracy(
      rows.filter(row => row.operation_correct).length,
      rows.length,
    ),
    operation_macro_f1: macroF1(rows),
    target_accuracy_all_cases: accuracy(
      rows.filter(row => row.target_correct).length,
      rows.length,
    ),
    target_accuracy_target_required: accuracy(
      targeted.filter(row => row.target_correct).length,
      targeted.length,
    ),
    joint_accuracy: accuracy(
      rows.filter(row => row.joint_correct).length,
      rows.length,
    ),
  };
}

function trajectoryMetrics(rows: TrajectoryResult[]) {
  const steps = rows.flatMap(row => row.steps);
  const intermediate = rows.flatMap(row => row.steps.slice(0, -1));
  let propagationWrong = 0;
  let propagationTotal = 0;
  for (const trajectory of rows) {
    const firstError = trajectory.steps.findIndex(step => !step.joint_correct);
    if (firstError < 0) continue;
    const downstream = trajectory.steps.slice(firstError + 1);
    propagationWrong += downstream.filter(step => !step.state_correct).length;
    propagationTotal += downstream.length;
  }
  return {
    trajectories: rows.length,
    steps: steps.length,
    step_accuracy: accuracy(
      steps.filter(step => step.joint_correct).length,
      steps.length,
    ),
    operation_accuracy: accuracy(
      steps.filter(step => step.operation_correct).length,
      steps.length,
    ),
    intermediate_state_accuracy: accuracy(
      intermediate.filter(step => step.state_correct).length,
      intermediate.length,
    ),
    final_state_accuracy: accuracy(
      rows.filter(row => row.final_state_correct).length,
      rows.length,
    ),
    error_propagation_rate: accuracy(
      propagationWrong,
      propagationTotal,
    ),
  };
}

function confusion(rows: TransitionResult[]) {
  return Object.fromEntries(
    OPERATIONS.map(gold => [
      gold,
      Object.fromEntries(
        OPERATIONS.map(predicted => [
          predicted,
          rows.filter(
            row => row.gold_operation === gold && row.pred_operation === predicted,
          ).length,
        ]),
      ),
    ]),
  );
}

function efficiency(
  transitions: TransitionResult[],
  trajectories: TrajectoryResult[],
) {
  const rows = [...transitions, ...trajectories.flatMap(item => item.steps)];
  const latency = rows.map(item => item.latency_ms);
  const sumNullable = (key: 'input_tokens' | 'output_tokens' | 'cost_usd') => {
    const values = rows.map(item => item.usage[key]).filter(value => value !== null) as number[];
    return values.length === rows.length
      ? round(values.reduce((sum, value) => sum + value, 0), 9)
      : null;
  };
  return {
    decisions: rows.length,
    median_latency_ms: round(percentile(latency, 0.5) as number, 3),
    mean_latency_ms: round(mean(latency) as number, 3),
    p90_latency_ms: round(percentile(latency, 0.9) as number, 3),
    total_input_tokens: sumNullable('input_tokens'),
    total_output_tokens: sumNullable('output_tokens'),
    total_controller_cost_usd: sumNullable('cost_usd'),
    mean_controller_cost_usd: round(
      (sumNullable('cost_usd') ?? 0) / rows.length,
      9,
    ),
    parse_errors: rows.filter(item => item.parse_error !== null).length,
    retried_decisions: rows.filter(item => item.attempts > 1).length,
  };
}

function jevConfidence(rows: TransitionResult[]) {
  const enriched = rows.map(row => {
    const operationConfidence =
      row.operation_probabilities?.[row.pred_operation] ?? 0;
    const targetConfidence =
      row.pred_operation === 'UPDATE' || row.pred_operation === 'DELETE'
        ? (row.target_probabilities?.[row.pred_target] ?? 0)
        : 1;
    return {
      ...row,
      operationConfidence,
      targetConfidence,
      jointConfidence: operationConfidence * targetConfidence,
    };
  });
  const distribution = (correct: boolean) => {
    const values = enriched
      .filter(item => item.joint_correct === correct)
      .map(item => item.jointConfidence);
    return {
      count: values.length,
      mean: round(mean(values) as number),
      median: round(percentile(values, 0.5) as number),
      p10: round(percentile(values, 0.1) as number),
      p90: round(percentile(values, 0.9) as number),
      min: round(Math.min(...values)),
      max: round(Math.max(...values)),
    };
  };
  const bucket = (predicate: (value: number) => boolean) => {
    const items = enriched.filter(item => predicate(item.jointConfidence));
    return accuracy(items.filter(item => item.joint_correct).length, items.length);
  };
  const bins = Array.from({ length: 10 }, (_, index) => {
    const lower = index / 10;
    const upper = (index + 1) / 10;
    const items = enriched.filter(item =>
      index === 9
        ? item.jointConfidence >= lower && item.jointConfidence <= upper
        : item.jointConfidence >= lower && item.jointConfidence < upper,
    );
    return {
      lower,
      upper,
      count: items.length,
      mean_confidence: items.length
        ? round(mean(items.map(item => item.jointConfidence)) as number)
        : null,
      accuracy: items.length
        ? round(items.filter(item => item.joint_correct).length / items.length)
        : null,
    };
  });
  const ece = bins.reduce((sum, bin) => {
    if (!bin.count || bin.accuracy === null || bin.mean_confidence === null) return sum;
    return (
      sum +
      (bin.count / enriched.length) * Math.abs(bin.accuracy - bin.mean_confidence)
    );
  }, 0);
  const brier = mean(
    enriched.map(item =>
      OPERATIONS.reduce((sum, label) => {
        const probability = item.operation_probabilities?.[label] ?? 0;
        const truth = item.gold_operation === label ? 1 : 0;
        return sum + (probability - truth) ** 2;
      }, 0),
    ),
  );
  return {
    confidence_definition:
      'P(predicted operation) times P(predicted target) for UPDATE/DELETE; target factor is 1 for ADD/NOOP.',
    correct_predictions: distribution(true),
    wrong_predictions: distribution(false),
    accuracy_at_confidence_gte_0_9: bucket(value => value >= 0.9),
    accuracy_at_confidence_gte_0_8: bucket(value => value >= 0.8),
    accuracy_at_confidence_lt_0_8: bucket(value => value < 0.8),
    ece_10_equal_width_bins: round(ece),
    ece_bins: bins,
    multiclass_operation_brier_score: round(brier as number),
  };
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pairedComparison(jev: TransitionResult[], strong: TransitionResult[]) {
  const byId = new Map(strong.map(item => [item.id, item]));
  const pairs = jev.map(item => [item, byId.get(item.id) as TransitionResult] as const);
  const delta =
    mean(pairs.map(([a]) => Number(a.joint_correct)))! -
    mean(pairs.map(([, b]) => Number(b.joint_correct)))!;
  const random = mulberry32(20260920);
  const bootstrap: number[] = [];
  for (let sample = 0; sample < 20_000; sample += 1) {
    let sum = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      sum += Number(pair[0].joint_correct) - Number(pair[1].joint_correct);
    }
    bootstrap.push(sum / pairs.length);
  }
  const jevOnly = pairs.filter(([a, b]) => a.joint_correct && !b.joint_correct).length;
  const strongOnly = pairs.filter(([a, b]) => !a.joint_correct && b.joint_correct).length;
  const discordant = jevOnly + strongOnly;
  const tail = Math.min(jevOnly, strongOnly);
  let probability = 0;
  let combination = 1;
  for (let k = 0; k <= tail; k += 1) {
    if (k > 0) combination = (combination * (discordant - k + 1)) / k;
    probability += combination / 2 ** discordant;
  }
  return {
    delta_jev_minus_strong: round(delta),
    bootstrap_samples: 20_000,
    bootstrap_95_percentile_ci: [
      round(percentile(bootstrap, 0.025) as number),
      round(percentile(bootstrap, 0.975) as number),
    ],
    paired_disagreements: {
      both_correct: pairs.filter(([a, b]) => a.joint_correct && b.joint_correct).length,
      jev_only_correct: jevOnly,
      strong_only_correct: strongOnly,
      both_wrong: pairs.filter(([a, b]) => !a.joint_correct && !b.joint_correct).length,
    },
    mcnemar_exact_two_sided_p: round(Math.min(1, 2 * probability), 9),
  };
}

async function main() {
  const transitionByController = Object.fromEntries(
    await Promise.all(
      CONTROLLERS.map(async controller => [
        controller,
        await jsonl<TransitionResult>(`results/raw/transitions_${controller}.jsonl`),
      ]),
    ),
  ) as Record<ControllerName, TransitionResult[]>;
  const trajectoryByController = Object.fromEntries(
    await Promise.all(
      CONTROLLERS.map(async controller => [
        controller,
        await jsonl<TrajectoryResult>(`results/raw/trajectories_${controller}.jsonl`),
      ]),
    ),
  ) as Record<ControllerName, TrajectoryResult[]>;

  for (const controller of CONTROLLERS) {
    if (transitionByController[controller].length !== 300) {
      throw new Error(`${controller}: expected 300 transitions`);
    }
    if (new Set(transitionByController[controller].map(item => item.id)).size !== 300) {
      throw new Error(`${controller}: duplicate transition IDs`);
    }
    if (trajectoryByController[controller].length !== 25) {
      throw new Error(`${controller}: expected 25 trajectories`);
    }
  }

  const transitionCasesRaw = await readFile('data/memops_transition_cases.json');
  const trajectoriesRaw = await readFile('data/memops_trajectories.json');
  const policyHash = sha256(JSON.stringify(FROZEN_POLICY));
  const expectedPolicyHash =
    'e824dfdeffe485ddde0fa6fbe5500c73874335c9ec57f473f74e463b4bdc2393';
  if (policyHash !== expectedPolicyHash) {
    throw new Error(`Frozen Jev policy hash changed: ${policyHash}`);
  }

  const controllerSummary = Object.fromEntries(
    CONTROLLERS.map(controller => {
      const transitions = transitionByController[controller];
      const trajectories = trajectoryByController[controller];
      return [
        controller,
        {
          model: CONTROLLER_MODELS[controller],
          layer_a: transitionMetrics(transitions),
          slices: Object.fromEntries(
            SLICE_NAMES.map(name => [
              name,
              transitionMetrics(transitions.filter(item => item.slices[name])),
            ]),
          ),
          confusion_matrix_gold_by_prediction: confusion(transitions),
          layer_b: trajectoryMetrics(trajectories),
          efficiency_controller_only: efficiency(transitions, trajectories),
        },
      ];
    }),
  );

  const commonMetadata = {
    generated_at: new Date().toISOString(),
    memops_commit: '312af65e2c7b6d1b70f062ffa8b4cde32aaf6f35',
    transition_cases_sha256: sha256(transitionCasesRaw),
    trajectories_sha256: sha256(trajectoriesRaw),
    executor_spec_sha256: sha256(await readFile('EXECUTOR_SPEC.md')),
    adapter_audit_sha256: sha256(await readFile('MEMOPS_ADAPTER_AUDIT.md')),
    jev_policy_sha256: policyHash,
    controller_models: CONTROLLER_MODELS,
  };

  const transitionSummary = {
    ...commonMetadata,
    controllers: controllerSummary,
    jev_confidence: jevConfidence(transitionByController.jev),
    paired_comparison_jev_vs_strong: pairedComparison(
      transitionByController.jev,
      transitionByController.strong,
    ),
  };
  const trajectorySummary = {
    ...commonMetadata,
    controllers: Object.fromEntries(
      CONTROLLERS.map(controller => [
        controller,
        (controllerSummary as any)[controller].layer_b,
      ]),
    ),
  };

  const combinedTransitions = CONTROLLERS.flatMap(controller =>
    transitionByController[controller],
  ).sort(
    (a, b) =>
      a.id.localeCompare(b.id) ||
      CONTROLLERS.indexOf(a.controller) - CONTROLLERS.indexOf(b.controller),
  );
  const combinedTrajectories = CONTROLLERS.flatMap(controller =>
    trajectoryByController[controller],
  ).sort(
    (a, b) =>
      a.id.localeCompare(b.id) ||
      CONTROLLERS.indexOf(a.controller) - CONTROLLERS.indexOf(b.controller),
  );

  await mkdir('results', { recursive: true });
  await writeFile(
    'results/memops_transition_results.jsonl',
    `${combinedTransitions.map(item => JSON.stringify(item)).join('\n')}\n`,
  );
  await writeFile(
    'results/memops_transition_results.json',
    `${JSON.stringify(transitionSummary, null, 2)}\n`,
  );
  await writeFile(
    'results/memops_trajectory_results.jsonl',
    `${combinedTrajectories.map(item => JSON.stringify(item)).join('\n')}\n`,
  );
  await writeFile(
    'results/memops_trajectory_results.json',
    `${JSON.stringify(trajectorySummary, null, 2)}\n`,
  );
  console.log(JSON.stringify(transitionSummary, null, 2));
}

await main();
