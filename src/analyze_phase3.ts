import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const OPERATIONS = ['ADD', 'UPDATE', 'DELETE', 'NOOP'] as const;
const CONTROLLERS = ['jev', 'gpt56sol', 'claude', 'qwen3_8b'] as const;
type Controller = (typeof CONTROLLERS)[number];

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function jsonl(file: string): Promise<any[]> {
  return (await readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function round(value: number, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function accuracy(correct: number, total: number) {
  return { correct, total, value: total ? round(correct / total) : null };
}

function macroF1(rows: any[]) {
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
    value: round(mean(Object.values(perClass).map((item: any) => item.f1))),
    per_class: perClass,
  };
}

function transitionMetrics(rows: any[]) {
  const targeted = rows.filter(row =>
    ['UPDATE', 'DELETE'].includes(row.gold_operation),
  );
  return {
    count: rows.length,
    operation_accuracy: accuracy(rows.filter(row => row.operation_correct).length, rows.length),
    operation_macro_f1: macroF1(rows),
    target_accuracy: accuracy(rows.filter(row => row.target_correct).length, rows.length),
    target_required_accuracy: accuracy(
      targeted.filter(row => row.target_correct).length,
      targeted.length,
    ),
    joint_accuracy: accuracy(rows.filter(row => row.joint_correct).length, rows.length),
  };
}

function trajectoryMetrics(rows: any[]) {
  const steps = rows.flatMap(row => row.steps);
  const intermediate = rows.flatMap(row => row.steps.slice(0, -1));
  let propagatedWrong = 0;
  let propagatedTotal = 0;
  for (const trajectory of rows) {
    const first = trajectory.steps.findIndex((step: any) => !step.joint_correct);
    if (first < 0) continue;
    const downstream = trajectory.steps.slice(first + 1);
    propagatedWrong += downstream.filter((step: any) => !step.state_correct).length;
    propagatedTotal += downstream.length;
  }
  return {
    trajectories: rows.length,
    steps: steps.length,
    step_accuracy: accuracy(steps.filter((step: any) => step.joint_correct).length, steps.length),
    intermediate_state_accuracy: accuracy(
      intermediate.filter((step: any) => step.state_correct).length,
      intermediate.length,
    ),
    final_state_accuracy: accuracy(
      rows.filter(row => row.final_state_correct).length,
      rows.length,
    ),
    error_propagation_rate: accuracy(propagatedWrong, propagatedTotal),
  };
}

function efficiency(transitions: any[], trajectories: any[]) {
  const rows = [...transitions, ...trajectories.flatMap(item => item.steps)];
  const values = (field: string) =>
    rows.map(row => row.usage?.[field]).filter(value => typeof value === 'number');
  const sum = (field: string) => {
    const items = values(field);
    return items.length === rows.length
      ? round(items.reduce((total, value) => total + value, 0), 9)
      : null;
  };
  const latency = rows.map(row => row.latency_ms);
  return {
    decisions: rows.length,
    median_latency_ms: round(percentile(latency, 0.5), 3),
    mean_latency_ms: round(mean(latency), 3),
    p90_latency_ms: round(percentile(latency, 0.9), 3),
    input_tokens: sum('input_tokens'),
    output_tokens: sum('output_tokens'),
    reasoning_tokens: values('reasoning_tokens').length === rows.length ? sum('reasoning_tokens') : null,
    controller_only_cost_usd: sum('cost_usd'),
    parse_errors: rows.filter(row => row.parse_error !== null).length,
    retried_decisions: rows.filter(row => row.attempts > 1).length,
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

function pairedComparison(
  jevMap: Map<string, any>,
  baselineMap: Map<string, any>,
  ids: string[],
  seed: number,
) {
  const pairs = ids.map(id => [jevMap.get(id), baselineMap.get(id)] as const);
  const delta = mean(
    pairs.map(([jev, baseline]) =>
      Number(jev.joint_correct) - Number(baseline.joint_correct),
    ),
  );
  const random = mulberry32(seed);
  const bootstrap: number[] = [];
  for (let sample = 0; sample < 20_000; sample += 1) {
    let total = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const [jev, baseline] = pairs[Math.floor(random() * pairs.length)];
      total += Number(jev.joint_correct) - Number(baseline.joint_correct);
    }
    bootstrap.push(total / pairs.length);
  }
  const bothCorrect = pairs.filter(([a, b]) => a.joint_correct && b.joint_correct).length;
  const jevOnly = pairs.filter(([a, b]) => a.joint_correct && !b.joint_correct).length;
  const baselineOnly = pairs.filter(([a, b]) => !a.joint_correct && b.joint_correct).length;
  const bothWrong = pairs.length - bothCorrect - jevOnly - baselineOnly;
  const discordant = jevOnly + baselineOnly;
  const tail = Math.min(jevOnly, baselineOnly);
  let probability = 0;
  let combination = 1;
  for (let k = 0; k <= tail; k += 1) {
    if (k > 0) combination = (combination * (discordant - k + 1)) / k;
    probability += combination / 2 ** discordant;
  }
  return {
    n: ids.length,
    delta_jev_minus_baseline: round(delta),
    bootstrap_resamples: 20_000,
    bootstrap_95_percentile_ci: [
      round(percentile(bootstrap, 0.025)),
      round(percentile(bootstrap, 0.975)),
    ],
    both_correct: bothCorrect,
    jev_only_correct: jevOnly,
    baseline_only_correct: baselineOnly,
    both_wrong: bothWrong,
    mcnemar_exact_two_sided_p: round(Math.min(1, 2 * probability), 9),
  };
}

function cohenKappa(labelsA: string[], labelsB: string[]) {
  const labels = [...new Set([...labelsA, ...labelsB])];
  const observed = labelsA.filter((label, index) => label === labelsB[index]).length / labelsA.length;
  const expected = labels.reduce((sum, label) => {
    const pa = labelsA.filter(item => item === label).length / labelsA.length;
    const pb = labelsB.filter(item => item === label).length / labelsB.length;
    return sum + pa * pb;
  }, 0);
  return {
    observed_agreement: round(observed),
    expected_agreement: round(expected),
    kappa: round((observed - expected) / (1 - expected)),
  };
}

function stressMetrics(rows: any[]) {
  const noop = rows.filter(row => row.gold_operation === 'NOOP');
  const mutation = rows.filter(row => row.gold_operation !== 'NOOP');
  const families = [...new Set(rows.map(row => row.construction_family))] as string[];
  return {
    ...transitionMetrics(rows),
    family_joint_accuracy: Object.fromEntries(
      families.sort().map(family => {
        const items = rows.filter(row => row.construction_family === family);
        return [family, accuracy(items.filter(row => row.joint_correct).length, items.length)];
      }),
    ),
    over_mutation_rate: accuracy(rows.filter(row => row.over_mutation).length, noop.length),
    under_mutation_rate: accuracy(rows.filter(row => row.under_mutation).length, mutation.length),
    confusion_matrix: Object.fromEntries(
      OPERATIONS.map(gold => [
        gold,
        Object.fromEntries(
          OPERATIONS.map(pred => [
            pred,
            rows.filter(row => row.gold_operation === gold && row.pred_operation === pred).length,
          ]),
        ),
      ]),
    ),
    parse_errors: rows.filter(row => row.parse_error !== null).length,
    retries: rows.filter(row => row.attempts > 1).length,
  };
}

function confidenceAnalysis(phase2: any[], stress: any[]) {
  const rows = [
    ...phase2.map(row => ({ ...row, dataset: 'phase2_layer_a' })),
    ...stress.map(row => ({ ...row, dataset: 'boundary_stress_v1' })),
  ].map(row => {
    const operationConfidence = row.operation_probabilities?.[row.pred_operation] ?? 0;
    const targetConfidence = ['UPDATE', 'DELETE'].includes(row.pred_operation)
      ? (row.target_probabilities?.[row.pred_target] ?? 0)
      : 1;
    return { ...row, confidence: operationConfidence * targetConfidence };
  });
  const summarize = (items: any[]) => {
    const values = items.map(item => item.confidence);
    return {
      count: values.length,
      mean: round(mean(values)),
      median: round(percentile(values, 0.5)),
      p10: round(percentile(values, 0.1)),
      p90: round(percentile(values, 0.9)),
    };
  };
  const bucket = (predicate: (confidence: number) => boolean) => {
    const items = rows.filter(item => predicate(item.confidence));
    return {
      ...accuracy(items.filter(item => item.joint_correct).length, items.length),
      coverage: round(items.length / rows.length),
    };
  };
  const eceBins = Array.from({ length: 10 }, (_, index) => {
    const lower = index / 10;
    const upper = (index + 1) / 10;
    const items = rows.filter(item =>
      index === 9
        ? item.confidence >= lower && item.confidence <= upper
        : item.confidence >= lower && item.confidence < upper,
    );
    return {
      lower,
      upper,
      count: items.length,
      confidence: items.length ? round(mean(items.map(item => item.confidence))) : null,
      accuracy: items.length ? round(items.filter(item => item.joint_correct).length / items.length) : null,
    };
  });
  const ece = eceBins.reduce((sum, bin) => {
    if (!bin.count || bin.confidence === null || bin.accuracy === null) return sum;
    return sum + (bin.count / rows.length) * Math.abs(bin.confidence - bin.accuracy);
  }, 0);
  const brier = mean(
    rows.map(row =>
      OPERATIONS.reduce((sum, label) => {
        const probability = row.operation_probabilities?.[label] ?? 0;
        const truth = row.gold_operation === label ? 1 : 0;
        return sum + (probability - truth) ** 2;
      }, 0),
    ),
  );
  const thresholds = [0, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.975, 0.99];
  const riskCoverage = thresholds.map(threshold => {
    const items = rows.filter(item => item.confidence >= threshold);
    const acc = items.length
      ? items.filter(item => item.joint_correct).length / items.length
      : null;
    return {
      threshold,
      retained: items.length,
      coverage: round(items.length / rows.length),
      accuracy: acc === null ? null : round(acc),
      risk: acc === null ? null : round(1 - acc),
    };
  });
  const wrongHigh = rows
    .filter(row => !row.joint_correct && row.confidence >= 0.9)
    .map(row => ({
      dataset: row.dataset,
      id: row.id,
      family: row.construction_family ?? null,
      gold_operation: row.gold_operation,
      gold_target: row.gold_target,
      pred_operation: row.pred_operation,
      pred_target: row.pred_target,
      confidence: round(row.confidence),
      current_memory_state: row.input.existing_memories,
      current_evidence: row.input.new_fact,
    }));
  return {
    count: rows.length,
    confidence_definition:
      'P(predicted operation) × P(predicted target) for predicted UPDATE/DELETE; target factor 1 for ADD/NOOP.',
    correct: summarize(rows.filter(row => row.joint_correct)),
    wrong: summarize(rows.filter(row => !row.joint_correct)),
    buckets: {
      confidence_gte_0_95: bucket(value => value >= 0.95),
      confidence_gte_0_9: bucket(value => value >= 0.9),
      confidence_0_8_to_0_9: bucket(value => value >= 0.8 && value < 0.9),
      confidence_lt_0_8: bucket(value => value < 0.8),
    },
    over_mutation_errors: summarize(
      rows.filter(row => row.gold_operation === 'NOOP' && row.pred_operation !== 'NOOP'),
    ),
    under_mutation_errors: summarize(
      rows.filter(row => row.gold_operation !== 'NOOP' && row.pred_operation === 'NOOP'),
    ),
    ece_10_equal_width_bins: round(ece),
    ece_bins: eceBins,
    multiclass_operation_brier_score: round(brier),
    risk_coverage_curve: riskCoverage,
    wrong_confidence_gte_0_9: wrongHigh,
  };
}

async function main() {
  await mkdir('results/phase3', { recursive: true });
  const transitions: Record<Controller, any[]> = {
    jev: await jsonl('results/raw/transitions_jev.jsonl'),
    gpt56sol: await jsonl('results/phase3/raw/transitions_gpt56sol.jsonl'),
    claude: await jsonl('results/raw/transitions_strong.jsonl'),
    qwen3_8b: await jsonl('results/raw/transitions_local.jsonl'),
  };
  const trajectories: Record<Controller, any[]> = {
    jev: await jsonl('results/raw/trajectories_jev.jsonl'),
    gpt56sol: await jsonl('results/phase3/raw/trajectories_gpt56sol.jsonl'),
    claude: await jsonl('results/raw/trajectories_strong.jsonl'),
    qwen3_8b: await jsonl('results/raw/trajectories_local.jsonl'),
  };
  const stress: Record<Controller, any[]> = {
    jev: await jsonl('results/phase3/stress_raw/jev.jsonl'),
    gpt56sol: await jsonl('results/phase3/stress_raw/gpt56sol.jsonl'),
    claude: await jsonl('results/phase3/stress_raw/strong.jsonl'),
    qwen3_8b: await jsonl('results/phase3/stress_raw/local.jsonl'),
  };
  for (const controller of CONTROLLERS) {
    if (transitions[controller].length !== 300) throw new Error(`${controller} transition count`);
    if (trajectories[controller].length !== 25) throw new Error(`${controller} trajectory count`);
    if (stress[controller].length !== 180) throw new Error(`${controller} stress count`);
  }
  const maps = Object.fromEntries(
    CONTROLLERS.map(controller => [
      controller,
      new Map(transitions[controller].map(row => [row.id, row])),
    ]),
  ) as Record<Controller, Map<string, any>>;
  const allIds = [...maps.jev.keys()].sort();
  const main = {
    frozen_inputs: {
      phase2_transition_sha256: sha256(await readFile('data/memops_transition_cases.json')),
      phase2_trajectory_sha256: sha256(await readFile('data/memops_trajectories.json')),
      jev_policy_sha256:
        'e824dfdeffe485ddde0fa6fbe5500c73874335c9ec57f473f74e463b4bdc2393',
      gpt56sol_protocol_sha256: sha256(await readFile('phase3/gpt56sol_protocol.json')),
      blind_packet_sha256: sha256(await readFile('audit/blind_packets.json')),
      boundary_stress_sha256: sha256(await readFile('data/boundary_stress_v1.json')),
    },
    controllers: Object.fromEntries(
      CONTROLLERS.map(controller => [
        controller,
        {
          layer_a: transitionMetrics(transitions[controller]),
          operator_slices: Object.fromEntries(
            OPERATIONS.map(operation => [
              operation,
              transitionMetrics(
                transitions[controller].filter(row => row.gold_operation === operation),
              ),
            ]),
          ),
          difficulty_slices: Object.fromEntries(
            ['tentative', 'retraction', 'recency_trap', 'candidate_disambiguation', 'update_chain'].map(
              slice => [
                slice,
                transitionMetrics(
                  transitions[controller].filter(row => row.slices?.[slice]),
                ),
              ],
            ),
          ),
          layer_b: trajectoryMetrics(trajectories[controller]),
          efficiency: efficiency(transitions[controller], trajectories[controller]),
        },
      ]),
    ),
  };
  const comparisons = {
    original_phase2_gold: {
      jev_vs_gpt56sol: pairedComparison(maps.jev, maps.gpt56sol, allIds, 20260920),
      jev_vs_claude: pairedComparison(maps.jev, maps.claude, allIds, 20260921),
    },
  } as any;

  const mappingRows = (JSON.parse(
    await readFile('audit/blind_mapping_private.json', 'utf8'),
  ) as any).mapping;
  const mapping = new Map(mappingRows.map((row: any) => [row.blind_id, row]));
  const packets = new Map(
    (JSON.parse(await readFile('audit/blind_packets.json', 'utf8')) as any).packets.map(
      (row: any) => [row.blind_id, row],
    ),
  );
  const reviewerA = new Map(
    (await jsonl('audit/reviewer_A_raw.jsonl')).map(row => [row.blind_id, row]),
  );
  const reviewerB = new Map(
    (await jsonl('audit/reviewer_B_raw.jsonl')).map(row => [row.blind_id, row]),
  );
  const auditRows = [...mapping.keys()].map((blindId: any) => {
    const mapRow: any = mapping.get(blindId);
    const a: any = (reviewerA.get(blindId) as any).review;
    const b: any = (reviewerB.get(blindId) as any).review;
    const gold = mapRow.benchmark_gold;
    const jointA = `${a.operation}|${a.target}`;
    const jointB = `${b.operation}|${b.target}`;
    const jointGold = `${gold.operation}|${gold.target}`;
    let category: 'A' | 'B' | 'C' | 'D';
    if (a.ambiguity === 'MATERIAL' || b.ambiguity === 'MATERIAL') category = 'D';
    else if (jointA !== jointB) category = 'C';
    else if (jointA !== jointGold) category = 'B';
    else category = 'A';
    return {
      blind_id: blindId,
      original_case_id: mapRow.original_case_id,
      selection_reasons: mapRow.selection_reasons,
      category,
      benchmark_gold: gold,
      reviewer_A: a,
      reviewer_B: b,
      packet: packets.get(blindId),
      strict_consensus:
        a.policy_applicable &&
        b.policy_applicable &&
        jointA === jointGold &&
        jointB === jointGold,
      material_ambiguity:
        a.ambiguity === 'MATERIAL' || b.ambiguity === 'MATERIAL',
    };
  });
  const opA = auditRows.map(row => row.reviewer_A.operation);
  const opB = auditRows.map(row => row.reviewer_B.operation);
  const jointA = auditRows.map(row => `${row.reviewer_A.operation}|${row.reviewer_A.target}`);
  const jointB = auditRows.map(row => `${row.reviewer_B.operation}|${row.reviewer_B.target}`);
  const strictAuditIds = auditRows
    .filter(row => row.strict_consensus)
    .map(row => row.original_case_id);
  const auditedIds = new Set(auditRows.map(row => row.original_case_id));
  const unreviewedIds = allIds.filter(id => !auditedIds.has(id));
  const strictExpandedIds = [...unreviewedIds, ...strictAuditIds].sort();
  const ambiguityExcludedIds = allIds.filter(
    id => !auditRows.some(row => row.original_case_id === id && row.material_ambiguity),
  );
  const subsetAccuracy = (ids: string[]) =>
    Object.fromEntries(
      CONTROLLERS.map(controller => [
        controller,
        accuracy(
          ids.filter(id => maps[controller].get(id).joint_correct).length,
          ids.length,
        ),
      ]),
    );
  const reviewerCost = (rows: any[]) => ({
    calls: rows.length,
    cost_usd: round(
      rows.reduce((sum, row) => sum + (row.usage?.cost ?? 0), 0),
      9,
    ),
    input_tokens: rows.reduce((sum, row) => sum + (row.usage?.prompt_tokens ?? 0), 0),
    output_tokens: rows.reduce((sum, row) => sum + (row.usage?.completion_tokens ?? 0), 0),
    median_latency_ms: round(percentile(rows.map(row => row.latency_ms), 0.5), 3),
    parse_errors: rows.filter(row => row.parse_error !== null).length,
    retries: rows.filter(row => row.attempts > 1).length,
  });
  const reviewerARaw = await jsonl('audit/reviewer_A_raw.jsonl');
  const reviewerBRaw = await jsonl('audit/reviewer_B_raw.jsonl');
  const auditSummary = {
    packet_count: auditRows.length,
    packet_sha256: sha256(await readFile('audit/blind_packets.json')),
    categories: Object.fromEntries(
      ['A', 'B', 'C', 'D'].map(category => [
        category,
        auditRows.filter(row => row.category === category).length,
      ]),
    ),
    reviewer_agreement: {
      operation: accuracy(opA.filter((label, index) => label === opB[index]).length, opA.length),
      joint: accuracy(jointA.filter((label, index) => label === jointB[index]).length, jointA.length),
      operation_cohen_kappa: cohenKappa(opA, opB),
      joint_cohen_kappa: cohenKappa(jointA, jointB),
    },
    reviewer_vs_benchmark: {
      reviewer_A_operation: accuracy(
        auditRows.filter(row => row.reviewer_A.operation === row.benchmark_gold.operation).length,
        auditRows.length,
      ),
      reviewer_A_joint: accuracy(
        auditRows.filter(
          row =>
            row.reviewer_A.operation === row.benchmark_gold.operation &&
            row.reviewer_A.target === row.benchmark_gold.target,
        ).length,
        auditRows.length,
      ),
      reviewer_B_operation: accuracy(
        auditRows.filter(row => row.reviewer_B.operation === row.benchmark_gold.operation).length,
        auditRows.length,
      ),
      reviewer_B_joint: accuracy(
        auditRows.filter(
          row =>
            row.reviewer_B.operation === row.benchmark_gold.operation &&
            row.reviewer_B.target === row.benchmark_gold.target,
        ).length,
        auditRows.length,
      ),
    },
    reviewer_efficiency: {
      A: reviewerCost(reviewerARaw),
      B: reviewerCost(reviewerBRaw),
    },
    sensitivity: {
      original_full_300: {
        accuracy: subsetAccuracy(allIds),
        jev_vs_gpt56sol: comparisons.original_phase2_gold.jev_vs_gpt56sol,
        jev_vs_claude: comparisons.original_phase2_gold.jev_vs_claude,
      },
      strict_consensus_audited_only: {
        note: 'Only audited packets where both reviewers found the policy applicable and matched benchmark operation+target.',
        accuracy: subsetAccuracy(strictAuditIds),
        jev_vs_gpt56sol: pairedComparison(maps.jev, maps.gpt56sol, strictAuditIds, 20260922),
        jev_vs_claude: pairedComparison(maps.jev, maps.claude, strictAuditIds, 20260923),
      },
      strict_consensus_full_conservative: {
        note: 'All unaudited cases are retained because they are triple-correct and cannot change paired disagreement counts; audited cases are retained only under strict consensus.',
        accuracy: subsetAccuracy(strictExpandedIds),
        jev_vs_gpt56sol: pairedComparison(maps.jev, maps.gpt56sol, strictExpandedIds, 20260924),
        jev_vs_claude: pairedComparison(maps.jev, maps.claude, strictExpandedIds, 20260925),
      },
      material_ambiguity_excluded_full: {
        accuracy: subsetAccuracy(ambiguityExcludedIds),
        jev_vs_gpt56sol: pairedComparison(maps.jev, maps.gpt56sol, ambiguityExcludedIds, 20260926),
        jev_vs_claude: pairedComparison(maps.jev, maps.claude, ambiguityExcludedIds, 20260927),
      },
    },
    cases: auditRows,
  };
  comparisons.construct_validity_sensitivity = auditSummary.sensitivity;

  const mismatchMarkdown = [
    '# Construct Mismatch / Disagreement Cases',
    '',
    'Categories are mutually exclusive: D (any MATERIAL ambiguity), then C (reviewers disagree), then B (reviewers agree with each other but not benchmark). Phase-2 labels are unchanged.',
    '',
    ...auditRows
      .filter(row => ['B', 'C', 'D'].includes(row.category))
      .flatMap(row => {
        const packet: any = row.packet;
        return [
          `## ${row.category} — ${row.blind_id} / ${row.original_case_id}`,
          '',
          `- Evidence: ${packet.current_evidence}`,
          `- Current state: ${packet.current_memory_state.map((item: any) => `${item.id}=${item.content}`).join(' | ')}`,
          `- Benchmark: ${row.benchmark_gold.operation} / ${row.benchmark_gold.target}`,
          `- Reviewer A: ${row.reviewer_A.operation} / ${row.reviewer_A.target}; applicable=${row.reviewer_A.policy_applicable}; ambiguity=${row.reviewer_A.ambiguity}; ${row.reviewer_A.short_reason}`,
          `- Reviewer B: ${row.reviewer_B.operation} / ${row.reviewer_B.target}; applicable=${row.reviewer_B.policy_applicable}; ambiguity=${row.reviewer_B.ambiguity}; ${row.reviewer_B.short_reason}`,
          '',
        ];
      }),
  ].join('\n');
  await writeFile('audit/construct_mismatch_cases.md', `${mismatchMarkdown}\n`);

  const stressSummary = {
    frozen_stress_sha256: sha256(await readFile('data/boundary_stress_v1.json')),
    controllers: Object.fromEntries(
      CONTROLLERS.map(controller => [controller, stressMetrics(stress[controller])]),
    ),
  };
  const confidence = confidenceAnalysis(transitions.jev, stress.jev);

  await writeFile('results/phase3/main_results.json', `${JSON.stringify(main, null, 2)}\n`);
  await writeFile(
    'results/phase3/statistical_comparisons.json',
    `${JSON.stringify(comparisons, null, 2)}\n`,
  );
  await writeFile(
    'results/phase3/construct_audit.json',
    `${JSON.stringify(auditSummary, null, 2)}\n`,
  );
  await writeFile(
    'results/phase3/stress_results.json',
    `${JSON.stringify(stressSummary, null, 2)}\n`,
  );
  await writeFile(
    'results/phase3/jev_confidence.json',
    `${JSON.stringify(confidence, null, 2)}\n`,
  );
  await writeFile(
    'results/phase3/jev_high_confidence_errors.json',
    `${JSON.stringify(confidence.wrong_confidence_gte_0_9, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        main: Object.fromEntries(
          CONTROLLERS.map(controller => [
            controller,
            {
              joint: main.controllers[controller].layer_a.joint_accuracy,
              final: main.controllers[controller].layer_b.final_state_accuracy,
            },
          ]),
        ),
        comparisons: comparisons.original_phase2_gold,
        audit: {
          categories: auditSummary.categories,
          agreement: auditSummary.reviewer_agreement,
        },
        stress: stressSummary.controllers,
        confidence,
      },
      null,
      2,
    ),
  );
}

await main();
