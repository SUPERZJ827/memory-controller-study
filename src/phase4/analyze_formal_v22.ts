import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = 'results/phase4_formal_v17';
const FREEZE = 'phase4/formal_freeze_v15.json';
const LEDGER = path.join(ROOT, 'ledger.sqlite');
const BUDGET_LEDGER = 'results/phase4_low_budget_v2/campaign_budget.sqlite';
const EXPECTED_HISTORIES = 24;
const EXPECTED_RESAMPLES = 20_000;
const MUTATING = new Set(['ADD', 'UPDATE', 'DELETE']);
const OPERATIONS = ['ADD', 'UPDATE', 'DELETE', 'NOOP', 'INVALID_OR_OTHER'] as const;

type Arm = 'B' | 'C';
type Json = Record<string, any>;
type Attempt = {
  call_key: string;
  stage: string;
  scope: string;
  trajectory_id: string;
  step_index: number;
  logical_call_id: string;
  provider: string | null;
  model: string | null;
  status: string;
  latency_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_input_tokens: number;
  actual_physical_cost_usd: number;
};
type StepRow = {
  arm: Arm;
  step: number;
  context: Json;
  evidence: { text: string; kind: string; source_turns: number[] };
  prediction: {
    decision: { operation: string; target: string };
    valid: boolean;
    error: string | null;
    call_ids: string[];
  };
  execution_error?: string;
  before: Json;
  after: Json;
};
type HistoryRecord = {
  order: number;
  question_id: string;
  slice: 'knowledge-update' | 'abstention';
  sessions: number;
  facts: number;
  B_correct: boolean;
  C_correct: boolean;
  B_judge_valid: boolean;
  C_judge_valid: boolean;
  B_active: number;
  C_active: number;
  B_events: number;
  C_events: number;
  B_answer_retrieved_active: number;
  B_answer_retrieved_archive: number;
  C_answer_retrieved_active: number;
  C_answer_retrieved_archive: number;
};

function readJson(file: string): Json {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function distribution(values: number[]): Json {
  return {
    n: values.length,
    mean: values.length ? sum(values) / values.length : null,
    median: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function bootstrapPairedDelta(
  pairs: Array<{ B: boolean; C: boolean }>,
  resamples: number,
  seed: number,
): Json {
  if (!pairs.length) throw new Error('Cannot bootstrap an empty paired sample');
  const random = mulberry32(seed);
  const deltas = new Array<number>(resamples);
  for (let replicate = 0; replicate < resamples; replicate += 1) {
    let delta = 0;
    for (let draw = 0; draw < pairs.length; draw += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      delta += Number(pair.C) - Number(pair.B);
    }
    deltas[replicate] = delta / pairs.length;
  }
  return {
    method: 'paired percentile bootstrap; linear-interpolated empirical quantiles',
    estimand: 'C accuracy minus B accuracy',
    resamples,
    seed,
    ci95: [quantile(deltas, 0.025), quantile(deltas, 0.975)],
    ci95_percentage_points: [
      (quantile(deltas, 0.025) ?? 0) * 100,
      (quantile(deltas, 0.975) ?? 0) * 100,
    ],
  };
}

function binomialCoefficient(n: number, k: number): number {
  const effective = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= effective; index += 1) {
    value = value * (n - effective + index) / index;
  }
  return value;
}

function exactMcNemar(bOnly: number, cOnly: number): Json {
  const discordant = bOnly + cOnly;
  if (!discordant) return { discordant: 0, p_value_two_sided_exact: 1 };
  const tail = Math.min(bOnly, cOnly);
  let lowerProbability = 0;
  for (let k = 0; k <= tail; k += 1) {
    lowerProbability += binomialCoefficient(discordant, k) * (0.5 ** discordant);
  }
  return { discordant, p_value_two_sided_exact: Math.min(1, 2 * lowerProbability) };
}

function qaSummary(records: HistoryRecord[]): Json {
  const BCorrect = records.filter((record) => record.B_correct).length;
  const CCorrect = records.filter((record) => record.C_correct).length;
  return {
    n: records.length,
    B: { correct: BCorrect, accuracy: records.length ? BCorrect / records.length : null },
    C: { correct: CCorrect, accuracy: records.length ? CCorrect / records.length : null },
    delta_C_minus_B: records.length ? (CCorrect - BCorrect) / records.length : null,
    delta_C_minus_B_percentage_points: records.length ? 100 * (CCorrect - BCorrect) / records.length : null,
    judge_parse_failures: {
      B: records.filter((record) => !record.B_judge_valid).length,
      C: records.filter((record) => !record.C_judge_valid).length,
    },
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function writeExclusive(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { flag: 'wx' });
}

function operationBucket(operation: string): typeof OPERATIONS[number] {
  return (OPERATIONS as readonly string[]).includes(operation)
    ? operation as typeof OPERATIONS[number]
    : 'INVALID_OR_OTHER';
}

function callGroupKey(attempt: Attempt): string {
  return [attempt.scope, attempt.stage, attempt.provider ?? '', attempt.model ?? ''].join('\0');
}

function main(): void {
  const terminal = readJson(path.join(ROOT, 'outcome.json'));
  if (terminal.status !== 'COMPLETE' || terminal.histories !== EXPECTED_HISTORIES) {
    throw new Error(`Formal run is not terminal 24/24: ${JSON.stringify({
      status: terminal.status, histories: terminal.histories,
    })}`);
  }
  const freeze = readJson(FREEZE);
  if (freeze.n !== EXPECTED_HISTORIES || freeze.ids?.length !== EXPECTED_HISTORIES) {
    throw new Error('Frozen membership is not the expected 24 histories');
  }
  const resamples = Number(freeze.scoring?.bootstrap_resamples);
  const bootstrapSeed = Number(freeze.scoring?.bootstrap_seed);
  if (resamples !== EXPECTED_RESAMPLES || !Number.isInteger(bootstrapSeed)) {
    throw new Error('Frozen bootstrap configuration changed');
  }

  const outputFiles = [
    path.join(ROOT, 'analysis.json'),
    path.join(ROOT, 'analysis_history_outcomes.csv'),
    path.join(ROOT, 'analysis_cost_breakdown.csv'),
    path.join(ROOT, 'analysis_controller_steps.csv'),
    path.join(ROOT, 'analysis_operation_breakdown.csv'),
  ];
  const existingOutput = outputFiles.find((file) => fs.existsSync(file));
  if (existingOutput) throw new Error(`Analysis output already exists; refusing overwrite: ${existingOutput}`);

  const ledger = new DatabaseSync(LEDGER, { readOnly: true });
  const attempts = ledger.prepare(`
    SELECT call_key, stage, scope, trajectory_id, step_index, logical_call_id, provider, model, status,
           latency_ms, input_tokens, output_tokens, reasoning_tokens, cached_input_tokens,
           actual_physical_cost_usd
    FROM call_attempts
    ORDER BY trajectory_id, step_index, scope, attempt_no
  `).all() as unknown as Attempt[];
  ledger.close();
  const runningAttempts = attempts.filter((attempt) => attempt.status === 'running');
  if (runningAttempts.length) throw new Error(`Ledger still has ${runningAttempts.length} running attempts`);

  const historyRecords: HistoryRecord[] = [];
  const steps: Record<Arm, StepRow[]> = { B: [], C: [] };
  const pairedSteps: Array<{ history: string; step: number; B: StepRow; C: StepRow }> = [];

  for (const frozenItem of freeze.ids as Json[]) {
    const order = Number(frozenItem.order);
    const questionId = String(frozenItem.question_id);
    const directory = path.join(ROOT, 'histories', `${String(order).padStart(2, '0')}-${questionId}`);
    const outcome = readJson(path.join(directory, 'outcome.json'));
    const qa = readJson(path.join(directory, 'qa.json'));
    const states = readJson(path.join(directory, 'final_states.json'));
    if (outcome.status !== 'COMPLETE' || outcome.order !== order || outcome.question_id !== questionId) {
      throw new Error(`History outcome mismatch: ${questionId}`);
    }
    if (outcome.sessions !== frozenItem.chronological_sessions) {
      throw new Error(`History session count mismatch: ${questionId}`);
    }
    const facts = Number(outcome.extracted_facts);
    const BGrade = qa.grades?.B?.correct;
    const CGrade = qa.grades?.C?.correct;
    const slice = String(qa.rubric).includes('abstention') ? 'abstention' : 'knowledge-update';
    const retrievedCounts = (arm: Arm) => {
      const retrieved = Array.isArray(qa.answers?.[arm]?.retrieved) ? qa.answers[arm].retrieved : [];
      return {
        active: retrieved.filter((item: Json) => item.status === 'active').length,
        archive: retrieved.filter((item: Json) => item.status !== 'active').length,
      };
    };
    const BRetrieved = retrievedCounts('B');
    const CRetrieved = retrievedCounts('C');
    historyRecords.push({
      order,
      question_id: questionId,
      slice,
      sessions: Number(outcome.sessions),
      facts,
      B_correct: BGrade === true,
      C_correct: CGrade === true,
      B_judge_valid: typeof BGrade === 'boolean',
      C_judge_valid: typeof CGrade === 'boolean',
      B_active: states.B.active.length,
      C_active: states.C.active.length,
      B_events: states.B.events.length,
      C_events: states.C.events.length,
      B_answer_retrieved_active: BRetrieved.active,
      B_answer_retrieved_archive: BRetrieved.archive,
      C_answer_retrieved_active: CRetrieved.active,
      C_answer_retrieved_archive: CRetrieved.archive,
    });
    if (states.B.events.length !== facts || states.C.events.length !== facts) {
      throw new Error(`Event/fact count mismatch: ${questionId}`);
    }
    for (let step = 0; step < facts; step += 1) {
      const prefix = String(step).padStart(4, '0');
      const B = readJson(path.join(directory, 'steps', `${prefix}-B.json`)) as StepRow;
      const C = readJson(path.join(directory, 'steps', `${prefix}-C.json`)) as StepRow;
      if (B.arm !== 'B' || C.arm !== 'C' || B.step !== step || C.step !== step ||
          JSON.stringify(B.context) !== JSON.stringify(C.context) ||
          JSON.stringify(B.evidence) !== JSON.stringify(C.evidence)) {
        throw new Error(`Unpaired step artifacts: ${questionId}/${step}`);
      }
      steps.B.push(B);
      steps.C.push(C);
      pairedSteps.push({ history: questionId, step, B, C });
    }
  }
  if (historyRecords.length !== EXPECTED_HISTORIES) throw new Error('Not all frozen histories were loaded');

  const qaPairs = historyRecords.map((record) => ({ B: record.B_correct, C: record.C_correct }));
  const pairedTable = {
    both_correct: qaPairs.filter((pair) => pair.B && pair.C).length,
    B_only_correct: qaPairs.filter((pair) => pair.B && !pair.C).length,
    C_only_correct: qaPairs.filter((pair) => !pair.B && pair.C).length,
    both_wrong: qaPairs.filter((pair) => !pair.B && !pair.C).length,
  };
  const qaAnalysis = {
    convention: 'A null/unparseable official judge grade is counted as incorrect and separately reported.',
    overall: qaSummary(historyRecords),
    slices: {
      knowledge_update: qaSummary(historyRecords.filter((record) => record.slice === 'knowledge-update')),
      abstention: qaSummary(historyRecords.filter((record) => record.slice === 'abstention')),
    },
    paired_table: pairedTable,
    bootstrap: bootstrapPairedDelta(qaPairs, resamples, bootstrapSeed),
    mcnemar: exactMcNemar(pairedTable.B_only_correct, pairedTable.C_only_correct),
  };

  const operationByArm: Record<Arm, Json> = { B: {}, C: {} };
  const operationBreakdownRows: unknown[][] = [[
    'arm', 'evidence_kind', 'cases', 'ADD', 'UPDATE', 'DELETE', 'NOOP', 'INVALID_OR_OTHER',
    'valid_predictions', 'execution_errors', 'predicted_mutations', 'successful_mutation_applications',
    'predicted_mutation_rate',
  ]];
  for (const arm of ['B', 'C'] as const) {
    const armSteps = steps[arm];
    const kinds = [...new Set(armSteps.map((row) => row.evidence.kind))].sort();
    const summarizeOperations = (rows: StepRow[]) => {
      const counts = Object.fromEntries(OPERATIONS.map((operation) => [operation, 0])) as Record<string, number>;
      for (const row of rows) counts[operationBucket(row.prediction.decision.operation)] += 1;
      const valid = rows.filter((row) => row.prediction.valid).length;
      const errors = rows.filter((row) => typeof row.execution_error === 'string').length;
      const predictedMutations = rows.filter((row) => MUTATING.has(row.prediction.decision.operation)).length;
      const appliedMutations = rows.filter((row) => row.prediction.valid &&
        MUTATING.has(row.prediction.decision.operation) && !row.execution_error).length;
      return {
        cases: rows.length,
        operations: counts,
        valid_predictions: valid,
        invalid_predictions: rows.length - valid,
        execution_errors: errors,
        predicted_mutations: predictedMutations,
        successful_mutation_applications: appliedMutations,
        predicted_mutation_rate: rows.length ? predictedMutations / rows.length : null,
      };
    };
    const overall = summarizeOperations(armSteps);
    const byKind = Object.fromEntries(kinds.map((kind) => [kind,
      summarizeOperations(armSteps.filter((row) => row.evidence.kind === kind))]));
    operationByArm[arm] = { overall, by_evidence_kind: byKind };
    for (const [kind, summary] of [['ALL', overall], ...Object.entries(byKind)] as Array<[string, any]>) {
      operationBreakdownRows.push([
        arm, kind, summary.cases,
        ...OPERATIONS.map((operation) => summary.operations[operation]),
        summary.valid_predictions, summary.execution_errors, summary.predicted_mutations,
        summary.successful_mutation_applications, summary.predicted_mutation_rate,
      ]);
    }
  }

  const operationMatrix: Record<string, Record<string, number>> = {};
  for (const pair of pairedSteps) {
    const B = operationBucket(pair.B.prediction.decision.operation);
    const C = operationBucket(pair.C.prediction.decision.operation);
    operationMatrix[B] ??= {};
    operationMatrix[B][C] = (operationMatrix[B][C] ?? 0) + 1;
  }
  const operationAgreement = pairedSteps.filter((pair) =>
    pair.B.prediction.decision.operation === pair.C.prediction.decision.operation).length;
  const mutationAgreement = pairedSteps.filter((pair) =>
    MUTATING.has(pair.B.prediction.decision.operation) ===
      MUTATING.has(pair.C.prediction.decision.operation)).length;

  const successfulAttempts = attempts.filter((attempt) => attempt.status === 'success');
  const decisionAttempts = successfulAttempts.filter((attempt) => attempt.stage === 'decision' &&
    (attempt.scope === 'B' || attempt.scope === 'C'));
  const controllerStepGroups = new Map<string, Attempt[]>();
  for (const attempt of decisionAttempts) {
    const key = `${attempt.scope}\0${attempt.trajectory_id}\0${attempt.step_index}`;
    const group = controllerStepGroups.get(key) ?? [];
    group.push(attempt);
    controllerStepGroups.set(key, group);
  }
  const controllerStepRows: Array<Json> = [];
  for (const pair of pairedSteps) {
    for (const arm of ['B', 'C'] as const) {
      const calls = controllerStepGroups.get(`${arm}\0${pair.history}\0${pair.step}`) ?? [];
      if (!calls.length) throw new Error(`Missing controller calls: ${arm}/${pair.history}/${pair.step}`);
      if (arm === 'B' && calls.length !== 1) {
        throw new Error(`B must have exactly one successful decision call: ${pair.history}/${pair.step}`);
      }
      const operationCalls = calls.filter((call) =>
        arm === 'B' ? call.logical_call_id === 'gpt-decision' : call.logical_call_id === 'jev-operation');
      const targetCalls = calls.filter((call) => call.logical_call_id === 'jev-target');
      if (operationCalls.length !== 1 || targetCalls.length > 1) {
        throw new Error(`Unexpected controller call structure: ${arm}/${pair.history}/${pair.step}`);
      }
      const stepArtifact = pair[arm];
      const artifactCallIds = [...stepArtifact.prediction.call_ids].sort();
      const ledgerCallIds = calls.map((call) => call.call_key).sort();
      if (JSON.stringify(artifactCallIds) !== JSON.stringify(ledgerCallIds)) {
        throw new Error(`Controller artifact/call-count mismatch: ${arm}/${pair.history}/${pair.step}`);
      }
      controllerStepRows.push({
        history: pair.history,
        step: pair.step,
        arm,
        evidence_kind: stepArtifact.evidence.kind,
        operation: stepArtifact.prediction.decision.operation,
        valid: stepArtifact.prediction.valid,
        execution_error: stepArtifact.execution_error ?? null,
        call_count: calls.length,
        input_tokens: sum(calls.map((call) => Number(call.input_tokens))),
        output_tokens: sum(calls.map((call) => Number(call.output_tokens))),
        reasoning_tokens: sum(calls.map((call) => Number(call.reasoning_tokens))),
        cached_input_tokens: sum(calls.map((call) => Number(call.cached_input_tokens))),
        cost_usd: sum(calls.map((call) => Number(call.actual_physical_cost_usd))),
        latency_ms: sum(calls.map((call) => Number(call.latency_ms))),
      });
    }
  }
  if (controllerStepRows.length !== pairedSteps.length * 2) {
    throw new Error('Controller step aggregation is incomplete');
  }

  const controllerByArm = Object.fromEntries((['B', 'C'] as const).map((arm) => {
    const rows = controllerStepRows.filter((row) => row.arm === arm);
    const allDecisionAttempts = attempts.filter((attempt) => attempt.scope === arm && attempt.stage === 'decision');
    return [arm, {
      decisions: rows.length,
      successful_api_calls: sum(rows.map((row) => row.call_count)),
      failed_api_attempts: allDecisionAttempts.filter((attempt) => attempt.status === 'error').length,
      tokens: {
        input: sum(rows.map((row) => row.input_tokens)),
        output: sum(rows.map((row) => row.output_tokens)),
        reasoning: sum(rows.map((row) => row.reasoning_tokens)),
        cached_input: sum(rows.map((row) => row.cached_input_tokens)),
      },
      provider_cost_usd_successful_calls: sum(rows.map((row) => row.cost_usd)),
      provider_cost_usd_all_attempts: sum(allDecisionAttempts.map((attempt) =>
        Number(attempt.actual_physical_cost_usd))),
      decision_latency_ms: distribution(rows.map((row) => row.latency_ms)),
      latency_definition: arm === 'B'
        ? 'One GPT decision call per trajectory+step.'
        : 'Jev operation latency plus target latency when a target call was required.',
    }];
  })) as unknown as Record<Arm, Json>;
  const BControllerCost = controllerByArm.B.provider_cost_usd_all_attempts;
  const CControllerCost = controllerByArm.C.provider_cost_usd_all_attempts;

  const costGroups = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const key = callGroupKey(attempt);
    const group = costGroups.get(key) ?? [];
    group.push(attempt);
    costGroups.set(key, group);
  }
  const costBreakdown = [...costGroups.values()].map((group) => {
    const successful = group.filter((attempt) => attempt.status === 'success');
    const allLatency = group.flatMap((attempt) => attempt.latency_ms === null ? [] : [Number(attempt.latency_ms)]);
    const successLatency = successful.flatMap((attempt) =>
      attempt.latency_ms === null ? [] : [Number(attempt.latency_ms)]);
    return {
      scope: group[0].scope,
      stage: group[0].stage,
      provider: group[0].provider,
      model: group[0].model,
      attempts: group.length,
      successes: successful.length,
      errors: group.filter((attempt) => attempt.status === 'error').length,
      running: group.filter((attempt) => attempt.status === 'running').length,
      input_tokens_all_attempts: sum(group.map((attempt) => Number(attempt.input_tokens))),
      output_tokens_all_attempts: sum(group.map((attempt) => Number(attempt.output_tokens))),
      reasoning_tokens_all_attempts: sum(group.map((attempt) => Number(attempt.reasoning_tokens))),
      cached_input_tokens_all_attempts: sum(group.map((attempt) => Number(attempt.cached_input_tokens))),
      physical_cost_usd_all_attempts: sum(group.map((attempt) =>
        Number(attempt.actual_physical_cost_usd))),
      successful_call_latency_ms: distribution(successLatency),
      all_attempt_latency_ms: distribution(allLatency),
    };
  }).sort((left, right) =>
    [left.scope, left.stage, left.provider ?? '', left.model ?? ''].join('\0').localeCompare(
      [right.scope, right.stage, right.provider ?? '', right.model ?? ''].join('\0')));

  const localAttempts = attempts.filter((attempt) => attempt.provider === 'local-vLLM');
  const paidAttempts = attempts.filter((attempt) => attempt.provider === 'OpenRouter');
  const budget = new DatabaseSync(BUDGET_LEDGER, { readOnly: true });
  const budgetConfigRow = budget.prepare(
    'SELECT config_json, halted, halt_reason FROM budget_config_v2 WHERE singleton=1',
  ).get() as { config_json: string; halted: number; halt_reason: string | null };
  const budgetReservations = budget.prepare(`
    SELECT pool, status, COUNT(*) AS reservations, COALESCE(SUM(upper_micro),0) AS upper_micro,
           COALESCE(SUM(actual_micro),0) AS actual_micro
    FROM budget_reservations_v2
    GROUP BY pool, status
    ORDER BY pool, status
  `).all() as unknown as Array<{pool: string; status: string; reservations: number;
    upper_micro: number; actual_micro: number}>;
  budget.close();
  const budgetConfig = JSON.parse(budgetConfigRow.config_json) as Json;
  const budgetPools = Object.fromEntries(Object.entries(budgetConfig.pools as Record<string, number>).map(
    ([pool, limit]) => {
      const rows = budgetReservations.filter((row) => row.pool === pool);
      const settledMicro = sum(rows.filter((row) => row.status === 'settled').map((row) => Number(row.actual_micro)));
      const inFlightMicro = sum(rows.filter((row) => ['reserved', 'dispatched', 'unknown'].includes(row.status))
        .map((row) => Number(row.upper_micro)));
      return [pool, {
        limit_usd: Number(limit) / 1e6,
        settled_usd: settledMicro / 1e6,
        in_flight_or_unknown_reserved_upper_usd: inFlightMicro / 1e6,
        available_after_commitments_usd: (Number(limit) - settledMicro - inFlightMicro) / 1e6,
        reservations_by_status: Object.fromEntries(rows.map((row) => [row.status, {
          count: Number(row.reservations), upper_usd: Number(row.upper_micro) / 1e6,
          actual_usd: Number(row.actual_micro) / 1e6,
        }])),
      }];
    }));

  const historyController = new Map<string, Record<Arm, Json>>();
  for (const record of historyRecords) {
    const entry = {} as Record<Arm, Json>;
    for (const arm of ['B', 'C'] as const) {
      const rows = controllerStepRows.filter((row) => row.history === record.question_id && row.arm === arm);
      entry[arm] = {
        calls: sum(rows.map((row) => row.call_count)),
        input_tokens: sum(rows.map((row) => row.input_tokens)),
        output_tokens: sum(rows.map((row) => row.output_tokens)),
        reasoning_tokens: sum(rows.map((row) => row.reasoning_tokens)),
        cached_input_tokens: sum(rows.map((row) => row.cached_input_tokens)),
        cost_usd: sum(rows.map((row) => row.cost_usd)),
        latency_ms: distribution(rows.map((row) => row.latency_ms)),
      };
    }
    historyController.set(record.question_id, entry);
  }

  const activeB = historyRecords.map((record) => record.B_active);
  const activeC = historyRecords.map((record) => record.C_active);
  const result = {
    schema: 'phase4-formal-analysis-v22',
    status: 'COMPLETE',
    source_terminal_finished_at: terminal.finished_at,
    arms: {
      B: 'GPT-5.6 Sol separated decision controller',
      C: 'Jev typesafe/jev-1.13 separated decision controller',
    },
    sample: {
      frozen_histories: historyRecords.length,
      knowledge_update_histories: historyRecords.filter((record) => record.slice === 'knowledge-update').length,
      abstention_histories: historyRecords.filter((record) => record.slice === 'abstention').length,
      extracted_fact_decisions_per_arm: pairedSteps.length,
      sessions: sum(historyRecords.map((record) => record.sessions)),
    },
    qa: qaAnalysis,
    fact_level: {
      arms: operationByArm,
      agreement: {
        cases: pairedSteps.length,
        operation_agreement_count: operationAgreement,
        operation_agreement_rate: operationAgreement / pairedSteps.length,
        mutation_vs_noop_agreement_count: mutationAgreement,
        mutation_vs_noop_agreement_rate: mutationAgreement / pairedSteps.length,
        operation_confusion_B_rows_C_columns: operationMatrix,
        target_agreement_not_reported: 'B and C maintain independent states, so their memory IDs are not comparable.',
      },
    },
    final_active_state: {
      warning: 'These are state-size/descriptive summaries, not gold state accuracy.',
      B: { active_count_by_history: distribution(activeB), total_active: sum(activeB) },
      C: { active_count_by_history: distribution(activeC), total_active: sum(activeC) },
      paired_C_minus_B_active_count: distribution(historyRecords.map((record) => record.C_active - record.B_active)),
      histories_C_more_active: historyRecords.filter((record) => record.C_active > record.B_active).length,
      histories_equal_active: historyRecords.filter((record) => record.C_active === record.B_active).length,
      histories_B_more_active: historyRecords.filter((record) => record.B_active > record.C_active).length,
    },
    controller: {
      by_arm: controllerByArm,
      controller_only_cost_comparison: {
        B_usd: BControllerCost,
        C_usd: CControllerCost,
        B_over_C_ratio: CControllerCost > 0 ? BControllerCost / CControllerCost : null,
        C_savings_fraction_vs_B: BControllerCost > 0 ? 1 - CControllerCost / BControllerCost : null,
        scope_warning: 'This comparison covers decision-controller calls only; it is not a full memory-system cost ratio.',
      },
    },
    calls: {
      by_scope_stage_provider_model: costBreakdown,
      formal_physical_attempts: attempts.length,
      successful_attempts: successfulAttempts.length,
      failed_attempts: attempts.filter((attempt) => attempt.status === 'error').length,
      paid_provider_exact_usd_all_attempts: sum(paidAttempts.map((attempt) =>
        Number(attempt.actual_physical_cost_usd))),
      local_module_usage: {
        calls_successful: localAttempts.filter((attempt) => attempt.status === 'success').length,
        calls_failed: localAttempts.filter((attempt) => attempt.status === 'error').length,
        input_tokens_all_attempts: sum(localAttempts.map((attempt) => Number(attempt.input_tokens))),
        output_tokens_all_attempts: sum(localAttempts.map((attempt) => Number(attempt.output_tokens))),
        reasoning_tokens_all_attempts: sum(localAttempts.map((attempt) => Number(attempt.reasoning_tokens))),
        cached_input_tokens_all_attempts: sum(localAttempts.map((attempt) =>
          Number(attempt.cached_input_tokens))),
        api_cost_usd: 0,
        hardware_cost_usd: null,
        cost_note: 'Local modules incurred no API charge; local hardware/energy cost was not monetized.',
      },
    },
    campaign_budget: {
      campaign_id: budgetConfig.campaignId,
      total_limit_usd: Number(budgetConfig.totalMicroUsd) / 1e6,
      halted: Boolean(budgetConfigRow.halted),
      halt_reason: budgetConfigRow.halt_reason,
      pools: budgetPools,
      note: 'Settled guard amounts round each request upward to micro-USD; provider-exact formal cost is reported separately.',
    },
    preregistered_statistics: {
      bootstrap_resamples: resamples,
      bootstrap_seed: bootstrapSeed,
      noninferiority_margin: freeze.scoring?.noninferiority_margin ?? null,
    },
    limitations: [
      'QA correctness is based on the frozen automated official-rubric judge, not new human gold state annotation.',
      'Active-state counts describe controller behavior and are not state correctness scores.',
      'Abstention is a small prespecified descriptive slice.',
      'Local module token counts are reported, while their hardware and energy costs remain unmonetized.',
    ],
  };

  const historyCsv: unknown[][] = [[
    'order', 'question_id', 'slice', 'sessions', 'facts', 'B_correct', 'C_correct',
    'B_judge_valid', 'C_judge_valid', 'B_active', 'C_active', 'C_minus_B_active',
    'B_events', 'C_events', 'B_retrieved_active', 'B_retrieved_archive',
    'C_retrieved_active', 'C_retrieved_archive', 'B_controller_calls', 'C_controller_calls',
    'B_controller_input_tokens', 'C_controller_input_tokens', 'B_controller_output_tokens',
    'C_controller_output_tokens', 'B_controller_reasoning_tokens', 'C_controller_reasoning_tokens',
    'B_controller_cost_usd', 'C_controller_cost_usd', 'B_median_decision_latency_ms',
    'C_median_decision_latency_ms',
  ]];
  for (const record of historyRecords) {
    const controls = historyController.get(record.question_id)!;
    historyCsv.push([
      record.order, record.question_id, record.slice, record.sessions, record.facts,
      record.B_correct, record.C_correct, record.B_judge_valid, record.C_judge_valid,
      record.B_active, record.C_active, record.C_active - record.B_active,
      record.B_events, record.C_events, record.B_answer_retrieved_active,
      record.B_answer_retrieved_archive, record.C_answer_retrieved_active,
      record.C_answer_retrieved_archive, controls.B.calls, controls.C.calls,
      controls.B.input_tokens, controls.C.input_tokens, controls.B.output_tokens,
      controls.C.output_tokens, controls.B.reasoning_tokens, controls.C.reasoning_tokens,
      controls.B.cost_usd, controls.C.cost_usd, controls.B.latency_ms.median,
      controls.C.latency_ms.median,
    ]);
  }
  const costCsv: unknown[][] = [[
    'scope', 'stage', 'provider', 'model', 'attempts', 'successes', 'errors', 'running',
    'input_tokens_all_attempts', 'output_tokens_all_attempts', 'reasoning_tokens_all_attempts',
    'cached_input_tokens_all_attempts', 'physical_cost_usd_all_attempts',
    'success_latency_mean_ms', 'success_latency_median_ms', 'success_latency_p90_ms',
    'all_attempt_latency_mean_ms', 'all_attempt_latency_median_ms', 'all_attempt_latency_p90_ms',
  ], ...costBreakdown.map((row) => [
    row.scope, row.stage, row.provider, row.model, row.attempts, row.successes, row.errors, row.running,
    row.input_tokens_all_attempts, row.output_tokens_all_attempts, row.reasoning_tokens_all_attempts,
    row.cached_input_tokens_all_attempts, row.physical_cost_usd_all_attempts,
    row.successful_call_latency_ms.mean, row.successful_call_latency_ms.median,
    row.successful_call_latency_ms.p90, row.all_attempt_latency_ms.mean,
    row.all_attempt_latency_ms.median, row.all_attempt_latency_ms.p90,
  ])];
  const controllerCsv: unknown[][] = [[
    'question_id', 'step', 'arm', 'evidence_kind', 'operation', 'valid', 'execution_error',
    'call_count', 'input_tokens', 'output_tokens', 'reasoning_tokens', 'cached_input_tokens',
    'cost_usd', 'latency_ms',
  ], ...controllerStepRows.map((row) => [
    row.history, row.step, row.arm, row.evidence_kind, row.operation, row.valid,
    row.execution_error, row.call_count, row.input_tokens, row.output_tokens,
    row.reasoning_tokens, row.cached_input_tokens, row.cost_usd, row.latency_ms,
  ])];

  // Write analysis.json last. If interrupted earlier, its absence clearly marks an incomplete analysis export.
  writeExclusive(path.join(ROOT, 'analysis_history_outcomes.csv'), csv(historyCsv));
  writeExclusive(path.join(ROOT, 'analysis_cost_breakdown.csv'), csv(costCsv));
  writeExclusive(path.join(ROOT, 'analysis_controller_steps.csv'), csv(controllerCsv));
  writeExclusive(path.join(ROOT, 'analysis_operation_breakdown.csv'), csv(operationBreakdownRows));
  writeExclusive(path.join(ROOT, 'analysis.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({
    status: result.status,
    histories: result.sample.frozen_histories,
    facts_per_arm: result.sample.extracted_fact_decisions_per_arm,
    qa: result.qa.overall,
    paired: result.qa.paired_table,
    controller_cost: result.controller.controller_only_cost_comparison,
    outputs: outputFiles,
  }, null, 2));
}

main();
