# Phase 4 low-budget revision v2 — $28 cumulative cap

Status: DEVELOPMENT AUTHORIZED ONLY AFTER BUDGET SIMULATION TESTS PASS.
The user authorizes the existing fixed development pilot up to **$1 all-in**.
Formal inference is not authorized. This amendment preserves and supersedes
the spending/authorization fields of `PHASE4_LOW_BUDGET_REVISION.md` and
`phase4/low_budget_protocol_proposal.json` for future execution. All old files,
results, policies, sample selections and preregistrations remain historical
artifacts; no earlier measurements are changed.

## Scope and authorization

The missing evidence remains a paired, natural-language closed-loop comparison
of **B: GPT-5.6 Sol decision plus local common writer** against **C: frozen Jev
decision plus the same local common writer**. Existing Qwen3-8B and
Qwen3-Embedding-4B provide extraction, writing, retrieval embeddings and answering.
Each arm maintains its own state and retrieves from that state. No new model,
training, GPU rental, task, baseline or method is introduced.

The development question remains `9bbe84a2`: all **47** eligible sessions in
`phase4/low_budget_development_selection.json`. Pilot inspection concerns
implementation, extraction/writing fidelity and measured expense. It does not
require Jev to win, does not permit policy tuning, and does not contribute to the
formal quality estimate. If the pilot cannot finish under $1, halt and report;
do not replace its sample, truncate it, borrow funds or increase its allowance.

## Cumulative spending and fixed pools

| Pool | Ceiling | Included requests |
|---|---:|---|
| Development (`dev`) | $1 | All pilot calls, scoring, failures, retries and auxiliaries |
| Formal controllers (`formal_controllers`) | $24 | Formal B/C controller work |
| Formal QA (`formal_qa`) | $1 | Formal automated QA scoring |
| Formal auxiliary (`formal_aux`) | $2 | Formal failed attempts, retries and auxiliary requests |
| **Whole Phase 4 increment** | **$28** | All the above, with no additional pilot allowance |

The machine-readable caps are `phase4/budget_config_v2.json`, in integer
micro-USD. Each pool is independent; unused development or scoring capacity may
not be transferred. All pilot calls belong to `dev`, including retries and
judges, even though a formal auxiliary pool exists. Formal pools cannot be used
until the concrete frozen formal run is approved.

Before dispatch, reserve a defensible upper-bound charge atomically against
both the global ceiling and the applicable pool:

`settled + unresolved/unknown holds + in-flight reservations + next reserve <= cap`.

Every paid path must use the same persistent guard. Concurrent workers must not
check balances and reserve separately. Include full request input at an uncached
upper price plus maximum output/reasoning allowance; expected scenario cost is
not a safe dispatch bound. Unknown bills, timeouts and crash-recovered requests
continue occupying their full reservation until positively reconciled. Do not
release on cancellation or assume failure is unbilled. SDK automatic retries are
disabled; each allowed transport retry requires a fresh reservation. Semantic
errors do not trigger improved-prompt retries. A formal failed-attempt allocation
must be secured before any request that could need it; a pool may not silently
borrow from another after the outcome.

The interceptor must pass fake concurrent-request, exact-cap, pool-isolation,
timeout/unknown-charge, crash/resume, retry and settlement tests **before the
first paid pilot call**. This document is a requirement, not a claim that tests
have passed; the execution bundle records actual test evidence.

## Updated estimate and post-pilot freeze

`phase4/low_budget_estimates_v2.json` derives scenario arithmetic from the
preserved v1 estimate. Its prices are the old snapshot and must be validated
before dispatch. Formal scenarios retain the illustrative 48 sessions/history;
the development forecast is corrected to the actual 47 sessions. Low/base/high
pilot forecasts are about **$0.1434 / $0.4635 / $1.4716** before retries.
The high scenario still cannot finish within the authorized pilot envelope.

Formal scale stays **12–24 complete histories**, selected from the same 76-item
test pool by ascending SHA256(`phase4-low-budget-test-v1` NUL question_id).
After a complete pilot, use measured costs and, if needed, local-only fact
counts to choose the largest n in that range whose projected B/C controller
expense times **1.5** fits **$24**, and whose projected QA expense fits **$1**.
The factor is a planning allowance, not a statistical guarantee. Unknown holds
must also be reflected in available funds. If n=12 is not feasible, stop.

Do not use pilot accuracy, formal predictions or scores to choose n or members.
Do not favor short histories. Freeze source/adapter hashes, IDs, complete-history
processing, model identities, prompts, schemas, scoring and failure behavior,
retrieval limits and analysis before formal prediction. Return the pilot invoice,
unresolved reservations, pipeline problems, recommended n and freeze manifest to
the user, then wait for confirmation of that specific formal run. No automatic
expansion, budget addition, pool reallocation or next stage.

## Interpretation and accounting retained

Keep the existing no-future-evidence projection and exclude question, answer,
evidence-location annotations and future turns from write-time inputs. Preserve
independent arm state without oracle correction. The subset is a task-specific
knowledge-update study, not a full official LongMemEval result.

Report paired QA difference and interval, module input/output/reasoning/cache
tokens, actual API invoice, standalone attribution, local service/queue time and
latency. Shared physical calls count once in the bill and fully in each arm's
standalone attribution. Local compute is not claimed to be free. No −3 pp
non-inferiority criterion or fixed full-system savings threshold applies.

Legacy results retain construct-mismatch disclosures. Selected sensitivity
subsets are not unbiased new tests, and LLM judgments or agreement are not human
gold. At round end report the contribution/evidence table and a write-or-stop
recommendation for a focused empirical paper; the target venue does not justify
more experiments, budget or claims.

Execution configuration: `phase4/low_budget_protocol_v2.json`. Estimator:
`src/phase4/estimate_low_budget_v2.ts`. Pilot results and final formal freeze are
separate future artifacts; they are not asserted by this amendment.
