import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalJson, hashJson, makeCallKeyFromHash, makeSnapshotId } from "./hash.js";
import {
  PHASE4_STAGES,
  type ArmAttribution,
  type AttemptHandle,
  type AttemptRecord,
  type BeginAttemptInput,
  type CompleteAttemptInput,
  type CostSummary,
  type FailAttemptInput,
  type JsonValue,
  type RunManifest,
  type StateCommitInput,
  type StateSnapshot,
} from "./types.js";

const SCHEMA_VERSION = "phase4-ledger-v1";
const STAGE_CHECK = PHASE4_STAGES.map((stage) => `'${stage}'`).join(",");

type SqlRow = Record<string, string | number | bigint | null>;

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`);
}

function validateAttributions(attributions: ArmAttribution[]): void {
  const arms = new Set<string>();
  for (const item of attributions) {
    if (!item.armId) throw new Error("attribution armId must not be empty");
    if (arms.has(item.armId)) throw new Error(`duplicate attribution for arm ${item.armId}`);
    arms.add(item.armId);
    assertNonNegative("standaloneCostUsd", item.standaloneCostUsd);
    assertNonNegative("inputTokens", item.inputTokens);
    assertNonNegative("outputTokens", item.outputTokens);
    assertNonNegative("reasoningTokens", item.reasoningTokens ?? 0);
    assertNonNegative("cachedInputTokens", item.cachedInputTokens ?? 0);
  }
}

export class Phase4Ledger {
  readonly runId: string;
  readonly manifestHash: string;
  private readonly db: DatabaseSync;

  constructor(databasePath: string, runId: string, manifest: RunManifest) {
    if (!runId) throw new Error("runId must not be empty");
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath, { timeout: 30_000 });
    this.runId = runId;
    this.manifestHash = hashJson(manifest);
    try {
      this.initializeSchema();
      this.registerOrValidateRun(manifest);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  private initializeSchema(): void {
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        manifest_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('open','complete','aborted'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS call_attempts (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        call_key TEXT NOT NULL,
        attempt_no INTEGER NOT NULL CHECK(attempt_no >= 1),
        stage TEXT NOT NULL CHECK(stage IN (${STAGE_CHECK})),
        scope TEXT NOT NULL,
        trajectory_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        logical_call_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        request_json TEXT,
        status TEXT NOT NULL CHECK(status IN ('running','success','error')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        latency_ms REAL CHECK(latency_ms >= 0),
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
        reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK(reasoning_tokens >= 0),
        cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(cached_input_tokens >= 0),
        actual_physical_cost_usd REAL NOT NULL DEFAULT 0 CHECK(actual_physical_cost_usd >= 0),
        response_json TEXT,
        provider_metadata_json TEXT,
        error_kind TEXT,
        error_message TEXT,
        PRIMARY KEY(run_id, call_key, attempt_no)
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_success_per_call
        ON call_attempts(run_id, call_key) WHERE status = 'success';
      CREATE UNIQUE INDEX IF NOT EXISTS one_running_per_call
        ON call_attempts(run_id, call_key) WHERE status = 'running';
      CREATE TABLE IF NOT EXISTS arm_attributions (
        run_id TEXT NOT NULL,
        call_key TEXT NOT NULL,
        attempt_no INTEGER NOT NULL,
        arm_id TEXT NOT NULL,
        standalone_cost_usd REAL NOT NULL CHECK(standalone_cost_usd >= 0),
        input_tokens INTEGER NOT NULL CHECK(input_tokens >= 0),
        output_tokens INTEGER NOT NULL CHECK(output_tokens >= 0),
        reasoning_tokens INTEGER NOT NULL CHECK(reasoning_tokens >= 0),
        cached_input_tokens INTEGER NOT NULL CHECK(cached_input_tokens >= 0),
        note TEXT,
        PRIMARY KEY(run_id, call_key, attempt_no, arm_id),
        FOREIGN KEY(run_id, call_key, attempt_no)
          REFERENCES call_attempts(run_id, call_key, attempt_no)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS trajectory_heads (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        arm_id TEXT NOT NULL,
        trajectory_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        PRIMARY KEY(run_id, arm_id, trajectory_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS state_snapshots (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        snapshot_id TEXT NOT NULL,
        arm_id TEXT NOT NULL,
        trajectory_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        parent_snapshot_id TEXT,
        state_hash TEXT NOT NULL,
        state_json TEXT NOT NULL,
        cause_call_keys_json TEXT NOT NULL,
        metadata_json TEXT,
        committed_at TEXT NOT NULL,
        PRIMARY KEY(run_id, snapshot_id),
        UNIQUE(run_id, arm_id, trajectory_id, step_index)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS state_commits (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        commit_id TEXT NOT NULL,
        arm_id TEXT NOT NULL,
        trajectory_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        before_snapshot_id TEXT,
        after_snapshot_id TEXT NOT NULL,
        cause_call_keys_json TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY(run_id, commit_id),
        UNIQUE(run_id, after_snapshot_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS attempts_by_stage
        ON call_attempts(run_id, stage, status);
      CREATE INDEX IF NOT EXISTS snapshots_by_trajectory
        ON state_snapshots(run_id, arm_id, trajectory_id, step_index);
    `);
    const schema = this.db.prepare("SELECT value FROM ledger_meta WHERE key = 'schema_version'").get() as
      | SqlRow
      | undefined;
    if (schema && schema.value !== SCHEMA_VERSION) {
      throw new Error(`Ledger schema mismatch: found ${schema.value}, expected ${SCHEMA_VERSION}`);
    }
    this.db.prepare("INSERT OR IGNORE INTO ledger_meta(key, value) VALUES('schema_version', ?)").run(
      SCHEMA_VERSION,
    );
  }

  private registerOrValidateRun(manifest: RunManifest): void {
    const existing = this.db.prepare("SELECT manifest_hash FROM runs WHERE run_id = ?").get(this.runId) as
      | SqlRow
      | undefined;
    if (existing && existing.manifest_hash !== this.manifestHash) {
      throw new Error(
        `Resume refused for run ${this.runId}: manifest hash ${existing.manifest_hash} != ${this.manifestHash}`,
      );
    }
    if (!existing) {
      this.db
        .prepare(
          "INSERT INTO runs(run_id, manifest_hash, manifest_json, created_at, status) VALUES(?,?,?,?, 'open')",
        )
        .run(this.runId, this.manifestHash, canonicalJson(manifest), nowIso());
    }
  }

  getSuccessfulAttempt(callKey: string): AttemptRecord | null {
    const row = this.db
      .prepare("SELECT * FROM call_attempts WHERE run_id = ? AND call_key = ? AND status = 'success'")
      .get(this.runId, callKey) as SqlRow | undefined;
    return row ? this.mapAttempt(row) : null;
  }

  countDispatchedAttempts(callKey: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM call_attempts
      WHERE run_id = ? AND call_key = ?
        AND NOT (status = 'error' AND error_kind = 'retry_limit_pre_dispatch')
    `).get(this.runId, callKey) as SqlRow;
    return Number(row.count);
  }

  listRunningAttempts(): AttemptRecord[] {
    return (this.db
      .prepare("SELECT * FROM call_attempts WHERE run_id = ? AND status = 'running' ORDER BY started_at, call_key")
      .all(this.runId) as SqlRow[]).map((row) => this.mapAttempt(row));
  }

  beginAttempt(input: BeginAttemptInput): AttemptHandle {
    this.assertRunOpen();
    if (input.request !== undefined && hashJson(input.request) !== input.requestHash) {
      throw new Error(`requestHash does not match request JSON for ${input.callKey}`);
    }
    const expectedCallKey = makeCallKeyFromHash({
      manifestHash: this.manifestHash,
      stage: input.stage,
      scope: input.scope,
      trajectoryId: input.trajectoryId,
      stepIndex: input.stepIndex,
      logicalCallId: input.logicalCallId,
      requestHash: input.requestHash,
    });
    if (input.callKey !== expectedCallKey) {
      throw new Error(`Non-deterministic call key: received ${input.callKey}, expected ${expectedCallKey}`);
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const completed = this.db
        .prepare("SELECT 1 AS ok FROM call_attempts WHERE run_id = ? AND call_key = ? AND status = 'success'")
        .get(this.runId, input.callKey);
      if (completed) {
        throw new Error(`Call ${input.callKey} already has a successful attempt; resume must reuse it`);
      }
      const row = this.db
        .prepare(
          "SELECT COALESCE(MAX(attempt_no), 0) AS max_attempt FROM call_attempts WHERE run_id = ? AND call_key = ?",
        )
        .get(this.runId, input.callKey) as SqlRow;
      const attemptNo = Number(row.max_attempt) + 1;
      this.db
        .prepare(`
          INSERT INTO call_attempts(
            run_id, call_key, attempt_no, stage, scope, trajectory_id, step_index,
            logical_call_id, request_hash, provider, model, request_json, status, started_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'running', ?)
        `)
        .run(
          this.runId,
          input.callKey,
          attemptNo,
          input.stage,
          input.scope,
          input.trajectoryId,
          input.stepIndex,
          input.logicalCallId,
          input.requestHash,
          input.provider ?? null,
          input.model ?? null,
          input.request === undefined ? null : canonicalJson(input.request),
          input.startedAt ?? nowIso(),
        );
      this.db.exec("COMMIT");
      return { callKey: input.callKey, attemptNo };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  completeAttempt(input: CompleteAttemptInput): void {
    assertNonNegative("latencyMs", input.latencyMs);
    assertNonNegative("actualPhysicalCostUsd", input.actualPhysicalCostUsd);
    assertNonNegative("inputTokens", input.usage.inputTokens);
    assertNonNegative("outputTokens", input.usage.outputTokens);
    assertNonNegative("reasoningTokens", input.usage.reasoningTokens ?? 0);
    assertNonNegative("cachedInputTokens", input.usage.cachedInputTokens ?? 0);
    validateAttributions(input.attributions);
    this.finishAttempt({
      ...input,
      status: "success",
      errorKind: null,
      errorMessage: null,
    });
  }

  failAttempt(input: FailAttemptInput): void {
    assertNonNegative("latencyMs", input.latencyMs);
    assertNonNegative("actualPhysicalCostUsd", input.actualPhysicalCostUsd ?? 0);
    assertNonNegative("inputTokens", input.usage?.inputTokens ?? 0);
    assertNonNegative("outputTokens", input.usage?.outputTokens ?? 0);
    assertNonNegative("reasoningTokens", input.usage?.reasoningTokens ?? 0);
    assertNonNegative("cachedInputTokens", input.usage?.cachedInputTokens ?? 0);
    validateAttributions(input.attributions ?? []);
    this.finishAttempt({
      callKey: input.callKey,
      attemptNo: input.attemptNo,
      latencyMs: input.latencyMs,
      usage: {
        inputTokens: input.usage?.inputTokens ?? 0,
        outputTokens: input.usage?.outputTokens ?? 0,
        reasoningTokens: input.usage?.reasoningTokens ?? 0,
        cachedInputTokens: input.usage?.cachedInputTokens ?? 0,
      },
      actualPhysicalCostUsd: input.actualPhysicalCostUsd ?? 0,
      providerMetadata: input.providerMetadata,
      attributions: input.attributions ?? [],
      completedAt: input.completedAt,
      status: "error",
      errorKind: input.errorKind,
      errorMessage: input.errorMessage,
    });
  }

  private finishAttempt(input: {
    callKey: string;
    attemptNo: number;
    latencyMs: number;
    usage: { inputTokens: number; outputTokens: number; reasoningTokens?: number; cachedInputTokens?: number };
    actualPhysicalCostUsd: number;
    response?: JsonValue;
    providerMetadata?: JsonValue;
    attributions: ArmAttribution[];
    completedAt?: string;
    status: "success" | "error";
    errorKind: string | null;
    errorMessage: string | null;
  }): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db
        .prepare(`
          UPDATE call_attempts SET
            status = ?, completed_at = ?, latency_ms = ?, input_tokens = ?, output_tokens = ?,
            reasoning_tokens = ?, cached_input_tokens = ?, actual_physical_cost_usd = ?,
            response_json = ?, provider_metadata_json = ?, error_kind = ?, error_message = ?
          WHERE run_id = ? AND call_key = ? AND attempt_no = ? AND status = 'running'
        `)
        .run(
          input.status,
          input.completedAt ?? nowIso(),
          input.latencyMs,
          input.usage.inputTokens,
          input.usage.outputTokens,
          input.usage.reasoningTokens ?? 0,
          input.usage.cachedInputTokens ?? 0,
          input.actualPhysicalCostUsd,
          input.response === undefined ? null : canonicalJson(input.response),
          input.providerMetadata === undefined ? null : canonicalJson(input.providerMetadata),
          input.errorKind,
          input.errorMessage,
          this.runId,
          input.callKey,
          input.attemptNo,
        );
      if (Number(result.changes) !== 1) {
        throw new Error(`Attempt ${input.callKey}/${input.attemptNo} is missing or no longer running`);
      }
      const insert = this.db.prepare(`
        INSERT INTO arm_attributions(
          run_id, call_key, attempt_no, arm_id, standalone_cost_usd, input_tokens,
          output_tokens, reasoning_tokens, cached_input_tokens, note
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
      `);
      for (const attribution of input.attributions) {
        insert.run(
          this.runId,
          input.callKey,
          input.attemptNo,
          attribution.armId,
          attribution.standaloneCostUsd,
          attribution.inputTokens,
          attribution.outputTokens,
          attribution.reasoningTokens ?? 0,
          attribution.cachedInputTokens ?? 0,
          attribution.note ?? null,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  commitState(input: StateCommitInput): StateSnapshot {
    this.assertRunOpen();
    const stateJson = canonicalJson(input.state);
    const stateHash = hashJson(input.state);
    const metadataHash = input.metadata === undefined ? null : hashJson(input.metadata);
    const snapshotId = makeSnapshotId({
      manifestHash: this.manifestHash,
      armId: input.armId,
      trajectoryId: input.trajectoryId,
      stepIndex: input.stepIndex,
      parentSnapshotId: input.expectedParentSnapshotId,
      stateHash,
      causeCallKeys: input.causeCallKeys,
      metadataHash,
    });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT snapshot_id, step_index FROM trajectory_heads WHERE run_id = ? AND arm_id = ? AND trajectory_id = ?")
        .get(this.runId, input.armId, input.trajectoryId) as SqlRow | undefined;
      const currentHead = current ? String(current.snapshot_id) : null;
      if (currentHead !== input.expectedParentSnapshotId) {
        throw new Error(
          `State head conflict for ${input.armId}/${input.trajectoryId}: expected ${input.expectedParentSnapshotId}, found ${currentHead}`,
        );
      }
      if (current && input.stepIndex <= Number(current.step_index)) {
        throw new Error(`State step ${input.stepIndex} must be greater than current step ${current.step_index}`);
      }
      for (const callKey of input.causeCallKeys) {
        const successful = this.db
          .prepare("SELECT 1 AS ok FROM call_attempts WHERE run_id = ? AND call_key = ? AND status = 'success'")
          .get(this.runId, callKey);
        if (!successful) throw new Error(`Cannot commit state from unsuccessful or missing call ${callKey}`);
      }
      const committedAt = input.committedAt ?? nowIso();
      this.db
        .prepare(`
          INSERT INTO state_snapshots(
            run_id, snapshot_id, arm_id, trajectory_id, step_index, parent_snapshot_id,
            state_hash, state_json, cause_call_keys_json, metadata_json, committed_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        `)
        .run(
          this.runId,
          snapshotId,
          input.armId,
          input.trajectoryId,
          input.stepIndex,
          input.expectedParentSnapshotId,
          stateHash,
          stateJson,
          canonicalJson(input.causeCallKeys),
          input.metadata === undefined ? null : canonicalJson(input.metadata),
          committedAt,
        );
      this.db
        .prepare(`
          INSERT INTO state_commits(
            run_id, commit_id, arm_id, trajectory_id, step_index, before_snapshot_id,
            after_snapshot_id, cause_call_keys_json, committed_at
          ) VALUES(?,?,?,?,?,?,?,?,?)
        `)
        .run(
          this.runId,
          `p4m_${hashJson({ snapshot_id: snapshotId, cause_call_keys: input.causeCallKeys }).slice(0, 40)}`,
          input.armId,
          input.trajectoryId,
          input.stepIndex,
          input.expectedParentSnapshotId,
          snapshotId,
          canonicalJson(input.causeCallKeys),
          committedAt,
        );
      this.db
        .prepare(`
          INSERT INTO trajectory_heads(run_id, arm_id, trajectory_id, snapshot_id, step_index)
          VALUES(?,?,?,?,?)
          ON CONFLICT(run_id, arm_id, trajectory_id) DO UPDATE SET
            snapshot_id = excluded.snapshot_id, step_index = excluded.step_index
        `)
        .run(this.runId, input.armId, input.trajectoryId, snapshotId, input.stepIndex);
      this.db.exec("COMMIT");
      return {
        snapshotId,
        armId: input.armId,
        trajectoryId: input.trajectoryId,
        stepIndex: input.stepIndex,
        parentSnapshotId: input.expectedParentSnapshotId,
        stateHash,
        state: input.state,
        causeCallKeys: input.causeCallKeys,
        metadata: input.metadata ?? null,
        committedAt,
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getStateHead(armId: string, trajectoryId: string): StateSnapshot | null {
    const row = this.db.prepare(`
      SELECT s.* FROM trajectory_heads h
      JOIN state_snapshots s ON s.run_id = h.run_id AND s.snapshot_id = h.snapshot_id
      WHERE h.run_id = ? AND h.arm_id = ? AND h.trajectory_id = ?
    `).get(this.runId, armId, trajectoryId) as SqlRow | undefined;
    if (!row) return null;
    return {
      snapshotId: String(row.snapshot_id),
      armId: String(row.arm_id),
      trajectoryId: String(row.trajectory_id),
      stepIndex: Number(row.step_index),
      parentSnapshotId: row.parent_snapshot_id === null ? null : String(row.parent_snapshot_id),
      stateHash: String(row.state_hash),
      state: parseJson(String(row.state_json))!,
      causeCallKeys: JSON.parse(String(row.cause_call_keys_json)) as string[],
      metadata: parseJson(row.metadata_json === null ? null : String(row.metadata_json)),
      committedAt: String(row.committed_at),
    };
  }

  summarizeCosts(): CostSummary {
    const physical = this.db.prepare(`
      SELECT COUNT(*) calls, COALESCE(SUM(input_tokens),0) input_tokens,
        COALESCE(SUM(output_tokens),0) output_tokens,
        COALESCE(SUM(reasoning_tokens),0) reasoning_tokens,
        COALESCE(SUM(cached_input_tokens),0) cached_input_tokens,
        COALESCE(SUM(actual_physical_cost_usd),0) cost_usd
      FROM call_attempts WHERE run_id = ? AND status IN ('success','error')
    `).get(this.runId) as SqlRow;
    const rows = this.db.prepare(`
      SELECT arm_id, COUNT(*) calls, COALESCE(SUM(input_tokens),0) input_tokens,
        COALESCE(SUM(output_tokens),0) output_tokens,
        COALESCE(SUM(reasoning_tokens),0) reasoning_tokens,
        COALESCE(SUM(cached_input_tokens),0) cached_input_tokens,
        COALESCE(SUM(standalone_cost_usd),0) cost_usd
      FROM arm_attributions WHERE run_id = ? GROUP BY arm_id ORDER BY arm_id
    `).all(this.runId) as SqlRow[];
    const standaloneByArm: CostSummary["standaloneByArm"] = {};
    for (const row of rows) {
      standaloneByArm[String(row.arm_id)] = {
        calls: Number(row.calls),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        reasoningTokens: Number(row.reasoning_tokens),
        cachedInputTokens: Number(row.cached_input_tokens),
        costUsd: Number(row.cost_usd),
      };
    }
    return {
      actualPhysical: {
        calls: Number(physical.calls),
        inputTokens: Number(physical.input_tokens),
        outputTokens: Number(physical.output_tokens),
        reasoningTokens: Number(physical.reasoning_tokens),
        cachedInputTokens: Number(physical.cached_input_tokens),
        costUsd: Number(physical.cost_usd),
      },
      standaloneByArm,
    };
  }

  markRunComplete(): void {
    this.assertRunOpen();
    const running = this.db
      .prepare("SELECT COUNT(*) AS count FROM call_attempts WHERE run_id = ? AND status = 'running'")
      .get(this.runId) as SqlRow;
    if (Number(running.count) !== 0) throw new Error("Cannot complete a run with running attempts");
    this.db.prepare("UPDATE runs SET status = 'complete' WHERE run_id = ?").run(this.runId);
  }

  private assertRunOpen(): void {
    const row = this.db.prepare("SELECT status FROM runs WHERE run_id = ?").get(this.runId) as SqlRow | undefined;
    if (!row || row.status !== "open") {
      throw new Error(`Run ${this.runId} is not open (status=${row?.status ?? "missing"})`);
    }
  }

  private mapAttempt(row: SqlRow): AttemptRecord {
    return {
      callKey: String(row.call_key),
      attemptNo: Number(row.attempt_no),
      stage: String(row.stage) as AttemptRecord["stage"],
      scope: String(row.scope),
      trajectoryId: String(row.trajectory_id),
      stepIndex: Number(row.step_index),
      logicalCallId: String(row.logical_call_id),
      requestHash: String(row.request_hash),
      provider: row.provider === null ? null : String(row.provider),
      model: row.model === null ? null : String(row.model),
      status: String(row.status) as AttemptRecord["status"],
      startedAt: String(row.started_at),
      completedAt: row.completed_at === null ? null : String(row.completed_at),
      latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      reasoningTokens: Number(row.reasoning_tokens),
      cachedInputTokens: Number(row.cached_input_tokens),
      actualPhysicalCostUsd: Number(row.actual_physical_cost_usd),
      response: parseJson(row.response_json === null ? null : String(row.response_json)),
      errorKind: row.error_kind === null ? null : String(row.error_kind),
      errorMessage: row.error_message === null ? null : String(row.error_message),
    };
  }
}
