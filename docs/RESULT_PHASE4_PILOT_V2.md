# Phase 4 development pilot — stopped at local extraction gate

## Outcome

**Hold formal execution.** The fixed development history was attempted, but the
first local extraction failed provenance and task-scope validation. This is an
implementation/reliability failure, **not** exhaustion of the $1 development
budget, and not a B/C accuracy result. No sample was replaced and no evidence was
silently dropped or corrected.

Budget revisions are additive: $28 cumulative, including $1 development,
$24 formal controllers, $1 formal QA and $2 formal failure/retry/auxiliary costs.
No transfers. Old documents, preregistrations and results remain unchanged.

## Bill and usage

| Quantity | Observed |
|---|---:|
| New paid API requests / bill | 0 / **$0.000000** |
| Unknown bills / in-flight reservations | 0 / $0 |
| Local extraction requests | 1 |
| Local input / output tokens | 2,189 / 566 |
| Local request latency | 10,143.53 ms |
| Accepted sessions / required sessions | 0 / 47 |
| Completed B/C update steps / QA judgments | 0 / 0 |

The one local extraction was physically executed once. Each arm's standalone
accounting includes its full 2,189/566-token shared-work requirement, not half.
That is not two physical requests. Local GPU cost is unmonetized, not zero.
With only one call, its median/mean/p90 coincide and are not a latency estimate.
No complete-history cost or controller savings can be inferred from this run.
All formal pools remain untouched; unused development capacity does not enlarge
any formal pool.

## Failure evidence

The unchanged development ID is `9bbe84a2`. Its first chronological session
contains six user questions/reactions about GAIL's business and six assistant
answers. The local model produced valid JSON with 16 proposed facts, but **all
16 cited assistant turns** (indices 1, 3, 7 or 11), despite the frozen extractor
requiring supporting USER turns. The proposed facts describe company activities,
not the user's significant autobiographical information. This is not just a
one-based/zero-based indexing discrepancy: changing the citation indexes would
not make the acquisition and company details user-supplied personal facts.

The source validator rejected the extraction before memory ingestion. Raw model
output, source payload, usage and latency were retained. An offline replay of
the same output reproduces the rejection with no further inference. HTTP 200
and valid JSON therefore must not be counted as semantic extraction success.
No controller or writer reliability claim is possible: neither was reached.

The runner deliberately stopped instead of relabeling these facts, dropping the
session, changing models, retrying with a different prompt, or replacing the
fixed sample. No frozen execution source was changed after this observation.

## Budget and preservation checks

The final budget simulation suite passed **11/11**, before inference, including
12 independent processes competing for 240 reservations, unknown-charge holds,
restart persistence, exact caps, disallowed pool transfers/config changes,
transport price envelopes, and duplicate-dispatch prevention. Paid dispatch
requires an atomic reservation first. Unknown bills retain their full holds.

Fake local-module checks and TypeScript validation passed, but this live local
failure shows that interface tests alone do not establish extraction reliability.
The pilot-only runner cannot launch a formal experiment. Formal failure-pool
routing is not exercised by this run and must not be described as production
validated.

The independent preservation check passed **75/75 hashes**, with zero mismatches
across its Phase 2/3, original Phase 4 and low-budget-v1 manifest coverage.

## Formal sample size and freeze status

**No defensible formal n is recommended or frozen yet.** The permitted range
remains 12–24 complete histories. There was no measured B/C decision bill and
no completed development history, so choosing 12, 18 or 24 now would violate
the requested cost-based post-pilot selection rule. Earlier low/base/high cost
scenarios remain estimates, not observations.

Already frozen: the development ID, cumulative pool limits, pilot code/prompts,
controller protocols, local settings/weight hashes, reservation policy and raw
failure. Not frozen: formal n/IDs and final formal executable/scoring manifest.
`phase4/formal_readiness_v2.json` records this explicitly; it is not a formal
execution approval or a completed preregistration of test membership.

The next bounded repair is confined to the existing local extractor's separation
of user evidence from assistant context and its task-scope/provenance handling.
Any follow-up development should retain this same sample and cumulative $1
development pool, preserve this failed attempt, and create a new implementation
version. It has **not** been launched. No new model, method, training, task,
sample replacement, or larger budget is proposed.

## Evidence and writing recommendation

| Intended evidence | Current status | Claim allowed |
|---|---|---|
| Budget safety and artifact preservation | Simulated checks pass | Engineering guard tested in the stated cases |
| Natural-history local extraction | First session rejected | Current implementation not ready for formal inference |
| B/C complete-system quality–cost difference | Not measured | None from this pilot |
| Previous Phase 2/3 controller results | Preserved, not rerun | Prior limited evidence, retaining mismatch/audit caveats |

**Do not start the formal experiment or write a new quality–cost results claim
yet.** This gate failure does not overturn Phase 3's research GO; it prevents an
unreliable shared module from contaminating the proposed system comparison.
Repair and validate the existing local pipeline before asking for a concrete
formal-run confirmation. Do not expand the research scope to pursue a venue.

## Files

- Revision: `PHASE4_LOW_BUDGET_REVISION_V2.md`
- Runtime budget: `phase4/budget_config_v2.json`
- Guard specification/tests: `BUDGET_GUARD_V2_SPEC.md`, `phase4/budget_guard_v2_simulation.json`
- Pilot execution: `PHASE4_PILOT_EXECUTION_V2.md`, `phase4/pilot_execution_manifest_v2.json`
- Bill/usage/raw/state: `results/phase4_low_budget_v2/development/`
- Reconciliation: `results/phase4_low_budget_v2/development/reconciled_summary.json`
- Preservation: `phase4/preservation_check_v2.json`
- Readiness: `phase4/formal_readiness_v2.json`
- Final artifact hashes: `phase4/pilot_final_manifest_v2.json`
