# Phase 4 code and artifact readiness audit

Audit date: 2026-09-20 (Asia/Singapore)  
Scope: local workspace inspection only; no model/API calls were made. Phase 2 and
Phase 3 frozen data, policies, raw outputs, and reports were not modified.

## Bottom line

The repository is **ready to start building** a controlled A/B/C full-system
experiment, but it is **not ready to run that experiment yet**.

The strongest reusable foundation is the decision layer: frozen Jev, Claude,
GPT-5.6 Sol, and local-Qwen controller wrappers; strict operation/target
validation; per-call token/cost/latency records; a deterministic closed-loop
executor; and resumable JSONL runners with bounded concurrency. The pinned
LongMemEval data and both upstream codebases (Mem0 and LongMemEval) are already
present locally.

What is missing is the system layer needed to make A/B/C a fair experiment:
versioned ingestion, fact extraction, a common content writer for B/C, a
retrieval/storage adapter, answer generation, stage-level cost accounting,
crash-safe state checkpoints, a no-future-information guard, and a predeclared
evaluation/statistical protocol.

The Phase 2 executor must not be mistaken for that system layer. It injects the
benchmark's structured `new_value`, which was appropriate for isolating the
controller but cannot be used to claim natural-language memory writing quality.

## Local assets already available

| Asset | Local path | Frozen/pinned identity | Readiness |
|---|---|---:|---|
| Project TypeScript code | `src/` | Phase-specific source files | Reusable with wrappers |
| Mem0 upstream checkout | `vendor/mem0/` | commit `a39a802bbc93e85b820078cd3c4dbaf53af25dbe` | Source available, not installed in root environment |
| LongMemEval upstream checkout | `vendor/LongMemEval/` | commit `9e0b455f4ef0e2ab8f2e582289761153549043fc` | Evaluation/retrieval reference code available |
| LongMemEval-S cleaned data | `data/longmemeval/longmemeval_s_cleaned.json` | SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442` | 500 questions; local and ready to audit/freeze |
| MemOps upstream checkout | `vendor/MemOps/` | commit `312af65e2c7b6d1b70f062ffa8b4cde32aaf6f35` | Phase 2/3 provenance only |

The cleaned LongMemEval file contains 500 examples: 78 knowledge-update, 133
multi-session, 56 single-session-assistant, 30 single-session-preference, 70
single-session-user, and 133 temporal-reasoning questions. It includes 30
`_abs` abstention examples. Each example has 38--62 sessions (mean 47.734), so
this is already a material systems workload and should not be run before a
small, frozen pilot estimates total cost.

Neither the Python `mem0` package nor the Mem0 TypeScript package is installed
in the root project's active environment. The checkouts are source inputs, not
currently callable dependencies.

## Reusable project modules

### Controllers

| Module | What can be reused | Limitation for Phase 4 |
|---|---|---|
| `src/jev.ts` | Frozen Jev operation and target Decisions calls; probabilities; usage and provider metadata sanitization | Import read-only. It only accepts already-formed candidate memories and one evidence string. |
| `src/phase2_controllers.ts` | Shared `ControllerResult`, Jev/Claude/Qwen adapters, strict operation-target contract, retry policy, token/cost/latency fields | Controller names, prompts, endpoints, and local server URL are hard-coded. Retry usage from failed billed responses is not accumulated. |
| `src/phase3_gpt_controller.ts` | Frozen GPT-5.6 Sol structured-output protocol with reasoning-token logging | Phase-3-specific protocol file and result type; should be wrapped, not edited. |
| `phase3/gpt56sol_protocol.json` | Reproducible GPT decision protocol | Frozen Phase 3 artifact; not a full-system update or answer protocol. |

The controller interface is close to what paths B and C need. A Phase 4 adapter
should normalize all decision controllers to one immutable interface without
editing these frozen files. Path A needs a separate joint decision-plus-content
interface; it must not be forced through the decision-only schema.

### Executor and state handling

| Module | What can be reused | Limitation for Phase 4 |
|---|---|---|
| `src/phase2_executor.ts` | Pure cloning/rendering, deterministic ADD/UPDATE/DELETE/NOOP application, target validation, exact state comparison | `StateEntry` is only `{id, semantic_target_id, target_name, value}`. UPDATE/ADD content comes from gold `StepPayload`; no natural-language writer, provenance, timestamps, status, or retrieval metadata. |
| `src/run_phase2.ts` / `src/run_phase3_gpt.ts` | Controller-owned closed-loop state, no gold reset, pre/post state retention, serial steps within a trajectory | Whole trajectories are buffered before append; a crash loses the current trajectory. Resume is only at completed trajectory/case granularity. |
| `EXECUTOR_SPEC.md` | Clear invariants separating controller decisions from deterministic execution | Frozen Phase 2 semantics are not sufficient for LongMemEval historical/temporal state. |

For Phase 4, the useful pattern is “each arm owns its state and never receives
gold repair,” not the gold-payload executor itself. A new state schema must
represent at least memory text, source event/session, event time, ingest time,
current/historical/tentative/retracted status, and mutation history. Exact fields
must be frozen before model predictions are inspected.

### Cost, token, latency, and raw-output logging

Existing records already preserve:

- input and output tokens for every controller request;
- GPT reasoning tokens when returned by the provider;
- provider-reported controller cost when available;
- local-Qwen API cost as zero, explicitly excluding hardware/electricity;
- per-call latency, retry count, parse error, model/provider/request ID;
- raw controller output and safe provider metadata;
- Jev operation/target probabilities.

`src/analyze_phase2.ts` and `src/analyze_phase3.ts` aggregate median/mean/p90
latency, tokens, controller-only cost, state accuracy, paired bootstrap, and
McNemar statistics. These aggregation utilities are reusable after extracting
them from phase-specific scripts.

The current ledger is insufficient for a complete-system claim. Phase 4 must
log one row per stage and call:

```text
ingest extraction
embedding/indexing
candidate retrieval/reranking
operation controller
content writer or joint updater
answer retrieval
answer generation
evaluation/judge
```

Each row needs `run_id`, arm, example/session/event/query IDs, stage, model and
protocol hash, attempt, cache status, input/output/reasoning tokens,
provider-reported cost, wall latency, error, and request ID. Costs should be
reported both excluding and including the evaluator. Local compute must be
reported as measured hardware time/energy or as “not monetized,” never `$0`
without qualification.

Failed or rate-limited calls may still be billable. The existing retry wrappers
only retain usage from the final successful response, so Phase 4 needs
attempt-level ledger entries instead of a single aggregate result.

### Concurrency

The existing runners implement a bounded async worker pool (normally
concurrency 4). Trajectory steps remain serial, while independent trajectories
run concurrently. This is the correct dependency boundary for closed-loop work.

Safe, zero-extra-call parallel work:

- dataset schema checks, hashes, leakage checks, and manifest generation;
- independent offline evaluators and result aggregation;
- different trajectories within one arm, if the storage namespace is isolated;
- A/B/C execution on different examples after all protocols are frozen;
- embeddings only when batching does not alter the pinned model/output and the
  same batching policy is used for every arm.

Do not parallelize:

- events within one trajectory/session;
- retrieval against a state whose preceding mutation has not committed;
- answer generation before that arm's ingestion completes;
- reviewer/evaluator calls in a way that exposes another arm's answer;
- timed latency comparisons under uncontrolled shared-provider contention.

Parallel API calls do not inherently add tokens, but they can change queueing,
rate-limit retries, and latency. For fair latency, either run each arm in an
isolated fixed-concurrency block or report both per-call latency and experiment
wall-clock throughput. Concurrency and rate-limit policy must be frozen in the
run manifest. Result caching must not be used to make one arm's measured cost
look lower; cached calls retain their original counterfactual API cost in the
ledger.

### Resume and idempotency

`existingIds()` plus append-only JSONL gives useful case/trajectory-level
resume. Preflight/frozen manifests and SHA-256 files also establish a good
provenance pattern.

It is not yet robust enough for a multi-hour full-system run:

- no result record is bound to dataset, policy, prompt, schema, code, and model
  hashes before being skipped;
- concurrent `appendFile()` calls have no explicit single-writer/transaction
  boundary;
- a process can crash after an external billed call but before appending it;
- a trajectory resumes only from the beginning, not its last committed event;
- duplicate IDs are detected only when loading the output at process start;
- no formal run status (`pending/running/committed/failed`) exists;
- the workspace root is not a Git repository, so root source provenance cannot
  be inferred from a commit hash.

Phase 4 should use a small transactional run store (SQLite is sufficient) or a
single-writer journal. Each call and state mutation needs a deterministic key,
and state commit should be atomic with its ledger/checkpoint. A manifest hash
must gate resume; mismatches should fail closed into a new run directory.

## Vendored Mem0 assessment

The pinned Mem0 checkout provides useful storage, embedding, vector search,
history, CRUD, and LLM/provider implementations in both Python and TypeScript.
The TypeScript OSS code is the closer fit to the current project.

However, the currently pinned public TypeScript `Memory.add()` path is an
**additive extraction pipeline**: it retrieves candidates, extracts new memory
texts, embeds/deduplicates them, and persists ADD records. The older
`getUpdateMemoryMessages()` joint ADD/UPDATE/DELETE/NONE prompt still exists in
`src/oss/src/prompts/index.ts`, but it is not called by the active memory path.
The Python implementation at this commit follows the same phased additive
pattern.

Therefore, the A/B/C experiment cannot be obtained by merely configuring the
vendored `Memory` class:

- Path A needs an explicit strong-LLM joint operation/target/content adapter.
- Path B needs the same strong LLM restricted to operation/target, followed by
  a shared writer.
- Path C needs the frozen Jev decision adapter, followed by that identical
  shared writer.

All three should call a thin common store/retriever interface. Reusing Mem0's
vector-store code is reasonable, but modifying the vendored checkout directly
would make the comparison and upstream provenance harder to audit. Prefer a
project-owned adapter under a new `src/phase4/` namespace.

## LongMemEval assessment and leakage risks

The local cleaned dataset and official reference evaluator are available. The
official QA evaluator is LLM-based and its current script supports a fixed
model list and separate prompts by question type. It does not provide the
stage-level token/cost ledger required here, so it needs a project-owned wrapper
or a frozen compatible invocation.

Before the first paid pilot, freeze an adapter audit covering:

- chronological ordering by `haystack_dates` and the precise handling of equal
  timestamps;
- the boundary between ingest sessions and `question_date`;
- removal of `has_answer`, `answer_session_ids`, gold `answer`, question type,
  and any evidence locator from every write-time model input;
- whether the question is ever available before all memory writes finish (it
  must not be);
- treatment of assistant-authored facts and speaker attribution;
- representation of current facts, historical episodes, tentative plans, and
  retractions;
- which question types are in scope and why that scope is compatible with the
  frozen memory policy;
- a pinned QA evaluator protocol and blinded outputs.

The three arms must process the same chronological messages and use the same
retrieval budget, answer model, evaluator, and writer (B/C). They must not share
gold-state candidates. Each arm retrieves from its own database, because missed
writes and contamination are part of the measured system effect.

## Missing Phase 4 components

| Priority | Component | Required behavior |
|---:|---|---|
| P0 | Experiment protocol and manifest | Predeclare primary quality metric, non-inferiority margin, sample size/power, cost scope, latency regime, arms, models, prompts, seeds, retries, concurrency, dataset/code hashes. |
| P0 | LongMemEval adapter audit | Demonstrate chronological ingestion and zero future-question/gold/evidence-locator leakage. |
| P0 | Versioned memory semantics | Freeze current/historical/tentative/retracted representation before seeing arm predictions. |
| P0 | A/B/C interfaces | A joint updater; B strong decision-only; C frozen Jev; identical external inputs and common downstream modules where required. |
| P0 | Common writer for B/C | Generate memory content from current evidence and selected target; same model, prompt, schema, budget, retries, and temperature in both arms. |
| P0 | Transactional run store | Attempt ledger, state snapshots, immutable config hashes, atomic commit, deterministic resume keys. |
| P0 | Stage-level usage ledger | Tokens, reasoning tokens, cost, latency, request/attempt IDs for every system stage. |
| P1 | Fact extraction/ingestion | Same extractor and temporal context for all arms, or explicitly include extraction inside A/B/C cost if it differs by design. |
| P1 | Store/retrieval adapter | Isolated namespace per arm/example; fixed embedding/retrieval/reranking configuration and candidate budget. |
| P1 | Answer generator | Same frozen model/prompt/budget for every arm; consumes only that arm's retrieved memories. |
| P1 | QA/state evaluators | Official-compatible QA scoring plus blinded, evidence-traceable state checks on a predeclared sample. |
| P1 | Append-only reference arm | Timestamped append baseline with deletion-inapplicable cases marked, not hidden by aggregate QA. |
| P1 | Analysis | Paired/clustered bootstrap by question or conversation, predeclared non-inferiority test, quality-cost frontier, complete-system cost and latency. |
| P2 | Error-intervention replay | On a small prespecified subset, fork at first error and compare uncorrected versus one-step-corrected continuation. |

## Recommended build sequence (no full run yet)

1. Write and freeze the Phase 4 protocol, memory semantics, LongMemEval adapter
   audit, non-inferiority margin, and sample-size plan.
2. Build a project-owned `src/phase4/` harness around the vendored Mem0 storage
   primitives; do not alter Phase 2/3 sources or upstream vendor code.
3. Add the transactional call/state ledger and verify deterministic resume with
   fake controllers before any paid call.
4. Implement A/B/C and the append-only reference behind common interfaces.
5. Run local contract tests proving candidate isolation, no gold reset, no
   future leakage, identical B/C writer inputs/config, and per-stage accounting.
6. Freeze a very small pilot slice selected without model outputs. Use it only
   to validate plumbing and estimate full-run cost; do not tune prompts against
   its failures.
7. Freeze the final manifest, then run independent trajectories in parallel at
   a fixed concurrency. Keep latency measurement isolated from uncontrolled
   cross-arm contention.

## Readiness decision

**BUILD_GO, RUN_NOT_YET.**

There is enough reusable code and local data to proceed without another
operator-only phase. There is not yet enough infrastructure to make a valid
claim about complete-system quality or cost. The next engineering milestone is
not an API run; it is a frozen Phase 4 protocol plus a tested system harness and
stage-level ledger.

