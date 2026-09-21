# Phase 4 Low-Budget Full-System Experiment

## Status and recommendation

The frozen 24-history B/C experiment completed without changing the sample,
controller prompts, models, reasoning settings, scoring rule, or independent
state execution after predictions were observed.

**Recommendation: proceed to a scoped empirical paper draft and stop new
experiments for this round.** The defensible paper claim is a quality-cost
trade-off from separating memory-operation decisions from local content
generation. The evidence does not establish that Jev is more accurate than
GPT-5.6 Sol, that Jev maintains a more correct latent memory state, or that the
complete system is 47.8 times cheaper.

## Frozen comparison

- B: `openai/gpt-5.6-sol`, medium reasoning, operation/target only, followed by
  the common local writer.
- C: `typesafe/jev-1.13`, frozen Phase-1 policy, operation/target only, followed
  by the same local writer.
- Data: 24 prespecified LongMemEval histories, 1,106 chronological sessions,
  and 6,912 extracted-fact decisions per arm.
- State: each arm maintained its own database; no gold-state restoration was
  used.
- Shared local modules: Qwen3-8B extraction/writing/answering and
  Qwen3-Embedding-4B retrieval.
- Outcome: final QA correctness under the frozen official rubric, scored by
  `openai/gpt-4o-2024-08-06`. This is automated rubric scoring, not human gold
  state annotation.

## Main result

| Metric | B: GPT-5.6 Sol | C: Jev | Bounded reading |
|---|---:|---:|---|
| Overall QA | 15/24 (62.50%) | 17/24 (70.83%) | C - B = +8.33 pp; small-sample uncertainty is large |
| Knowledge-update QA | 15/21 (71.43%) | 17/21 (80.95%) | Descriptive slice; not separately powered |
| Abstention QA | 0/3 (0%) | 0/3 (0%) | Shared retrieval/reader failure; n=3 |
| Controller median latency | 2,324.8 ms | 391.6 ms | Jev is 83.15% lower, or 5.94x faster, for the controller decision |
| Controller mean latency | 2,421.0 ms | 417.0 ms | Successful logical decisions |
| Controller p90 latency | 3,562.5 ms | 483.6 ms | Successful logical decisions |
| Controller-only API cost | $12.553182 | $0.262391 | GPT is 47.84x the Jev controller cost |
| Controller input tokens | 4,423,301 | 6,247,405 | Jev's operation/conditional-target protocol uses more input tokens |
| Controller output tokens | 370,658 | 337,866 | Provider usage fields; GPT includes 230,791 reasoning tokens |
| Per-arm paid API cost incl. QA judge | $12.560567 | $0.269779 | Local hardware and energy remain unmonetized |
| Per-arm full-path input tokens | 8,306,845 | 10,333,538 | Includes shared extraction attributed to each arm and arm-specific local work |
| Per-arm full-path output tokens | 3,157,852 | 3,149,098 | Includes local extraction/writing/answering |

The controller cost ratio is a component result. Jev made more mutation
decisions and therefore invoked more local writing and embedding work. Its
full-path input-token count was 24.40% higher than B's. Because local GPU time,
energy, and amortized hardware cost were not monetized, this experiment cannot
convert the 47.84x controller ratio into a complete-system monetary saving.

## Paired QA analysis

| Paired outcome | Histories |
|---|---:|
| Both correct | 15 |
| B only correct | 0 |
| C only correct | 2 |
| Both wrong | 7 |

- C minus B accuracy: **+8.33 percentage points**.
- 20,000-resample paired bootstrap 95% CI: **[0.00, +20.83] pp**.
- Exact two-sided McNemar: **p = 0.5**, with 2 discordant histories.

The run did not detect evidence that C was worse, and C was numerically correct
on two additional histories. The sample is too small to establish superiority
or a prespecified non-inferiority claim. The two C-only successes concerned the
direction of a coffee-limit update and the current Starbucks Rewards threshold.
There were no B-only successes in this sample.

## Controller behavior and state boundary

There is no step-level gold operation or final-state annotation for this Phase-4
sample. The following values describe behavior, not correctness.

| Behavior over 6,912 facts per arm | B: GPT | C: Jev |
|---|---:|---:|
| ADD | 1,783 | 3,162 |
| UPDATE | 387 | 154 |
| DELETE | 0 | 0 |
| NOOP | 4,742 | 3,596 |
| Mutation rate | 31.39% | 47.97% |
| Tentative-evidence mutation rate | 14.00% | 32.11% |
| Final active memories, mean/history | 74.2 | 131.7 |
| Final active memories, total | 1,781 | 3,160 |

Jev retained more information in every history: its final active store was
larger by a mean of 57.5 records. This may explain its two QA gains, but the
experiment cannot distinguish useful retention from memory contamination.
There were only two extracted retraction facts and neither controller issued a
DELETE, so Phase 4 provides no general deletion evidence. The earlier frozen
operator and boundary studies remain relevant supporting evidence, subject to
their documented benchmark-policy mismatch.

## Failure analysis

1. **Shared abstention failure.** Both arms scored 0/3 on the small abstention
   slice. The common retriever surfaced lexically similar evidence about a
   different entity or role, and the local answer model returned a value instead
   of abstaining. This is a shared-system boundary, not evidence favoring either
   controller.
2. **Stale-value selection.** Both arms answered four knowledge-update histories
   with an older value, including page count, sneaker location, coffee ratio,
   and Saturday wake time. The error may arise from state mutation, retrieval,
   or answer selection; the current artifacts do not identify a single causal
   stage.
3. **Aggressive Jev retention.** Jev mutated tentative evidence more than twice
   as often as GPT and ended with substantially larger active stores. The two
   extra correct QA outcomes coexist with a plausible contamination risk that
   needs human state labels to resolve.
4. **Shared writer reliability.** Each arm recorded two mutation execution
   errors under the common deterministic failure rule; the post-ingest,
   pre-mutation state was retained. These are full-system failures, not valid
   successful mutations.
5. **Infrastructure reliability.** Three Jev requests returned OpenRouter HTTP
   520. Each was retried once with byte-identical request JSON under the
   preregistered transport-retry allowance and succeeded. Failed raw records and
   unknown billing holds remain preserved. Local extraction recorded 26
   180-second timeouts and two fetch failures that succeeded within the frozen
   local retry rules, plus one preserved pre-dispatch bookkeeping row.

## Budget reconciliation

| Scope | Known provider-exact charge | Guard-settled charge | Unknown/in-flight upper hold |
|---|---:|---:|---:|
| Development pilot | $0.581100 | $0.581250 | $0 |
| Formal controllers | included below | $12.819034 | $0.004032 |
| Formal QA | included below | $0.014786 | $0 |
| Formal auxiliary retries | included below | $0.000105 | $0 |
| Formal total | $12.830346 | $12.833925 | $0.004032 |
| Campaign total | $13.411445 | $13.415175 | $0.004032 |

The budget guard's committed amount, including conservative unknown holds, is
**$13.419207**, below the $28 hard cap. It also remains within every immutable
pool: development $1, formal controllers $24, formal QA $1, and formal
auxiliary $2. Guard-settled amounts round every request upward to the nearest
micro-dollar, so they exceed provider-exact known charges slightly. The three
HTTP 520 requests have no provider usage record; their combined $0.004032 upper
bound remains reserved rather than being treated as free.

## Contribution and evidence ledger

| Candidate contribution | Evidence that supports it | Evidence boundary |
|---|---|---|
| Decision/generation separation as a memory-system interface | B and C share local extraction, writing, embeddings, answering, and scoring while replacing only the decision controller | This is an empirical architecture comparison, not a new trained algorithm |
| Budgeted closed-loop evaluation harness | Frozen histories, independent arm states, chronological ingestion, raw calls, per-request token/cost/latency, and durable retry accounting | Operational amendments must remain disclosed; local hardware cost is unpriced |
| Quality-cost trade-off in a complete natural-language loop | 24 histories, 6,912 decisions/arm, paired QA, controller and full-path usage | Automated QA judge, small n, one dataset projection, no human state gold |
| Behavioral boundary of controller replacement | Operation distributions, tentative mutation rates, active-store sizes, C-only and common failures | Descriptive behavior cannot be relabeled as state accuracy |
| Prior operator feasibility evidence | Frozen Phase-2/3 operator, trajectory, construct-audit, and stress results | Rule mismatch and selected sensitivity subsets are disclosed; they are not an unbiased Phase-4 gold set |

The development history supports implementation and cost feasibility only. It
is excluded from the 24-history formal quality result. The old MemOps results
support operator-level feasibility and known boundaries, but they are not
silently pooled with the independent Phase-4 QA estimate.

## Paper-facing claim

A defensible main claim is:

> In a budget-bounded 24-history evaluation with shared local generation and
> independent memory states, replacing a GPT-5.6 Sol operation controller with
> Jev reduced controller median latency by 83% and controller API cost by 97.9%,
> while final QA was 17/24 versus 15/24. The paired quality difference was not
> statistically significant, and Jev's higher mutation rate increased local
> workload and left state correctness unresolved.

The paper should not claim that Jev is more accurate, that the methods are
statistically equivalent, that Jev has a more correct memory state, or that the
complete system is 47.84 times cheaper.

## Writing versus stopping

Proceed with a focused CCF-C-scope empirical paper draft centered on the
decision/generation separation and its measured trade-off. Use Phase 2/3 as
operator-feasibility and construct-validity support, and Phase 4 as the primary
system evidence. Make the automated judge, 24-history sample, abstention
failure, missing human state gold, aggressive Jev mutation, unmonetized local
compute, and post-start operational amendments explicit limitations.

Stop experimentation for this authorized round. Do not automatically add
histories, models, tasks, money, or a selective-fallback method. A later study
would need separate authorization and should prioritize human state annotation
and full hardware/energy metering rather than another controller leaderboard.

## Reproducibility pointers

- Formal freeze: `phase4/formal_freeze_v15.json`
- Final runtime amendment: `phase4/formal_runtime_amendment_v25.json`
- Terminal outcome: `results/phase4_formal_v17/outcome.json`
- Main analysis: `results/phase4_formal_v17/analysis.json`
- Per-history outcomes: `results/phase4_formal_v17/analysis_history_outcomes.csv`
- Per-step controller data: `results/phase4_formal_v17/analysis_controller_steps.csv`
- Cost/latency data: `results/phase4_formal_v17/analysis_cost_breakdown.csv`
- Operation data: `results/phase4_formal_v17/analysis_operation_breakdown.csv`
- Raw calls and failure attempts: `results/phase4_formal_v17/calls/` and
  `results/phase4_formal_v17/failed_attempts/`
