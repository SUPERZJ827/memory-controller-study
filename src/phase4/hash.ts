import { createHash } from "node:crypto";

import type { CallIdentity, JsonValue } from "./types.js";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) throw new Error(`Canonical JSON cannot contain undefined at key ${key}`);
      output[key] = canonicalize(child);
    }
    return output;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value: JsonValue | Record<string, unknown>): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashJson(value: JsonValue | Record<string, unknown>): string {
  return sha256Text(canonicalJson(value));
}

export function makeCallKey(identity: CallIdentity): string {
  const requestHash = hashJson(identity.request);
  return makeCallKeyFromHash({ ...identity, requestHash });
}

export function makeCallKeyFromHash(
  identity: Omit<CallIdentity, "request"> & { requestHash: string },
): string {
  return `p4c_${hashJson({
    manifest_hash: identity.manifestHash,
    stage: identity.stage,
    scope: identity.scope,
    trajectory_id: identity.trajectoryId,
    step_index: identity.stepIndex,
    logical_call_id: identity.logicalCallId,
    request_hash: identity.requestHash,
  }).slice(0, 40)}`;
}

export function makeSnapshotId(input: {
  manifestHash: string;
  armId: string;
  trajectoryId: string;
  stepIndex: number;
  parentSnapshotId: string | null;
  stateHash: string;
  causeCallKeys: string[];
  metadataHash: string | null;
}): string {
  return `p4s_${hashJson({
    manifest_hash: input.manifestHash,
    arm_id: input.armId,
    trajectory_id: input.trajectoryId,
    step_index: input.stepIndex,
    parent_snapshot_id: input.parentSnapshotId,
    state_hash: input.stateHash,
    cause_call_keys: input.causeCallKeys,
    metadata_hash: input.metadataHash,
  }).slice(0, 40)}`;
}
