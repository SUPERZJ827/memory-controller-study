# Phase 4 Official-Source Audit

Status: source audit only. No controller, reader, judge, or paid API calls were made during this audit.

## 1. Frozen upstream sources

| Artifact | Frozen identifier | Notes |
|---|---|---|
| Mem0 repository | `a39a802bbc93e85b820078cd3c4dbaf53af25dbe` | Current upstream `main` inspected for implementation drift |
| Mem0 paper-era reference | tag `v0.1.93`, commit `cd5c3035ab300e52e26592c8390e8a1c1d9dc745` | Released 2025-04-21, shortly before the paper; useful as a code scaffold, but not an exact match to every paper setting |
| LongMemEval repository | `9e0b455f4ef0e2ab8f2e582289761153549043fc` | Official benchmark and evaluator repository |
| Cleaned dataset repository | `98d7416c24c778c2fee6e6f3006e7a073259d48f` | Official Hugging Face revision |
| `longmemeval_s_cleaned.json` | SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442` | 277,383,467 bytes; recommended primary Phase 4 artifact |
| `longmemeval_oracle.json` | SHA-256 `821a2034d219ab45846873dd14c14f12cfe7776e73527a483f9dac095d38620c` | 15,388,478 bytes; diagnostic/oracle upper bound only |
| `longmemeval_m_cleaned.json` | SHA-256 `9d79e5524794a2e6900a3aa9cb7d9152c5a3e8319c9a87c25494ba1eacee495f` | 2,737,100,077 bytes; defer until after the S experiment |

Primary sources:

- [Mem0 paper, arXiv v1](https://arxiv.org/html/2504.19413v1)
- [Mem0 source at the frozen current commit](https://github.com/mem0ai/mem0/tree/a39a802bbc93e85b820078cd3c4dbaf53af25dbe)
- [Mem0 paper-era source at v0.1.93](https://github.com/mem0ai/mem0/tree/cd5c3035ab300e52e26592c8390e8a1c1d9dc745)
- [LongMemEval official repository](https://github.com/xiaowu0162/LongMemEval/tree/9e0b455f4ef0e2ab8f2e582289761153549043fc)
- [Official cleaned LongMemEval dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/tree/98d7416c24c778c2fee6e6f3006e7a073259d48f)

## 2. Mem0 architecture relevant to A/B/C

The Mem0 paper describes two write stages:

1. An LLM extracts candidate facts from the new exchange, using conversation summary and recent messages as context.
2. For each candidate, semantically similar stored memories are retrieved and a second LLM tool call selects `ADD`, `UPDATE`, `DELETE`, or `NOOP`.

The paper reports `m=10` recent messages and `s=10` similar memories, with GPT-4o-mini used for LLM operations. The description and algorithm are in [Section 2.1 and Appendix B](https://arxiv.org/html/2504.19413v1#S2.SS1).

This must be distinguished from the current repository. At frozen current commit `a39a802...`, the active path imports `ADDITIVE_EXTRACTION_PROMPT`, retrieves existing memories, and uses a single additive extraction call. The relevant code is [current `main.py`](https://github.com/mem0ai/mem0/blob/a39a802bbc93e85b820078cd3c4dbaf53af25dbe/mem0/memory/main.py), and the current official documentation explicitly describes automatic extraction as additive in [How Mem0 Works](https://github.com/mem0ai/mem0/blob/a39a802bbc93e85b820078cd3c4dbaf53af25dbe/docs/core-concepts/how-it-works.mdx).

The paper-era `v0.1.93` code contains a separate fact-extraction call followed by the four-operation update call. However, that code retrieves five candidates, whereas the paper reports `s=10`. It is therefore a useful scaffold, not evidence of an exact paper-code match.

### Recommended controlled comparison

Freeze a transparent **paper-architecture harness** rather than claiming an exact reproduction of current Mem0:

| Path | Update stage | Scientific comparison |
|---|---|---|
| A: generative joint update | Strong LLM emits operation, target, and resulting memory text jointly | Reference joint design |
| B: strong separated update | The same strong LLM emits only operation and target; a common rewriter produces text | A vs B isolates decision/generation separation |
| C: Jev separated update | Jev emits only operation and target; the same rewriter as B produces text | B vs C isolates controller replacement |

Freeze across all paths:

- candidate fact extractor and its prompt;
- embedding model and candidate-retrieval budget;
- vector store and search configuration;
- deterministic mutation executor;
- text rewriter for B and C;
- read-time retriever, retrieval budget, answer model, and answer prompt.

Each path must maintain its own evolving memory database. Once stores diverge, candidate memories must be retrieved from that path's own store. Supplying candidates from a common or gold store would remove the closed-loop consequence being measured.

## 3. LongMemEval artifact and task structure

LongMemEval defines online evaluation: timestamped sessions are provided sequentially, followed by a later question. It tests information extraction, multi-session reasoning, knowledge updates, temporal reasoning, and abstention. See the [official paper, Sections 3.1–3.3](https://arxiv.org/html/2410.10813#S3) and the [official README](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md).

The recommended artifact is the full cleaned S file, not the oracle file. The official dataset card states that the cleaned release replaces the original data and removes noisy history sessions that interfere with answer correctness. The oracle file contains only evidence sessions and is therefore unsuitable as the primary retrieval-and-memory result.

Direct inspection of the pinned S JSON produced the following frozen inventory:

| Question type | Count |
|---|---:|
| `multi-session` | 133 |
| `temporal-reasoning` | 133 |
| `knowledge-update` | 78 |
| `single-session-user` | 70 |
| `single-session-assistant` | 56 |
| `single-session-preference` | 30 |
| Total | 500 |

Thirty question IDs end in `_abs`; abstention is an overlay on existing question types rather than a separate `question_type` value. All 500 histories are distinct. They contain 38–62 sessions per question (median 48, mean 47.734) and 396–616 turns (median 491, mean 493.5).

## 4. Leakage firewall

The released JSON deliberately includes evaluation-only annotations. A generic ingestion of the complete instance would leak labels.

During memory construction, expose only the current session's:

- timestamp;
- ordered user/assistant turns;
- role and natural-language content.

Do not expose during writes:

- `question`;
- `answer`;
- `question_date`;
- `question_type`;
- `answer_session_ids`;
- the `_abs` suffix or any derived abstention flag;
- turn-level `has_answer`;
- future sessions.

At read time, the question and question date may be provided equally to every path. The answer, evidence-session IDs, and evidence-turn labels remain evaluator-only. Session or turn provenance may be retained internally for post-hoc Recall@k/NDCG, but gold provenance must not affect extraction, storage, retrieval, ranking, or answer generation.

The relevant released fields are documented in the [official dataset-format section](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md#-dataset-format).

## 5. Construct compatibility requirements

Before model predictions are observed, freeze a memory-representation policy covering:

- current confirmed facts;
- historical completed episodes;
- tentative plans;
- explicit retractions or cancellations;
- temporally scoped facts and timestamps;
- assistant-provided information that the user may later ask about.

This is required because LongMemEval explicitly evaluates assistant-side information, knowledge updates, and temporal reasoning. A persistence policy that discards historical episodes by definition is not compatible with the full benchmark.

QA correctness is not sufficient for state correctness. The official knowledge-update judge accepts a response containing previous information if the required updated answer is also present. Consequently, stale-memory contamination can be hidden by the QA score. Phase 4 should retain a blinded, evidence-traceable state audit in addition to final QA evaluation.

## 6. Official evaluator

The official evaluator uses `gpt-4o-2024-08-06`, temperature 0, and a maximum of 10 output tokens. It uses different prompts for factual, temporal, knowledge-update, preference, and abstention questions. The paper reports more than 97% agreement with human experts.

Sources:

- [Official `evaluate_qa.py`](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py)
- [Official `print_qa_metrics.py`](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/print_qa_metrics.py)
- [LongMemEval paper evaluation discussion](https://arxiv.org/html/2410.10813#S3.SS3)

The metrics script checks the exact evaluator snapshot and reports per-task, task-averaged, overall, and abstention accuracy. If the named snapshot is unavailable, any replacement must be disclosed as a protocol deviation and validated on a frozen, independently double-coded human sample. It must not be silently substituted.

## 7. Practical environment and licensing

The official repository recommends Python 3.9 with `requirements-lite.txt` for evaluation only. Its full baseline environment uses PyTorch 2.3.1 and CUDA 12.1 with `requirements-full.txt`; a custom Phase 4 harness need not inherit those heavier dependencies unless it runs the supplied baselines. See the [official setup instructions](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md#-setup).

Licenses:

- Mem0 source: Apache-2.0, per its [official license](https://github.com/mem0ai/mem0/blob/a39a802bbc93e85b820078cd3c4dbaf53af25dbe/LICENSE).
- LongMemEval repository: MIT, per its [official license](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/LICENSE).
- The official cleaned dataset card also declares MIT.

## 8. Parallelism and accounting

The following can be parallelized without changing prompts, model budgets, or billed token counts:

- independent benchmark instances;
- A, B, and C for the same instance, because they own separate stores;
- post-hoc evaluation calls;
- local parsing, hashing, token counting, and metric aggregation.

The following common artifacts may be physically cached when they are frozen and method-independent:

- parsed sessions and timestamps;
- tokenizer outputs;
- state-independent fact-extraction outputs;
- query embeddings whose input and model are identical.

Caching must not erase standalone deployment costs. Report both:

1. **Actual experiment spend**, counting a physically shared call once.
2. **Attributed standalone system cost**, assigning every method the common extraction, embedding, retrieval, rewrite, answer, and evaluation work it would require when deployed alone.

For each method and module, retain input tokens, output tokens, reasoning tokens where reported, price basis, cost, request count, retry count, and latency. Report end-to-end and module-level totals. Parallel execution can distort wall latency through shared CPU/GPU or connection contention, so latency comparisons require either an isolated timing pass or identical fixed concurrency and resources for each method.

## 9. Recommended frozen Phase 4 protocol

1. Use all 500 questions in the pinned cleaned S artifact for the paper result.
2. Treat any smaller subset as development-only and freeze it before observing method comparisons.
3. Process sessions chronologically and online; never provide future sessions or evaluation annotations.
4. Run A/B/C and optionally a timestamped append-only reference.
5. Use a paper-architecture harness with `s=10`, while documenting the paper/current-code/version distinction.
6. Give each method its own closed-loop database; never restore gold state.
7. Freeze common extractor, rewriter, retriever, reader, prompts, schemas, budgets, retry policy, and executor before the formal run.
8. Predeclare a practically meaningful quality non-inferiority margin and sample-size rationale before results.
9. Report overall and per-task QA, blinded state errors, provenance-based retrieval metrics where available, paired uncertainty, complete token/cost accounting, and p50/mean/p90 latency.
10. Use the oracle artifact only as a separately labeled diagnostic upper bound.

