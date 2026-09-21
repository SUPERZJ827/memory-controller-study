import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  MODEL,
  OPERATION_CRITERIA,
  OPERATION_INSTRUCTIONS,
  predictOperation,
  predictTarget,
  sanitizeProviderMetadata,
  type Memory,
  type MemoryOperation,
} from './jev.js';

type Target = string | 'NONE';

type SanityCase = {
  id: string;
  category: string;
  existing_memories: Memory[];
  new_fact: string;
  gold_operation: MemoryOperation;
  gold_target: Target;
  notes: string;
};

type Usage = {
  inputTokens: number;
  outputTokens: number;
  cost?: number;
};

type CaseResult = {
  id: string;
  category: string;
  gold_operation: MemoryOperation;
  pred_operation: MemoryOperation | null;
  operation_correct: boolean | null;
  operation_probabilities: Record<string, number>;
  operation_confidence: number | null;
  gold_target: Target;
  pred_target: Target | null;
  target_correct: boolean | null;
  target_probabilities: Record<string, number>;
  joint_correct: boolean | null;
  operation_latency_ms: number;
  target_latency_ms: number;
  total_latency_ms: number;
  usage: { operation?: Usage; target?: Usage };
  provider_metadata_safe: { operation?: unknown; target?: unknown };
  api_error: null | {
    stage: 'operation' | 'target';
    status: string;
    message: string;
  };
};

const OPERATIONS: MemoryOperation[] = ['ADD', 'UPDATE', 'DELETE', 'NOOP'];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metric(correct: number, total: number) {
  return {
    correct,
    total,
    percent: total === 0 ? null : round((100 * correct) / total),
  };
}

function confidenceStats(results: CaseResult[]) {
  const usable = results.filter(
    result =>
      result.operation_correct !== null && result.operation_confidence !== null,
  );
  const correct = usable.filter(result => result.operation_correct);
  const wrong = usable.filter(result => !result.operation_correct);

  const summarizeConfidence = (items: CaseResult[]) => {
    const values = items.map(item => item.operation_confidence as number);
    return {
      count: values.length,
      mean: mean(values) === null ? null : round(mean(values) as number),
      median: median(values) === null ? null : round(median(values) as number),
    };
  };

  const bucket = (predicate: (confidence: number) => boolean) => {
    const items = usable.filter(item =>
      predicate(item.operation_confidence as number),
    );
    return metric(items.filter(item => item.operation_correct).length, items.length);
  };

  const high = usable.filter(item => (item.operation_confidence as number) >= 0.8);
  const low = usable.filter(item => (item.operation_confidence as number) < 0.8);
  const highAccuracy = high.length
    ? high.filter(item => item.operation_correct).length / high.length
    : null;
  const lowAccuracy = low.length
    ? low.filter(item => item.operation_correct).length / low.length
    : null;

  let exploratoryConclusion =
    'Insufficient samples in one or more confidence groups; exploratory only.';
  if (highAccuracy !== null && lowAccuracy !== null) {
    exploratoryConclusion =
      lowAccuracy < highAccuracy
        ? 'Lower-confidence samples were less accurate in this run; exploratory only.'
        : 'Lower-confidence samples were not less accurate in this run; exploratory only.';
  } else if (wrong.length === 0) {
    exploratoryConclusion =
      'There were no wrong operation predictions, so error separation cannot be assessed; exploratory only.';
  }

  return {
    exploratory_only: true,
    correct_predictions: summarizeConfidence(correct),
    wrong_predictions: summarizeConfidence(wrong),
    accuracy_at_confidence_gte_0_9: bucket(value => value >= 0.9),
    accuracy_at_confidence_gte_0_8: bucket(value => value >= 0.8),
    accuracy_at_confidence_lt_0_8: bucket(value => value < 0.8),
    conclusion: exploratoryConclusion,
  };
}

function safeError(error: unknown, stage: 'operation' | 'target') {
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const httpMeta =
    typeof record.httpMeta === 'object' && record.httpMeta !== null
      ? (record.httpMeta as Record<string, unknown>)
      : {};
  const rawMessage = error instanceof Error ? error.message : String(error);
  return {
    stage,
    status: String(record.statusCode ?? httpMeta.status ?? 'unknown'),
    message: rawMessage
      .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]'),
  };
}

function assertCases(cases: SanityCase[]) {
  if (cases.length !== 20) {
    throw new Error(`Expected exactly 20 cases, received ${cases.length}.`);
  }
  if (new Set(cases.map(item => item.id)).size !== cases.length) {
    throw new Error('Case IDs must be unique.');
  }
  const basic = cases.filter(item => !item.category.startsWith('boundary_'));
  const expected = { ADD: 4, UPDATE: 4, DELETE: 3, NOOP: 4 };
  for (const operation of OPERATIONS) {
    const actual = basic.filter(item => item.gold_operation === operation).length;
    if (actual !== expected[operation]) {
      throw new Error(
        `Expected ${expected[operation]} basic ${operation} cases, received ${actual}.`,
      );
    }
  }
  if (cases.filter(item => item.category.startsWith('boundary_')).length !== 5) {
    throw new Error('Expected exactly 5 boundary cases.');
  }
}

async function runCase(testCase: SanityCase): Promise<CaseResult> {
  const totalStartedAt = performance.now();
  const base: CaseResult = {
    id: testCase.id,
    category: testCase.category,
    gold_operation: testCase.gold_operation,
    pred_operation: null,
    operation_correct: null,
    operation_probabilities: {},
    operation_confidence: null,
    gold_target: testCase.gold_target,
    pred_target: null,
    target_correct: null,
    target_probabilities: {},
    joint_correct: null,
    operation_latency_ms: 0,
    target_latency_ms: 0,
    total_latency_ms: 0,
    usage: {},
    provider_metadata_safe: {},
    api_error: null,
  };

  let operationResult;
  const operationStartedAt = performance.now();
  try {
    operationResult = await predictOperation(
      testCase.existing_memories,
      testCase.new_fact,
    );
  } catch (error) {
    base.operation_latency_ms = round(performance.now() - operationStartedAt);
    base.total_latency_ms = round(performance.now() - totalStartedAt);
    base.api_error = safeError(error, 'operation');
    return base;
  }

  base.operation_latency_ms = round(performance.now() - operationStartedAt);
  base.pred_operation = operationResult.choice;
  base.operation_probabilities = operationResult.probabilities;
  base.operation_confidence =
    operationResult.probabilities[operationResult.choice] ?? null;
  base.operation_correct = operationResult.choice === testCase.gold_operation;
  base.usage.operation = operationResult.usage;
  base.provider_metadata_safe.operation = sanitizeProviderMetadata(
    operationResult.providerMetadata,
  );

  if (
    operationResult.choice === 'UPDATE' ||
    operationResult.choice === 'DELETE'
  ) {
    const targetStartedAt = performance.now();
    try {
      const targetResult = await predictTarget(
        testCase.existing_memories,
        testCase.new_fact,
        operationResult.choice,
      );
      base.target_latency_ms = round(performance.now() - targetStartedAt);
      base.pred_target = targetResult.choice;
      base.target_probabilities = targetResult.probabilities;
      base.usage.target = targetResult.usage;
      base.provider_metadata_safe.target = sanitizeProviderMetadata(
        targetResult.providerMetadata,
      );
    } catch (error) {
      base.target_latency_ms = round(performance.now() - targetStartedAt);
      base.total_latency_ms = round(performance.now() - totalStartedAt);
      base.api_error = safeError(error, 'target');
      return base;
    }
  } else {
    base.pred_target = 'NONE';
  }

  base.target_correct = base.pred_target === testCase.gold_target;
  base.joint_correct = Boolean(base.operation_correct && base.target_correct);
  base.total_latency_ms = round(performance.now() - totalStartedAt);
  return base;
}

function classifyFailure(result: CaseResult): string {
  if (result.api_error) return 'other';
  if (result.category === 'boundary_tentative_plan') return 'tentative information';
  if (result.category === 'boundary_retraction') return 'retraction';
  if (result.category === 'boundary_partial_update') return 'partial update';
  if (result.category === 'boundary_target_ambiguity') {
    return result.operation_correct ? 'target confusion' : 'ambiguity';
  }
  if (result.category === 'boundary_duplicate_paraphrase') return 'ambiguity';
  if (result.operation_correct && !result.target_correct) return 'target confusion';
  return 'operation confusion';
}

function formatPercent(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

async function main() {
  const raw = await readFile('data/sanity_cases.json', 'utf8');
  const cases = JSON.parse(raw) as SanityCase[];
  assertCases(cases);
  await mkdir('results', { recursive: true });

  const policyHash = createHash('sha256')
    .update(JSON.stringify({ OPERATION_INSTRUCTIONS, OPERATION_CRITERIA }))
    .digest('hex');

  const results: CaseResult[] = [];
  for (const [index, testCase] of cases.entries()) {
    process.stdout.write(`[${index + 1}/20] ${testCase.id} ... `);
    const result = await runCase(testCase);
    results.push(result);
    if (result.api_error) {
      console.log('API ERROR');
      await writeFile(
        'results/sanity_results.jsonl',
        `${results.map(item => JSON.stringify(item)).join('\n')}\n`,
      );
      console.error(`HTTP / SDK error: ${result.api_error.status}`);
      console.error(`OpenRouter error message: ${result.api_error.message}`);
      console.error(`model id: ${MODEL}`);
      console.error(`失败位置: ${result.id} / ${result.api_error.stage}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.joint_correct ? 'OK' : 'WRONG');
  }

  await writeFile(
    'results/sanity_results.jsonl',
    `${results.map(result => JSON.stringify(result)).join('\n')}\n`,
  );

  const successful = results.filter(result => result.api_error === null);
  const operationCorrect = successful.filter(result => result.operation_correct).length;
  const targetRequired = successful.filter(result =>
    ['UPDATE', 'DELETE'].includes(result.gold_operation),
  );
  const targetCorrect = targetRequired.filter(result => result.target_correct).length;
  const jointCorrect = successful.filter(result => result.joint_correct).length;
  const boundary = successful.filter(result =>
    result.category.startsWith('boundary_'),
  );
  const basic = successful.filter(
    result => !result.category.startsWith('boundary_'),
  );
  const confidence = confidenceStats(successful);

  const byOperation = Object.fromEntries(
    OPERATIONS.map(operation => {
      const items = successful.filter(result => result.gold_operation === operation);
      return [
        operation,
        metric(items.filter(result => result.operation_correct).length, items.length),
      ];
    }),
  );

  const summary = {
    model: MODEL,
    case_count: cases.length,
    successful_api_cases: successful.length,
    policy_sha256: policyHash,
    operation_accuracy: metric(operationCorrect, successful.length),
    target_accuracy_on_target_required_cases: metric(
      targetCorrect,
      targetRequired.length,
    ),
    joint_accuracy: metric(jointCorrect, successful.length),
    accuracy_by_gold_operation: byOperation,
    boundary_case_accuracy: metric(
      boundary.filter(result => result.joint_correct).length,
      boundary.length,
    ),
    latency_ms: {
      median_operation: round(median(successful.map(item => item.operation_latency_ms)) ?? 0),
      median_total: round(median(successful.map(item => item.total_latency_ms)) ?? 0),
      mean_operation: round(mean(successful.map(item => item.operation_latency_ms)) ?? 0),
      mean_total: round(mean(successful.map(item => item.total_latency_ms)) ?? 0),
    },
    confidence,
    api_errors: results
      .filter(result => result.api_error)
      .map(result => ({ id: result.id, ...result.api_error })),
  };

  await writeFile('results/sanity_summary.json', `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`\nTotal cases: ${cases.length}`);
  console.log(`Successful API cases: ${successful.length}`);
  console.log(
    `Operation Accuracy: ${operationCorrect}/${successful.length} = ${formatPercent(summary.operation_accuracy.percent)}`,
  );
  console.log(
    `Target Accuracy on target-required cases: ${targetCorrect}/${targetRequired.length} = ${formatPercent(summary.target_accuracy_on_target_required_cases.percent)}`,
  );
  console.log(
    `Joint Accuracy: ${jointCorrect}/${successful.length} = ${formatPercent(summary.joint_accuracy.percent)}`,
  );
  for (const operation of OPERATIONS) {
    const value = byOperation[operation];
    console.log(
      `${operation} accuracy: ${value.correct}/${value.total} = ${formatPercent(value.percent)}`,
    );
  }
  console.log(
    `Boundary-case accuracy: ${summary.boundary_case_accuracy.correct}/${summary.boundary_case_accuracy.total} = ${formatPercent(summary.boundary_case_accuracy.percent)}`,
  );
  console.log(`Median operation latency: ${summary.latency_ms.median_operation} ms`);
  console.log(`Median total latency: ${summary.latency_ms.median_total} ms`);
  console.log(`Mean operation latency: ${summary.latency_ms.mean_operation} ms`);
  console.log(`Mean total latency: ${summary.latency_ms.mean_total} ms`);
  console.log('\nConfidence (exploratory only):');
  console.log(JSON.stringify(confidence, null, 2));

  const failures = successful.filter(result => !result.joint_correct);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(
        JSON.stringify(
          {
            case_id: failure.id,
            category: failure.category,
            gold_operation: failure.gold_operation,
            predicted_operation: failure.pred_operation,
            operation_probabilities: failure.operation_probabilities,
            gold_target: failure.gold_target,
            predicted_target: failure.pred_target,
          },
          null,
          2,
        ),
      );
    }
  }

  const basicOperationAccuracy =
    basic.filter(result => result.operation_correct).length / basic.length;
  const jointAccuracy = jointCorrect / successful.length;
  const targetAccuracy = targetCorrect / targetRequired.length;
  const boundaryAccuracy =
    boundary.filter(result => result.joint_correct).length / boundary.length;
  const decision =
    successful.length === cases.length &&
    basicOperationAccuracy >= 0.9 &&
    targetAccuracy >= 0.85 &&
    jointAccuracy >= 0.85 &&
    boundaryAccuracy >= 0.8
      ? 'GO'
      : basicOperationAccuracy >= 0.75 && jointAccuracy >= 0.65
        ? 'PROMISING_BUT_UNCLEAR'
        : 'NO_GO';

  const failureLines =
    failures.length === 0
      ? 'No failed cases.'
      : failures
          .map(
            failure =>
              `- ${failure.id} (${failure.category}) — ${classifyFailure(failure)}. Gold: ${failure.gold_operation}/${failure.gold_target}; predicted: ${failure.pred_operation}/${failure.pred_target}. Operation probabilities: ${JSON.stringify(failure.operation_probabilities)}.`,
          )
          .join('\n');

  const resultMarkdown = `# Jev Memory Operator Sanity Result

## Setup

- Node version: ${process.version}
- ai package version: 7.0.107 (installed but not used for Jev calls)
- OpenRouter SDK version: 1.3.8
- Model: ${MODEL}
- Case count: ${cases.length}
- Fixed policy SHA-256: \`${policyHash}\`

## Results

| Metric | Result |
|---|---:|
| Operation Accuracy | ${operationCorrect}/${successful.length} (${formatPercent(summary.operation_accuracy.percent)}) |
| Target Accuracy | ${targetCorrect}/${targetRequired.length} (${formatPercent(summary.target_accuracy_on_target_required_cases.percent)}) |
| Joint Accuracy | ${jointCorrect}/${successful.length} (${formatPercent(summary.joint_accuracy.percent)}) |
| Boundary Accuracy | ${summary.boundary_case_accuracy.correct}/${summary.boundary_case_accuracy.total} (${formatPercent(summary.boundary_case_accuracy.percent)}) |
| Median Latency | ${summary.latency_ms.median_total} ms total (${summary.latency_ms.median_operation} ms operation) |

## Failures

${failureLines}

## Confidence

${confidence.conclusion} Correct mean/median confidence: ${confidence.correct_predictions.mean ?? 'N/A'} / ${confidence.correct_predictions.median ?? 'N/A'}; wrong mean/median confidence: ${confidence.wrong_predictions.mean ?? 'N/A'} / ${confidence.wrong_predictions.median ?? 'N/A'}.

## Preliminary Decision

${decision}
`;

  await writeFile('RESULT.md', resultMarkdown);
  console.log(`\nPreliminary Decision: ${decision}`);
}

await main();
