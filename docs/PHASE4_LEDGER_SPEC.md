# Phase 4 experiment ledger specification

Status: implementation foundation, not a frozen experiment protocol. The self-check uses fake data and makes no model or network calls.

## Purpose

The ledger supports a crash-resumable A/B/C full-system experiment while preventing three common accounting errors: silently resuming under a changed protocol, losing failed/billed attempts, and reporting a shared physical call once per arm as if it had actually been purchased repeatedly.

The implementation is in `src/phase4/`. It uses Node's built-in `node:sqlite`; no package was installed. SQLite is configured with WAL journaling, full synchronous commits, foreign keys, a 30-second lock timeout, and explicit `BEGIN IMMEDIATE` transactions for attempt completion and state commits.

## Frozen manifest and deterministic identities

Every run has a caller-supplied manifest containing all result-affecting settings: dataset and split hashes, arm definitions, model and prompt/schema hashes, retrieval and memory semantics, pricing snapshot, retry rules, concurrency, and code/artifact identities. Canonical JSON is sorted recursively and hashed with SHA-256.

Opening an existing `run_id` with any other manifest hash is a hard error. Resume never relies only on case IDs.

A call key hashes:

- manifest hash;
- stage;
- arm-specific or explicitly shared scope;
- trajectory and step;
- logical call name;
- canonical request hash.

Object key order therefore cannot change a key, while any request content or frozen setting change does. A successful key is immutable and must be reused on resume. A failed attempt may be followed by a new numbered attempt under the same key according to the separately frozen retry policy.

The ledger recomputes the expected call key from the supplied identity and request hash before every attempt. If raw request persistence is disabled, the caller still supplies its canonical hash. A completed run is sealed against new attempts and state commits.

## Stage taxonomy

The database enforces this closed enum:

1. `extraction`
2. `embedding`
3. `ingest_retrieval`
4. `decision`
5. `rewrite_joint_update`
6. `answer_retrieval`
7. `answer_generation`
8. `evaluator`

`rewrite_joint_update` covers either the shared writer in separated arms or the joint update call in the generative arm. The request metadata must distinguish those roles.

## Attempt records

Each physical attempt records status, provider/model, request hash and optional request JSON, start/completion timestamps, latency, input/output/reasoning/cached tokens, actual charged cost, response, provider metadata, and error details. A failed but billed attempt must retain its tokens and cost. Invalid semantic output is an error result, not a license to change the prompt.

Attempt lifecycle is `running -> success|error`. Completion plus all arm attributions is one transaction. Automatic retries are deliberately outside the ledger: the runner must apply its frozen retry policy explicitly, making every attempt visible.

At most one attempt per deterministic call may be `running`. On restart, the runner must inspect `listRunningAttempts()` and reconcile each interrupted attempt as success or failure before retrying; it must not silently create a duplicate. If provider billing/usage is uncertain, that uncertainty belongs in provider metadata and the cost audit rather than being replaced with an assumed zero.

Raw request/response persistence can contain sensitive benchmark content. The experiment protocol must specify access and redaction policy before a formal run.

## Two cost semantics

The two reported totals answer different questions and must never be mixed:

- **Actual physical spend** comes from `call_attempts.actual_physical_cost_usd`. Every provider/local invocation appears exactly once, including billed failures. This is the invoice-like total for the optimized multi-arm run.
- **Standalone-attributed arm cost** comes from `arm_attributions`. A shared extraction call may have one physical charge but an attribution to A, B, and C, because each arm would need that call if deployed alone. This is the correct denominator for quality-cost comparisons between methods.

The same split applies to token counts. Shared calls may reduce the actual experimental bill, but that saving is experimental reuse, not an architectural advantage. A paper should report per-arm standalone totals as the primary method comparison and actual physical spend as an execution audit. Full-system costs must include every stage, not only the decision controller.

## State snapshots and commits

Each arm owns its own trajectory state. A snapshot stores canonical state JSON and its hash. A separate commit record links the before/after snapshots to the trajectory step, successful causal call keys, and timestamp. The commit record, new snapshot, and head update are one atomic transaction.

Commits use optimistic head validation: the supplied parent must equal the current arm/trajectory head, the step must advance, and all causal calls must already be successful. A crash before commit leaves the previous state authoritative. A crash after commit resumes from the new head. No arm may read another arm's state, and no gold state is restored during a trajectory.

External provider calls cannot be atomically enclosed in SQLite. Therefore a crash after provider completion but before recording the response can cause a paid retry. Provider idempotency keys should use the deterministic call key when supported; otherwise the duplicate remains visible as an operational limitation rather than being hidden.

## Parallel scheduler

`runTrajectorySchedule` sorts trajectory IDs and assigns them round-robin to a fixed number of workers. Workers may run independent trajectories concurrently, but every step within a trajectory is awaited before the next begins. This preserves state causality and produces stable lane assignment instead of timing-dependent work stealing.

Freeze concurrency before formal inference. Provider concurrency can change queueing, retry incidence, and latency, so comparative latency runs should use identical settings and should not combine differently loaded arms in one latency claim. Cost-free validation, hashing, leakage checks, and offline analysis may run in parallel freely.

## Required integration pattern

For each model/local call:

1. Construct the final request and deterministic key.
2. Reuse a successful attempt if present.
3. Otherwise insert a `running` attempt before the external call.
4. Record success or failure, full usage, physical cost, and standalone arm attributions atomically.
5. Apply the result to that arm's own state.
6. Commit the new snapshot with the prior head and causal call keys.
7. Only then schedule the next event in that trajectory.

For a shared call, byte-identical request and response semantics are required. If arm state changes the request, it is not shareable even when the provider/model is identical.

## Self-check

Run:

```bash
npx tsx src/phase4/self_check.ts
```

The test uses only a fake controller response. It verifies canonical call keys, one-physical/multiple-attributed cost accounting, atomic state heads, successful-call reuse, manifest-gated resume, fixed concurrency, and serial ordering within each trajectory. It creates and removes an isolated temporary SQLite database and does not read or modify Phase 2/3 artifacts.
