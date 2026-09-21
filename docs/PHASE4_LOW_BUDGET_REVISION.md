# Phase 4 low-budget revision — proposal, not permission to run

Status: PLANNING_ONLY_AWAITING_PILOT_APPROVAL. This document records the user's
new $20 incremental API ceiling. No paid or local inference was performed to
prepare it. Only filesystem analysis and read-only model-catalog checks were used.

## The one missing piece of evidence

Run a small paired closed-loop study on natural-language **knowledge updates**:
B uses GPT-5.6 Sol to decide operation/target; C uses frozen Jev. Both use the
same local extractor, writer, embeddings and answerer, but maintain their own
stores. Measure final QA, traceable examples of state divergence, complete API
spend, local work, and elapsed time.

This can establish the observed quality–cost trade-off of replacing the
controller in this particular configuration and sample. It cannot establish
quality equivalence, broad frontier-model superiority, or a general long-term
state-stability advantage. A/B separation itself is not identified because A is
not run. The stronger architectural claim requires evidence beyond this budget.

The publication objective is a focused empirical paper that may be suitable
for a CCF C venue. A B-level submission would depend on evidence already
obtained, not automatic expansion. No acceptance or venue tier is guaranteed.

## What this revision supersedes

All Phase 1–3 data/results/policies and earlier Phase 4 preregistrations remain
untouched. For this new run only, this proposal supersedes:

- full 456/500-question execution and paid A/D arms;
- the −3 pp non-inferiority claim and mandatory 10% saving threshold;
- the $800 proposal and earlier three-digit cost envelope;
- the requirement to complete the old 120-case human state audit this round.

Earlier preregistrations are historical plans, not results. Formal inference
has not occurred. The eventual low-budget executable manifest must explicitly
name this revision and must not inherit the abandoned hypotheses.

## Scope and common modules

| Component | Proposed setting | API spend |
|---|---|---|
| B controller | `openai/gpt-5.6-sol`, medium reasoning, operation/target JSON, 512 maximum completion tokens | Paid |
| C controller | `typesafe/jev-1.13`, original frozen policy; operation then target when required | Paid |
| Extractor | Existing `Qwen3-8B`, local endpoint 9910 | No new API bill; local work recorded |
| B/C writer | Same local Qwen3-8B and exact prompt/schema/settings | Local |
| Answerer | Same local Qwen3-8B, question + each arm's retrieved context | Local |
| Embeddings | Existing `Qwen3-Embedding-4B`, endpoint 9010 | Local |
| QA judge | `openai/gpt-4o-2024-08-06`, official task-specific prompt, temperature 0, max 10 output tokens | Paid, separately budgeted |

Read-only `/v1/models` checks returned HTTP 200 for Qwen3-8B (32,768 context)
and Qwen3-Embedding-4B (8,192 context). This establishes service availability,
not extraction/writing/QA competence; that is a development-pilot question.
These are shared local services, so no exclusive GPU access is assumed.

No training, rental GPU, paid alternate extractor, new memory framework, or
new selective-fallback method is proposed. Reuse project code and a small local
store/retrieval adapter. Describe it as a controlled harness informed by the
Mem0 paper architecture, not a current Mem0 product reproduction.

Common rules: top-10 update candidates from each arm's own active state;
fixed query retrieval budget; identical current/historical/tentative/retracted
representation. Preserve timestamped historical evidence under the existing
two-layer proposal. Log how often answers rely on the common history layer:
it may mask active-state differences and must limit the interpretation.
No extra local model should silently correct one arm's operation decision.

The local extractor runs independently of arm state. Share its exact outputs
and embeddings when inputs match; the writer depends on arm state and is
shared only when the complete request is identical. Timestamp, negation,
tentativeness and retraction cues must survive extraction; pilot inspection
checks this. Process all sessions in every selected history. Do not choose a
cheap prefix or give a method oracle evidence sessions.

## Data and selection

Use the existing pinned `longmemeval_s_cleaned.json`, hash
`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
The previously implemented strict timestamp rule leaves 456 eligible questions,
including 77 knowledge-update questions. This rule is a conservative local
interpretation of `question_date`, not an independently established error in
the official benchmark. Disclose its effects; never call this a full official
LongMemEval score.

This run deliberately studies only those 77 knowledge-update histories. This
is a task-defined scope selected before predictions, not a filter for favorable
controller results. Reserve one fixed development question by ascending
SHA-256(`phase4-low-budget-dev-v1` NUL question_id). The other 76 form the test
pool. Neither the previous model-consensus subset nor MemOps failures enter it.

The resulting fixed development ID is `9bbe84a2`, with 47 eligible sessions;
see `phase4/low_budget_development_selection.json`. Its identity is orchestration
metadata and never enters a write-time model prompt. Formal membership remains
unselected until the pilot expense is known.

After the pilot, choose a fixed n of 12–24 complete histories using costs only.
If even 12 histories are not credibly affordable, stop with a feasibility
finding rather than invent a cheaper benchmark. Rank the test pool by
SHA-256(`phase4-low-budget-test-v1` NUL question_id) and take the first n.
Freeze IDs, source/adapter hash, local weights/tokenizer/config identities,
prompts, schemas, failure behavior, retrieval budgets, scores and analysis
before any formal B/C predictions. Do not pick shorter histories or fewer-fact
examples. Do not increase n after results or because money remains.

## Development pilot: at most $1, approval required

1. Prepare exact prompts and budget guard; run fake-only resume/concurrency
   tests. Inspect local weights/service settings and fail if identity is unclear.
2. Run local extraction on the one fixed development history; preserve every
   session and provenance. These outputs belong to development, not evaluation.
3. Run B/C through that full history, then local QA and the two official-style
   judge calls. All paid calls share the **$1 pilot cap**, including transport
   retries, parse failures, judges and auxiliary requests. Reserve the two judge
   calls before ingest begins.
4. If reservation cannot fund the next call, halt and report an incomplete
   pilot. Do not shorten the history, move to a cheaper dev example, or add funds.
5. Inspect transport/schema, local extraction fidelity, writer target adherence,
   tokens, costs, fact count and latency. A development result cannot count as a
   formal result. No controller-policy tuning on its errors.

Illustrative full-pilot costs are $0.15 (low), $0.47 (base), and $1.50 (high).
The high scenario cannot finish below $1. The cap is a dispatch
constraint, not a promise that the full pilot will finish.

Before formal predictions, estimate a complete paired-history expense from
the measured pilot. Local-only extraction on the prospective test pool can
measure fact counts without observing formal B/C decisions or judge scores;
its compute must be included in experiment-resource reporting. Use these counts
to improve cost estimates, not to alter membership toward cheap histories.
Choose the largest n in 12–24 whose projected controller spend, multiplied by
1.5, fits $16. Use conservative measured input/output-token costs, retaining
reasoning tokens; this factor is a planning allowance, not a statistical bound.
The request reservation gate remains authoritative if the forecast is wrong.

Approval for a development pilot does not authorize formal inference. Present
the measured pilot invoice and frozen formal manifest for a separate approval;
both phases cumulatively remain inside the same $20 cap.

## Budget and request reservation

| Envelope | Maximum new API spend | Includes |
|---|---:|---|
| Development pilot | $1.00 | All development controllers, judges, retries and failures |
| Formal B/C successful controller calls | $16.00 | Both controllers, including Jev target stage |
| Formal QA scoring | $1.00 | Both arms and any predeclared judge handling |
| Formal failed attempts/retries/auxiliary | $2.00 | Every other billed call and uncertain-charge reserve |
| Total | **$20.00** | Entire new round; no extra allowance |

Unused pools are not automatically reassigned. A retry must fit both its pool
and the global envelope. Reserve the first attempt's worst-case cost in its
stage pool and keep the same reserve in the retry pool as failure contingency
until completion. This avoids accepting a potentially billed failure with no
place to charge it. The global physical call is counted once, not twice.

The existing ledger records completed costs but does **not** yet implement
this reservation gate. Before any paid pilot, add a transactionally enforced
dispatch guard with integer microdollars, global/campaign and stage-pool caps:

`settled_charge + uncertain_charge_hold + in_flight_reservations + new_reserve <= cap`.

The check and reservation must commit atomically **before** network dispatch;
every worker/process uses the same database. All new auxiliary calls go through
this path too. A provider maximum price, request input bound and output budget
are required. Do not substitute expected/mean cost for a reservation.

For GPT, reserve verified input-token upper bound at uncached input price plus
all 512 permitted completion tokens at output price; reasoning is included in
completion tokens, not charged twice. For the judge, include its complete
prompt/schema and 10 output tokens. Token estimates based on characters/4 are
for planning only; they are not dispatch bounds. If tokenizer/template overhead
cannot be bounded, do not send the request until a defensible bound exists.

Jev's catalog currently lists 32,000 context and $0.042/M input, zero output.
An intentionally conservative bound is $0.001344 for each Decisions request;
reserve operation and possible target calls separately (at most $0.002688 before
retries). Revalidate this bound against endpoint metadata before the pilot.
Freeze allowed providers and tariffs; pause on any unbounded fee/routing change.

Set SDK/HTTP automatic retries to zero; the dispatcher owns at most one retry
for transport/rate-limit/server failure, separately reserved. Semantic invalidity
gets no retry or improved prompt. A timeout does not prove zero billing: retain
its whole worst-case hold until reconciled. Cancellation does not release an
uncertain charge. On crash, restore holds and reconcile in-flight IDs before
any resend. Stop scheduling when funds cannot cover the next reserved call.

The formal fixed denominator does not shrink after a budget stop. Archive all
partial outcomes and declare the run incomplete; a completed-pairs-only table
may be diagnostic, never the planned primary estimate. No automatic expansion,
budget refill, follow-up phase or new baseline.

## Parallelism and fair accounting

No extra API calls are created for speed. Start with at most two independent
history workers and two total paid requests in flight; each arm's events remain
serial. Local model inference uses one queue on the existing shared GPU service;
do not run timing competitors against each other uncontrolled. Cache identical
common work. Freeze these limits with the final protocol.

Per arm and module report input/output/reasoning/cache tokens, call counts,
failed-call cost, median/mean/p90 latency, queue wait and end-to-end elapsed time.
Output tokens already include reasoning where the provider uses that convention.
Separate actual physical API bill from standalone API attribution. Shared local
extraction/embedding work is attributed in full to each standalone method.

Complete-system reporting must include local compute: model, hardware if
observable, tokens, service/queue time, and wall time. If energy/exclusive GPU
seconds are unavailable, mark them unavailable; elapsed service time on a
shared server is not exclusive GPU time. Report a cost formula
`API dollars + local GPU-hours × stated hourly rate` only if hours are validly
measured. Otherwise do not give a fully monetized system-saving ratio.

## Scoring and uncertainty

Primary outcome: C minus B final QA accuracy on the fixed knowledge-update test
sample. Use the pinned official question-type scoring prompt with a fixed
GPT-4o snapshot; blind model/arm identity. Store all raw judgments. LLM judgments
are automated QA scores, not human gold. Paired 20,000-resample bootstrap by
question, seed 20260920; report delta, interval, four disagreement counts and
exact McNemar as descriptive support. With 12–24 questions the interval can be
wide or degenerate when all paired outcomes agree; neither situation proves
equivalence. Show all counts and the small-sample limitation.

No −3 pp pass/fail or minimum cost-saving requirement. Report measured results,
including zero gain, worse QA, or a dominant local-writer bottleneck. Keep
unknown judge outputs visible. For a conservative predeclared failure rule,
unparseable/missing QA judgments receive score zero and are also counted as
evaluation failures; no prompt repair. Compare sensitivity to this rule.

Preserve before/after state and source spans for every step. An optional fixed
sample of eight histories can receive human state inspection with the same
anonymous examples across arms. If independent human adjudication is unavailable,
report automatic invariants and traceable qualitative cases only; no formal
comparative state-accuracy or causal propagation claim. Do not run paid LLM
state reviewers or counterfactual branch replays this round.

## Evidence and writing decision at the end of this round

Deliver a single results bundle: controller-only legacy evidence with mismatch
disclosure; new paired QA/cost evidence; module-level usage and local compute;
state examples; frozen hashes and budget reconciliation. Include the evidence
table and contribution/claim boundaries in `RESULT_PHASE4_LOW_BUDGET.md`.

Write a focused empirical paper only if the new run completes with auditable
costs and a meaningful, interpretable controller trade-off. A negative or null
finding may support an evaluation/construct-validity paper if the evidence is
substantive; it is not automatically publishable. Stop if local extraction,
writing or retrieval prevents attribution, the budget cannot complete the fixed
sample, or apparent benefit is only provider price arithmetic with no useful
system evidence. State a write/stop recommendation without another experiment
or spending proposal. No automatic venue-driven scope expansion.
