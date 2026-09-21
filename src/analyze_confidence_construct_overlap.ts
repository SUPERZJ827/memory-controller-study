import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

type Json = Record<string, any>;

const INPUTS = {
  phase2_jev: 'results/raw/transitions_jev.jsonl',
  stress_jev: 'results/phase3/stress_raw/jev.jsonl',
  construct_audit: 'results/phase3/construct_audit.json',
  published_high_confidence: 'results/phase3/jev_high_confidence_errors.json',
} as const;

const OUTPUT_JSON = 'results/phase4_precheck/confidence_construct_overlap.json';
const OUTPUT_MD = 'results/phase4_precheck/confidence_construct_overlap.md';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readJsonl(path: string): Promise<Json[]> {
  return (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function confidence(row: Json): number {
  const operation = row.operation_probabilities?.[row.pred_operation] ?? 0;
  const target = ['UPDATE', 'DELETE'].includes(row.pred_operation)
    ? (row.target_probabilities?.[row.pred_target] ?? 0)
    : 1;
  return operation * target;
}

function joint(operation: string, target: string): string {
  return `${operation}|${target}`;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function mean(items: number[]): number | null {
  return items.length ? round(items.reduce((sum, value) => sum + value, 0) / items.length) : null;
}

function enrich(row: Json, auditMap: Map<string, Json>): Json {
  const audit = auditMap.get(row.id);
  const rowJoint = joint(row.pred_operation, row.pred_target);
  const auditStatus = audit
    ? audit.category === 'A' && audit.strict_consensus
      ? 'BENCHMARK_SUPPORTED_BY_BOTH_REVIEWERS'
      : audit.category === 'B'
        ? 'REVIEWER_CONSENSUS_MISMATCH_WITH_BENCHMARK'
        : audit.category === 'C'
          ? 'REVIEWER_DISAGREEMENT'
          : audit.category === 'D'
            ? 'MATERIAL_AMBIGUITY'
            : 'OTHER_AUDITED_STATUS'
    : 'NOT_IN_BLIND_AUDIT';

  return {
    id: row.id,
    dataset: row.dataset,
    gold: { operation: row.gold_operation, target: row.gold_target },
    jev: {
      operation: row.pred_operation,
      target: row.pred_target,
      confidence: round(row.confidence),
    },
    audit_coverage: Boolean(audit),
    audit_status: auditStatus,
    blind_id: audit?.blind_id ?? null,
    audit_category: audit?.category ?? null,
    strict_consensus_with_benchmark: audit?.strict_consensus ?? null,
    reviewer_A: audit
      ? {
          operation: audit.reviewer_A.operation,
          target: audit.reviewer_A.target,
          policy_applicable: audit.reviewer_A.policy_applicable,
          ambiguity: audit.reviewer_A.ambiguity,
        }
      : null,
    reviewer_B: audit
      ? {
          operation: audit.reviewer_B.operation,
          target: audit.reviewer_B.target,
          policy_applicable: audit.reviewer_B.policy_applicable,
          ambiguity: audit.reviewer_B.ambiguity,
        }
      : null,
    jev_matches_reviewer_A_joint: audit
      ? rowJoint === joint(audit.reviewer_A.operation, audit.reviewer_A.target)
      : null,
    jev_matches_reviewer_B_joint: audit
      ? rowJoint === joint(audit.reviewer_B.operation, audit.reviewer_B.target)
      : null,
  };
}

function summarize(rows: Json[]): Json {
  const audited = rows.filter(row => row.audit_coverage);
  const bothApplicable = audited.filter(
    row => row.reviewer_A.policy_applicable && row.reviewer_B.policy_applicable,
  );
  const consensusMismatch = audited.filter(
    row => row.audit_status === 'REVIEWER_CONSENSUS_MISMATCH_WITH_BENCHMARK',
  );
  const benchmarkSupported = audited.filter(
    row => row.audit_status === 'BENCHMARK_SUPPORTED_BY_BOTH_REVIEWERS',
  );
  return {
    count: rows.length,
    audited_count: audited.length,
    unaudited_count: rows.length - audited.length,
    unaudited_ids: rows.filter(row => !row.audit_coverage).map(row => row.id),
    audit_status_counts: countBy(rows, row => row.audit_status),
    audit_category_counts: countBy(rows, row => row.audit_category ?? 'UNAUDITED'),
    both_reviewers_policy_applicable: bothApplicable.length,
    material_ambiguity_count: audited.filter(
      row => row.reviewer_A.ambiguity === 'MATERIAL' || row.reviewer_B.ambiguity === 'MATERIAL',
    ).length,
    reviewer_consensus_mismatch_count: consensusMismatch.length,
    jev_matches_both_reviewers_joint_within_consensus_mismatch: consensusMismatch.filter(
      row => row.jev_matches_reviewer_A_joint && row.jev_matches_reviewer_B_joint,
    ).length,
    mean_confidence: mean(rows.map(row => row.jev.confidence)),
    benchmark_supported_subset: {
      count: benchmarkSupported.length,
      ids: benchmarkSupported.map(row => row.id),
      mean_confidence: mean(benchmarkSupported.map(row => row.jev.confidence)),
    },
  };
}

async function main(): Promise<void> {
  const inputText = Object.fromEntries(
    await Promise.all(
      Object.entries(INPUTS).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
    ),
  ) as Record<keyof typeof INPUTS, string>;
  const phase2 = await readJsonl(INPUTS.phase2_jev);
  const stress = await readJsonl(INPUTS.stress_jev);
  const audit = JSON.parse(inputText.construct_audit);
  const publishedHigh = JSON.parse(inputText.published_high_confidence);

  if (phase2.length !== 300) throw new Error(`Expected 300 Phase-2 rows, found ${phase2.length}`);
  if (stress.length !== 180) throw new Error(`Expected 180 stress rows, found ${stress.length}`);
  if (audit.cases.length !== 124) throw new Error(`Expected 124 audited rows, found ${audit.cases.length}`);

  const allIds = [...phase2, ...stress].map(row => row.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('Duplicate IDs across Jev datasets');

  const auditMap = new Map<string, Json>(
    audit.cases.map((row: Json) => [row.original_case_id, row]),
  );
  const rows: Json[] = [
    ...phase2.map(row => ({ ...row, dataset: 'phase2_layer_a' })),
    ...stress.map(row => ({ ...row, dataset: 'boundary_stress_v1' })),
  ].map(row => ({ ...row, confidence: confidence(row) }));

  const sets = {
    high_confidence_wrong: rows.filter(row => !row.joint_correct && row.confidence >= 0.9),
    under_mutation: rows.filter(
      row => row.gold_operation !== 'NOOP' && row.pred_operation === 'NOOP',
    ),
    over_mutation: rows.filter(
      row => row.gold_operation === 'NOOP' && row.pred_operation !== 'NOOP',
    ),
  };
  if (sets.high_confidence_wrong.length !== 10) throw new Error('High-confidence count drift');
  if (sets.under_mutation.length !== 24) throw new Error('Under-mutation count drift');
  if (sets.over_mutation.length !== 18) throw new Error('Over-mutation count drift');

  const publishedIds = [...publishedHigh].map((row: Json) => row.id).sort();
  const computedIds = sets.high_confidence_wrong.map(row => row.id).sort();
  if (JSON.stringify(publishedIds) !== JSON.stringify(computedIds)) {
    throw new Error('Computed high-confidence IDs do not match Phase-3 published artifact');
  }

  const detailed = Object.fromEntries(
    Object.entries(sets).map(([name, items]) => [
      name,
      items.map(row => enrich(row, auditMap)).sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  );
  const result = {
    analysis: 'Jev confidence/error-type overlap with Phase-3 blind construct audit',
    generated_without_model_or_api_calls: true,
    definitions: {
      confidence:
        'P(predicted operation) × P(predicted target) for predicted UPDATE/DELETE; target factor 1 for ADD/NOOP.',
      high_confidence_wrong: 'joint_correct=false and confidence>=0.9.',
      under_mutation: 'gold operation is ADD/UPDATE/DELETE and Jev predicts NOOP.',
      over_mutation: 'gold operation is NOOP and Jev predicts ADD/UPDATE/DELETE.',
      benchmark_supported_by_both_reviewers:
        'Both reviewers mark policy_applicable=true and independently output the benchmark operation+target (strict_consensus=true).',
      reviewer_consensus_mismatch:
        'Neither reviewer marks MATERIAL ambiguity; both output the same operation+target, which differs from benchmark gold (audit category B).',
      caution:
        'Reviewer consensus is a construct-validity signal, not adjudicated human gold. NOT_IN_BLIND_AUDIT does not imply mismatch or correctness.',
    },
    source_counts: {
      phase2_layer_a: phase2.length,
      boundary_stress_v1: stress.length,
      blind_audit: audit.cases.length,
    },
    validation: {
      expected_counts_matched: true,
      published_high_confidence_ids_matched: true,
      unique_combined_case_ids: new Set(allIds).size,
      all_audited_error_reviewers_policy_applicable: Object.values(detailed)
        .flat()
        .filter((row: any) => row.audit_coverage)
        .every(
          (row: any) => row.reviewer_A.policy_applicable && row.reviewer_B.policy_applicable,
        ),
    },
    summary: Object.fromEntries(
      Object.entries(detailed).map(([name, items]) => [name, summarize(items as Json[])]),
    ),
    cases: detailed,
    input_sha256: Object.fromEntries(
      Object.entries(inputText).map(([key, value]) => [key, sha256(value)]),
    ),
  };

  await mkdir('results/phase4_precheck', { recursive: true });
  await writeFile(OUTPUT_JSON, `${JSON.stringify(result, null, 2)}\n`);

  const h = result.summary.high_confidence_wrong;
  const u = result.summary.under_mutation;
  const o = result.summary.over_mutation;
  const markdown = `# Jev confidence × construct-audit cross-check

This is a cost-free secondary analysis of frozen Phase-3 JSON. It made no model or API calls and did not alter Phase-2 artifacts.

## Definitions

- **High-confidence wrong:** joint prediction wrong and Jev confidence >= 0.9.
- **Under-mutation:** benchmark gold is ADD/UPDATE/DELETE, while Jev predicts NOOP.
- **Over-mutation:** benchmark gold is NOOP, while Jev predicts ADD/UPDATE/DELETE.
- **Benchmark supported:** both independent reviewers found the frozen policy applicable and matched benchmark operation+target.
- **Consensus mismatch:** both reviewers agreed with each other but disagreed with benchmark operation+target (Phase-3 category B).

Reviewer consensus remains a construct-validity signal, not human-adjudicated replacement gold.

## Results

| Error set | n | Blind-audit coverage | Benchmark supported | Consensus mismatch | Reviewer disagreement | Material ambiguity | Uncovered |
|---|---:|---:|---:|---:|---:|---:|---:|
| Wrong, confidence >= 0.9 | ${h.count} | ${h.audited_count}/${h.count} | ${h.audit_status_counts.BENCHMARK_SUPPORTED_BY_BOTH_REVIEWERS ?? 0} | ${h.audit_status_counts.REVIEWER_CONSENSUS_MISMATCH_WITH_BENCHMARK ?? 0} | ${h.audit_status_counts.REVIEWER_DISAGREEMENT ?? 0} | ${h.audit_status_counts.MATERIAL_AMBIGUITY ?? 0} | ${h.unaudited_count} |
| Under-mutation | ${u.count} | ${u.audited_count}/${u.count} | ${u.audit_status_counts.BENCHMARK_SUPPORTED_BY_BOTH_REVIEWERS ?? 0} | ${u.audit_status_counts.REVIEWER_CONSENSUS_MISMATCH_WITH_BENCHMARK ?? 0} | ${u.audit_status_counts.REVIEWER_DISAGREEMENT ?? 0} | ${u.audit_status_counts.MATERIAL_AMBIGUITY ?? 0} | ${u.unaudited_count} |
| Over-mutation | ${o.count} | ${o.audited_count}/${o.count} | ${o.audit_status_counts.BENCHMARK_SUPPORTED_BY_BOTH_REVIEWERS ?? 0} | ${o.audit_status_counts.REVIEWER_CONSENSUS_MISMATCH_WITH_BENCHMARK ?? 0} | ${o.audit_status_counts.REVIEWER_DISAGREEMENT ?? 0} | ${o.audit_status_counts.MATERIAL_AMBIGUITY ?? 0} | ${o.unaudited_count} |

## Interpretation

- None of the 10 high-confidence errors is supported as an error by both reviewers: 9 are benchmark-policy consensus mismatches, and 1 has reviewer disagreement. Therefore these 10 cases do **not** establish a high-confidence model failure mode under the frozen persistence policy.
- Of 24 under-mutations, 5 are supported by both reviewers as genuine misses under the benchmark/policy mapping; 14 are consensus mismatches, 4 have reviewer disagreement, and 1 stress-set case was outside the blind audit.
- Of 18 over-mutations, 2 are supported by both reviewers as genuine unwanted mutations; 12 are consensus mismatches, 3 have reviewer disagreement, and 1 is materially ambiguous.
- Restricting to benchmark-supported errors leaves 5 under-mutations (mean confidence ${u.benchmark_supported_subset.mean_confidence}) and 2 over-mutations (mean confidence ${o.benchmark_supported_subset.mean_confidence}). The direction of the confidence gap remains, but n=7 is too small for a reliable mechanism claim.
- The aggregate confidence asymmetry is therefore strongly confounded by construct mismatch.

## Uncovered case

- \`boundary-v1-108\`: under-mutation, gold UPDATE M2, Jev NOOP, confidence 0.66. It belongs to the deterministic Boundary Stress set and was not part of the Phase-3 blind audit.
`;
  await writeFile(OUTPUT_MD, markdown);
}

await main();
