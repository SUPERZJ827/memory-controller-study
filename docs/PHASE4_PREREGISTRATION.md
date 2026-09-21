# Phase 4 preregistration: decision–generation separation

Status: statistical core frozen before any Phase-4 model prediction. The exact
prompts, schemas, model IDs, retry limits, concurrency and executable manifest
must be appended and hashed before the formal run; they may not alter the
statistical rules below.

## Research question

Can separating lifecycle-operation decisions from memory-content generation
reduce complete-system cost while preserving question-answering quality and
evidence-traceable memory state in natural-language interaction?

This is a quality–cost experiment. It is not designed to prove that Jev is more
accurate than a frontier LLM.

## Fixed data

The primary dataset is all 500 questions in the cleaned LongMemEval-S artifact:

- Hugging Face revision:
  `98d7416c24c778c2fee6e6f3006e7a073259d48f`
- file SHA-256:
  `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- 38–62 chronological sessions per question; 23,867 total sessions
- all 30 abstention questions remain included

The oracle artifact may be used only for an explicitly labelled upper-bound or
debug diagnostic. It cannot supply the primary result. There is no adaptive
resampling and no result-dependent exclusion.

## Arms

| Arm | Update path | Role |
|---|---|---|
| A | Strong LLM jointly emits operation, target and final memory content | Generative joint-update reference |
| B | The same strong LLM emits operation and target only; a common writer emits content | Effect of separating decision and generation |
| C | Frozen Jev emits operation and target; the exact B writer emits content | Effect of replacing the decision controller |
| D | Timestamped append-only extracted facts/events | Low-cost secondary reference |

A/B/C share the fact extractor, embedding model, retrieval rule and budget,
storage semantics, answer retriever, answer model, and evaluation protocol. B
and C share exactly the same writer. Every arm maintains its own evolving
database and retrieves its own candidates; no gold or common state is injected
after divergence.

The implementation is a transparent **Mem0 paper-architecture harness**, not a
claim of reproducing current Mem0. The paper describes a fact-extraction stage
followed by a top-s retrieval and four-operation LLM update stage. Current Mem0
main is ADD-only. Official tag `v0.1.93` at commit
`cd5c3035ab300e52e26592c8390e8a1c1d9dc745` is retained as a paper-era scaffold;
the paper's `s=10`, rather than that tag's code-level limit of five, is the
planned candidate budget.

## Primary hypothesis and fixed tolerance

The primary contrast is C minus B on paired per-question LongMemEval QA
correctness over all 500 questions.

- Non-inferiority margin: **−3 absolute percentage points**.
- CI: two-sided 95% paired bootstrap, 20,000 resamples, seed `20260920`.
- Resampling unit: question.
- Decision: C is non-inferior only if the CI lower endpoint is greater than
  `−0.03`.

This deliberately permits an inconclusive result. A non-significant McNemar
test or a point estimate near zero is not enough to claim equivalent quality.

To support the quality–cost thesis, C must additionally reduce the
counterfactual standalone complete-system variable cost, excluding evaluation,
by at least **10%** relative to B. Thus a cheap controller alone cannot satisfy
the paper's main success criterion.

## Representation and no-leakage contract

The common representation must preserve two distinct layers:

1. a timestamped event/provenance log for historical episodes, tentative
   statements and retractions; and
2. an active persistent-state store governed by lifecycle operations.

Historical evidence is not destroyed merely because active state changes.
Tentative evidence may be retained as a labelled event without mutating active
state. Retractions remain traceable while any active-state mutation is handled
by the controller. This same rule applies to every arm.

At write time a model may see only the current chronological session's roles,
content and timestamp plus candidates retrieved from that arm's prior state.
The adapter must remove the question, answer, question type, question date,
answer-session IDs, `_abs` marker, turn-level `has_answer`, and all future
sessions. The question and question date become visible only after ingestion is
complete. Evaluator-only evidence IDs may never affect ranking.

## Metrics

Primary reporting:

- overall QA accuracy with paired CI;
- task-macro and per-task accuracy, including abstention;
- evidence-traceable state contamination and omission on a prediction-blinded,
  preselected audit sample;
- complete-system input/output/reasoning/cache tokens and cost;
- p50, mean and p90 stage latency and end-to-end latency.

Cost is logged for extraction, embedding/indexing, ingest retrieval, operation
decision, rewrite/joint update, answer retrieval, answer generation, and judge.
Evaluation cost is reported separately. Two totals are mandatory:

1. actual experiment spend, accounting for physically reused common artifacts;
2. counterfactual standalone cost for each arm, charging every arm its full
   share of common work.

Local inference is reported by model, hardware, calls, token counts when
available, and device time. Unmonetized local compute is not described as free.

## Safe parallel execution

Independent questions may run concurrently under a frozen bounded-concurrency
scheduler. Events within one question and arm remain serial: state commit must
finish before the next retrieval. Common state-independent extractor outputs
and question embeddings may be physically cached without changing standalone
attributed cost. Prompts, seeds, schemas, budgets and retry rules are identical
whether execution is serial or parallel.

For latency, the formal manifest will freeze concurrency and use round-robin
interleaving. Per-call service latency and total experiment throughput are
reported separately; wall-clock results under shared GPU/provider contention
are not presented as isolated-model latency.

## Required guardrails

- No future-question or gold-state information during ingestion.
- No repair from benchmark state after an error.
- No prompt or policy tuning after viewing formal predictions.
- No selective retry for semantically bad answers.
- No conversion of controller-only savings into system-wide savings.
- No interpretation of selected consensus subsets as unbiased benchmarks.
- No claim of production readiness or general Jev superiority.

