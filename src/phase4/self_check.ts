import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashJson, makeCallKey } from "./hash.js";
import { Phase4Ledger } from "./ledger.js";
import { runTrajectorySchedule } from "./scheduler.js";
import type { RunManifest } from "./types.js";

const tempRoot = mkdtempSync(join(tmpdir(), "phase4-ledger-self-check-"));
const databasePath = join(tempRoot, "ledger.sqlite");
const manifest: RunManifest = {
  schema_version: "phase4-self-check-v1",
  dataset_sha256: "fake-dataset",
  arms: ["A", "B", "C"],
  concurrency: 2,
};

try {
  const ledger = new Phase4Ledger(databasePath, "fake-run", manifest);
  const request = { messages: [{ role: "user", content: "fake input" }] };
  const callKey = makeCallKey({
    manifestHash: ledger.manifestHash,
    stage: "extraction",
    scope: "shared:extraction",
    trajectoryId: "trajectory-1",
    stepIndex: 0,
    logicalCallId: "extract-facts",
    request,
  });
  assert.equal(
    callKey,
    makeCallKey({
      manifestHash: ledger.manifestHash,
      stage: "extraction",
      scope: "shared:extraction",
      trajectoryId: "trajectory-1",
      stepIndex: 0,
      logicalCallId: "extract-facts",
      request: { messages: [{ content: "fake input", role: "user" }] },
    }),
    "call keys must ignore object key order",
  );
  const attempt = ledger.beginAttempt({
    callKey,
    stage: "extraction",
    scope: "shared:extraction",
    trajectoryId: "trajectory-1",
    stepIndex: 0,
    logicalCallId: "extract-facts",
    requestHash: hashJson(request),
    provider: "fake",
    model: "fake-controller",
    request,
  });
  ledger.completeAttempt({
    ...attempt,
    latencyMs: 12,
    usage: { inputTokens: 100, outputTokens: 20 },
    actualPhysicalCostUsd: 0.01,
    response: { facts: ["fake fact"] },
    providerMetadata: { fake: true },
    attributions: [
      { armId: "A", standaloneCostUsd: 0.01, inputTokens: 100, outputTokens: 20 },
      { armId: "B", standaloneCostUsd: 0.01, inputTokens: 100, outputTokens: 20 },
      { armId: "C", standaloneCostUsd: 0.01, inputTokens: 100, outputTokens: 20 },
    ],
  });
  const initial = ledger.commitState({
    armId: "A",
    trajectoryId: "trajectory-1",
    stepIndex: 0,
    expectedParentSnapshotId: null,
    state: { memories: ["fake fact"] },
    causeCallKeys: [callKey],
  });
  assert.equal(ledger.getStateHead("A", "trajectory-1")?.snapshotId, initial.snapshotId);

  const decisionRequest = { current_state: ["fake fact"], evidence: "fake update" };
  const decisionKey = makeCallKey({
    manifestHash: ledger.manifestHash,
    stage: "decision",
    scope: "arm:A",
    trajectoryId: "trajectory-1",
    stepIndex: 1,
    logicalCallId: "choose-operation",
    request: decisionRequest,
  });
  const failed = ledger.beginAttempt({
    callKey: decisionKey,
    stage: "decision",
    scope: "arm:A",
    trajectoryId: "trajectory-1",
    stepIndex: 1,
    logicalCallId: "choose-operation",
    requestHash: hashJson(decisionRequest),
    request: decisionRequest,
    provider: "fake",
  });
  assert.equal(ledger.listRunningAttempts().length, 1);
  ledger.failAttempt({
    ...failed,
    latencyMs: 5,
    errorKind: "fake_network_error",
    errorMessage: "intentional self-check failure",
    usage: { inputTokens: 10, outputTokens: 0 },
    actualPhysicalCostUsd: 0.002,
    attributions: [
      { armId: "A", standaloneCostUsd: 0.002, inputTokens: 10, outputTokens: 0, note: "billed failure" },
    ],
  });
  const retried = ledger.beginAttempt({
    callKey: decisionKey,
    stage: "decision",
    scope: "arm:A",
    trajectoryId: "trajectory-1",
    stepIndex: 1,
    logicalCallId: "choose-operation",
    requestHash: hashJson(decisionRequest),
    request: decisionRequest,
    provider: "fake",
  });
  assert.equal(retried.attemptNo, 2);
  ledger.completeAttempt({
    ...retried,
    latencyMs: 6,
    usage: { inputTokens: 10, outputTokens: 2 },
    actualPhysicalCostUsd: 0.003,
    response: { operation: "NOOP", target: "NONE" },
    attributions: [
      { armId: "A", standaloneCostUsd: 0.003, inputTokens: 10, outputTokens: 2 },
    ],
  });
  assert.equal(ledger.listRunningAttempts().length, 0);
  const costs = ledger.summarizeCosts();
  assert.ok(
    Math.abs(costs.actualPhysical.costUsd - 0.015) < 1e-12,
    "physical spend must count the shared call, billed failure, and retry exactly once",
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(costs.standaloneByArm).map(([arm, summary]) => [arm, summary.costUsd])),
    { A: 0.015, B: 0.01, C: 0.01 },
    "standalone attribution must retain the per-arm counterfactual cost",
  );
  ledger.close();

  const resumed = new Phase4Ledger(databasePath, "fake-run", manifest);
  assert.equal(resumed.getSuccessfulAttempt(callKey)?.response && true, true);
  assert.throws(() => resumed.beginAttempt({
    callKey,
    stage: "extraction",
    scope: "shared:extraction",
    trajectoryId: "trajectory-1",
    stepIndex: 0,
    logicalCallId: "extract-facts",
    requestHash: hashJson(request),
  }), /already has a successful attempt/);
  resumed.markRunComplete();
  resumed.close();
  assert.throws(
    () => new Phase4Ledger(databasePath, "fake-run", { ...manifest, concurrency: 3 }),
    /Resume refused/,
    "resume must be gated by the complete manifest hash",
  );

  let active = 0;
  let maxActive = 0;
  const observed = new Map<string, number[]>();
  const scheduled = await runTrajectorySchedule(
    [
      { trajectoryId: "t3", steps: [0, 1, 2] },
      { trajectoryId: "t1", steps: [0, 1, 2] },
      { trajectoryId: "t2", steps: [0, 1, 2] },
    ],
    { concurrency: 2 },
    async (job, step) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, step === 0 ? 3 : 1));
      const steps = observed.get(job.trajectoryId) ?? [];
      steps.push(step);
      observed.set(job.trajectoryId, steps);
      active -= 1;
    },
  );
  assert.equal(maxActive, 2);
  assert.deepEqual(scheduled.completedTrajectories, ["t1", "t2", "t3"]);
  for (const steps of observed.values()) assert.deepEqual(steps, [0, 1, 2]);
  process.stdout.write("Phase 4 ledger self-check passed (fake controllers only; no external calls).\n");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
