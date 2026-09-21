export const PHASE4_STAGES = [
  "extraction",
  "embedding",
  "ingest_retrieval",
  "decision",
  "rewrite_joint_update",
  "answer_retrieval",
  "answer_generation",
  "evaluator",
] as const;

export type Phase4Stage = (typeof PHASE4_STAGES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RunManifest extends Record<string, JsonValue> {
  schema_version: string;
}

export interface CallIdentity {
  manifestHash: string;
  stage: Phase4Stage;
  /**
   * Use an arm id for arm-specific calls. Use a frozen shared scope such as
   * `shared:extraction` only when every consuming arm receives the exact same
   * response bytes.
   */
  scope: string;
  trajectoryId: string;
  stepIndex: number;
  logicalCallId: string;
  request: JsonValue;
}

export interface BeginAttemptInput {
  callKey: string;
  stage: Phase4Stage;
  scope: string;
  trajectoryId: string;
  stepIndex: number;
  logicalCallId: string;
  requestHash: string;
  provider?: string;
  model?: string;
  request?: JsonValue;
  startedAt?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export interface ArmAttribution {
  armId: string;
  /** Cost this arm would incur if run alone under the frozen protocol. */
  standaloneCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  note?: string;
}

export interface CompleteAttemptInput {
  callKey: string;
  attemptNo: number;
  latencyMs: number;
  usage: TokenUsage;
  /** Amount actually charged for this one physical provider/local call. */
  actualPhysicalCostUsd: number;
  response?: JsonValue;
  providerMetadata?: JsonValue;
  attributions: ArmAttribution[];
  completedAt?: string;
}

export interface FailAttemptInput {
  callKey: string;
  attemptNo: number;
  latencyMs: number;
  errorKind: string;
  errorMessage: string;
  /** Include nonzero usage/cost when a failed attempt was still billed. */
  usage?: Partial<TokenUsage>;
  actualPhysicalCostUsd?: number;
  providerMetadata?: JsonValue;
  attributions?: ArmAttribution[];
  completedAt?: string;
}

export interface AttemptHandle {
  callKey: string;
  attemptNo: number;
}

export interface AttemptRecord extends AttemptHandle {
  stage: Phase4Stage;
  scope: string;
  trajectoryId: string;
  stepIndex: number;
  logicalCallId: string;
  requestHash: string;
  provider: string | null;
  model: string | null;
  status: "running" | "success" | "error";
  startedAt: string;
  completedAt: string | null;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  actualPhysicalCostUsd: number;
  response: JsonValue | null;
  errorKind: string | null;
  errorMessage: string | null;
}

export interface StateCommitInput {
  armId: string;
  trajectoryId: string;
  stepIndex: number;
  /** The observed head; null is required for the first snapshot. */
  expectedParentSnapshotId: string | null;
  state: JsonValue;
  causeCallKeys: string[];
  metadata?: JsonValue;
  committedAt?: string;
}

export interface StateSnapshot {
  snapshotId: string;
  armId: string;
  trajectoryId: string;
  stepIndex: number;
  parentSnapshotId: string | null;
  stateHash: string;
  state: JsonValue;
  causeCallKeys: string[];
  metadata: JsonValue | null;
  committedAt: string;
}

export interface CostSummary {
  actualPhysical: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    costUsd: number;
  };
  standaloneByArm: Record<
    string,
    {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cachedInputTokens: number;
      costUsd: number;
    }
  >;
}
