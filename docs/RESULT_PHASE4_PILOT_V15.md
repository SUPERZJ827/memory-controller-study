# Phase 4 fixed-history development pilot — complete

## Decision

**READY FOR THE FROZEN 24-HISTORY FORMAL B/C RUN, AWAITING EXPLICIT CONFIRMATION.**

The repaired local pipeline completed the same fixed development history. It
did not change the research question, add a model, train anything, replace the
sample, or use pilot accuracy to choose formal membership. No formal prediction
has been requested or viewed.

## Actual bill and budget

| Item | Result |
|---|---:|
| Budget-guard settled development spend | **$0.581250** |
| Exact provider-reported sum | $0.58109998 |
| Unknown / held / in-flight amount | $0 / $0 / $0 |
| Remaining $1 development pool | $0.418750 |
| Formal controller / QA / auxiliary pools used | $0 / $0 / $0 |

The $0.00015002 difference is conservative per-request rounding to integer
micro-USD. All extraction-repair attempts were local and incurred no API bill;
their GPU cost was not monetized.

## Fixed-history result

| Metric | B: GPT-5.6 Sol separated | C: Jev separated |
|---|---:|---:|
| Decisions with valid operation/target | 310 / 310 | 310 / 310 |
| ADD / UPDATE / DELETE / NOOP | 78 / 10 / 0 / 222 | 143 / 1 / 0 / 166 |
| Final active memories | 78 | 143 |
| Tentative mutations | 7 / 126 (5.56%) | 29 / 126 (23.02%) |
| Controller API cost | $0.568732 | $0.01176798 |
| Controller input / output / reasoning tokens | 208,656 / 15,142 / 8,926 | 280,190 / 14,530 / 0 |
| Median controller step latency | 1,900 ms | 399 ms |
| p90 controller step latency | 3,316 ms | 497 ms |
| QA answer / official judge | `level 100` / yes | `level 100` / yes |

Jev used about **1/48.3** of GPT's controller API cost and had about 79% lower
median decision-step latency in this history. This is controller-only API cost,
not a fully monetized system saving. The shared local extractor used 118,089
input and 94,106 output/thinking tokens; writer, embedding and reader compute is
also unmonetized.

Operation agreement was 73.55%; joint operation/target agreement was 73.23%.
Jev produced substantially more active memories and mutated 23.02% of evidence
classified tentative, versus 5.56% for GPT. That is a concrete potential
over-mutation/contamination signal, not evidence that Jev's larger state is
better.

Both answers were correct, but this single QA cannot establish equal quality.
GPT retrieved 10/10 sources from the common archive and zero active records;
Jev retrieved seven archive and three active records. The shared archive can
mask active-state errors, so the yes/yes result does not validate either final
state or demonstrate a Jev state-quality advantage.

## Reliability findings

The first extractor failure was fixed as an implementation problem. Final facts
are immutable USER text rather than model-generated paraphrases. The fixed
history yielded 757 candidate fragments, 337 source-level exclusions and 310
retained facts across all 47 sessions. The GAIL distractor produced an empty
result, while 74 signed/unattributed long testimonial/article fragments were
excluded. Empty output is a valid result.

The repair exposed four practical issues which remain part of the evidence:

1. Strict JSON grammar suppressed useful Qwen deliberation and initially caused
   assistant contamination or all-keep behavior.
2. Thinking mode can loop: one batch exhausted 8,192 tokens. The frozen rule
   records the failure and splits only that batch into single-item judgments.
3. One response supplied all required verdicts plus an unknown key `"0"`; it was
   logged and ignored. Missing required keys are still fatal.
4. The closed-loop run had one local embedding transport failure. Attempt 1 was
   archived; the one permitted infrastructure retry succeeded. No semantic
   prediction was retried and successful paid calls were replayed from durable
   records without repurchase.

These findings justify the formal run as a robustness/quality-cost measurement;
they do not justify claiming that the extractor is independently accurate.

## Formal size and frozen membership

The measured B+C controller bill was $0.58049998 per development history.
For 24 histories this projects to $13.932; with the preregistered 1.5 planning
allowance it is $20.898, below the fixed $24 controller pool. The measured judge
pair was $0.0006, projecting to $0.0144 for 24 histories, below the $1 QA pool.

Therefore the cost-only rule selects the maximum allowed **n = 24**. Membership,
order, seed, protocols and scoring are frozen in `phase4/formal_freeze_v15.json`.
The list contains three `_abs` cases; those use the official unanswerable rubric,
while answerable cases use the official knowledge-update rubric. Selection used
the predeclared hash rank and excluded the development ID. Accuracy and the
yes/yes QA result played no role.

This projection comes from one history; it is not a guarantee. The formal budget
guard remains authoritative and pool transfers remain prohibited. A budget stop
must not trigger sample replacement, history truncation, or automatic funding.

## Recommendation

Run only the frozen B/C formal experiment after explicit confirmation. Do not
add models, tasks, training, or methods. The formal report should focus on paired
QA quality, active-state contamination/omission evidence, complete token/latency
accounting, and the observed cost tradeoff. In particular, it must test whether
Jev's low controller cost survives its much higher tentative-mutation and state
growth rates.

This development history is evidence that the implementation can complete and
stay inside budget. It is not a paper result and does not support equivalence,
non-inferiority, or a claim that Jev maintains better state.

## Main artifacts

- Extraction audit: `EXTRACTION_REPAIR_AUDIT_V14.md`
- Pilot summary: `results/phase4_low_budget_v14/pilot_summary_v15.json`
- Controller metrics: `results/phase4_low_budget_v14/pilot_controller_metrics_v15.csv`
- Raw calls/states/QA: `results/phase4_low_budget_v14/full_pilot/`
- Formal freeze: `phase4/formal_freeze_v15.json`
- Readiness gate: `phase4/formal_readiness_v15.json`
- Terminal hashes: `phase4/pilot_final_manifest_v15.json`
