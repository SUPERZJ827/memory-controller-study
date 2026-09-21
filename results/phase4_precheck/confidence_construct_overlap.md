# Jev confidence × construct-audit cross-check

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
| Wrong, confidence >= 0.9 | 10 | 10/10 | 0 | 9 | 1 | 0 | 0 |
| Under-mutation | 24 | 23/24 | 5 | 14 | 4 | 0 | 1 |
| Over-mutation | 18 | 18/18 | 2 | 12 | 3 | 1 | 0 |

## Interpretation

- None of the 10 high-confidence errors is supported as an error by both reviewers: 9 are benchmark-policy consensus mismatches, and 1 has reviewer disagreement. Therefore these 10 cases do **not** establish a high-confidence model failure mode under the frozen persistence policy.
- Of 24 under-mutations, 5 are supported by both reviewers as genuine misses under the benchmark/policy mapping; 14 are consensus mismatches, 4 have reviewer disagreement, and 1 stress-set case was outside the blind audit.
- Of 18 over-mutations, 2 are supported by both reviewers as genuine unwanted mutations; 12 are consensus mismatches, 3 have reviewer disagreement, and 1 is materially ambiguous.
- Restricting to benchmark-supported errors leaves 5 under-mutations (mean confidence 0.704) and 2 over-mutations (mean confidence 0.56). The direction of the confidence gap remains, but n=7 is too small for a reliable mechanism claim.
- The aggregate confidence asymmetry is therefore strongly confounded by construct mismatch.

## Uncovered case

- `boundary-v1-108`: under-mutation, gold UPDATE M2, Jev NOOP, confidence 0.66. It belongs to the deterministic Boundary Stress set and was not part of the Phase-3 blind audit.
