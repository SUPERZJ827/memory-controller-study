import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  LONGMEMEVAL_SHA256,
  iteratePinnedLongMemEval,
  verifyPinnedLongMemEval,
} from "./longmemeval_adapter.js";

const SELECTION_SEED = "phase4-state-audit-selection-v1|20260920";
const AUDIT_ID_DOMAIN = "phase4-state-audit-anonymous-id-v1";
const PUBLIC_PATH = resolve("phase4/state_audit_selection.json");
const PRIVATE_PATH = resolve("phase4/state_audit_selection_private.json");
const MANIFEST_PATH = resolve("phase4/state_audit_selection_manifest.json");
const PLAN_PATH = resolve("PHASE4_STATE_AUDIT_PLAN.md");
const SELECTOR_PATH = resolve("src/phase4/select_state_audit.ts");
const ELIGIBILITY_MANIFEST_PATH = resolve("phase4/longmemeval_data_manifest.json");

const QUOTAS = Object.freeze({
  "knowledge-update": 77,
  "temporal-reasoning": 15,
  "multi-session": 14,
  "single-session-user": 6,
  "single-session-assistant": 5,
  "single-session-preference": 3,
});

type QuestionType = keyof typeof QUOTAS;
type PublicStratum =
  | "knowledge_update_census"
  | "temporal_remainder"
  | "multi_session_remainder"
  | "single_session_remainder";

interface SourceRecord {
  readonly source_index: number;
  readonly question_id: string;
  readonly question_type: QuestionType;
}

interface SelectedRecord extends SourceRecord {
  readonly selection_digest: string;
}

interface PublicEntry {
  readonly audit_id: string;
  readonly selection_stratum: PublicStratum;
}

interface PrivateEntry extends PublicEntry {
  readonly question_id: string;
  readonly question_type: QuestionType;
  readonly source_index: number;
  readonly selection_digest: string;
}

interface ExistingPrivateFile {
  readonly anonymization_salt_hex?: unknown;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashRank(record: SourceRecord): string {
  return sha256(`${SELECTION_SEED}\0${record.question_type}\0${record.question_id}`);
}

function publicStratum(questionType: QuestionType): PublicStratum {
  if (questionType === "knowledge-update") return "knowledge_update_census";
  if (questionType === "temporal-reasoning") return "temporal_remainder";
  if (questionType === "multi-session") return "multi_session_remainder";
  return "single_session_remainder";
}

function asQuestionType(value: string): QuestionType {
  assert.ok(value in QUOTAS, `unsupported question type ${JSON.stringify(value)}`);
  return value as QuestionType;
}

async function* streamSourceRecords(path: string): AsyncGenerator<unknown> {
  let started = false;
  let finished = false;
  let capturing = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buffer = "";
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    for (const character of chunk as string) {
      if (finished) {
        assert.match(character, /\s/, "non-whitespace after top-level array");
        continue;
      }
      if (!started) {
        if (/\s/.test(character)) continue;
        assert.equal(character, "[", "dataset root must be an array");
        started = true;
        continue;
      }
      if (!capturing) {
        if (/\s/.test(character) || character === ",") continue;
        if (character === "]") {
          finished = true;
          continue;
        }
        assert.equal(character, "{", "top-level array member must be an object");
        capturing = true;
        depth = 1;
        buffer = "{";
        continue;
      }
      buffer += character;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          yield JSON.parse(buffer) as unknown;
          capturing = false;
          buffer = "";
        }
      }
    }
  }
  assert.ok(started && finished && !capturing && depth === 0 && !inString,
    "dataset ended before top-level array was complete");
}

async function eligibleSourceIndexes(): Promise<Set<number>> {
  const indexes = new Set<number>();
  let excluded = 0;
  for await (const trajectory of iteratePinnedLongMemEval({
    onExcluded: () => { excluded += 1; },
  })) {
    while (!trajectory.ingestionComplete) trajectory.nextWriteSession();
    indexes.add(trajectory.sourceMetadata().source_index);
  }
  assert.equal(indexes.size, 456);
  assert.equal(excluded, 44);
  return indexes;
}

async function sourceInventory(path: string, eligibleIndexes: ReadonlySet<number>): Promise<SourceRecord[]> {
  const records: SourceRecord[] = [];
  let sourceIndex = 0;
  for await (const rawValue of streamSourceRecords(path)) {
    assert.ok(rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue));
    const raw = rawValue as { question_id?: unknown; question_type?: unknown };
    if (typeof raw.question_id !== "string") throw new Error("question_id must be a string");
    if (typeof raw.question_type !== "string") throw new Error("question_type must be a string");
    if (eligibleIndexes.has(sourceIndex)) {
      records.push({
        source_index: sourceIndex,
        question_id: raw.question_id,
        question_type: asQuestionType(raw.question_type),
      });
    }
    sourceIndex += 1;
  }
  assert.equal(sourceIndex, 500);
  assert.equal(records.length, 456);
  assert.equal(new Set(records.map((record) => record.question_id)).size, 456);
  return records;
}

function select(records: readonly SourceRecord[]): SelectedRecord[] {
  const selected: SelectedRecord[] = [];
  for (const [questionType, quota] of Object.entries(QUOTAS) as [QuestionType, number][]) {
    const stratum = records
      .filter((record) => record.question_type === questionType)
      .map((record) => ({ ...record, selection_digest: hashRank(record) }))
      .sort((left, right) =>
        left.selection_digest.localeCompare(right.selection_digest) ||
        left.question_id.localeCompare(right.question_id));
    assert.ok(stratum.length >= quota, `${questionType} has fewer than ${quota} cases`);
    selected.push(...stratum.slice(0, quota));
  }
  assert.equal(selected.length, 120);
  return selected;
}

async function anonymizationSalt(): Promise<string> {
  try {
    const existing = JSON.parse(await readFile(PRIVATE_PATH, "utf8")) as ExistingPrivateFile;
    const salt = existing.anonymization_salt_hex;
    assert.equal(typeof salt, "string");
    assert.match(salt as string, /^[0-9a-f]{64}$/);
    return salt as string;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    return randomBytes(32).toString("hex");
  }
}

function auditId(salt: string, questionId: string): string {
  const digest = sha256(`${AUDIT_ID_DOMAIN}\0${salt}\0${questionId}`);
  return `SA-${digest.slice(0, 20).toUpperCase()}`;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const result = {} as Record<T, number>;
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function assertNoForbiddenPublicFields(value: unknown): void {
  const forbidden = new Set([
    "question_id",
    "source_index",
    "question",
    "answer",
    "answer_session_ids",
    "evidence",
    "evidence_ids",
    "gold",
    "gold_answer",
    "prediction",
    "predictions",
    "correct",
    "confidence",
    "model",
    "arm",
  ]);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        assert.ok(!forbidden.has(key), `forbidden public field ${key}`);
        visit(child);
      }
    }
  };
  visit(value);
}

async function main(): Promise<void> {
  const dataset = await verifyPinnedLongMemEval();
  assert.equal(dataset.sha256, LONGMEMEVAL_SHA256);
  const eligibleIndexes = await eligibleSourceIndexes();
  const records = await sourceInventory(dataset.path, eligibleIndexes);
  const selected = select(records);
  const salt = await anonymizationSalt();

  const privateEntries: PrivateEntry[] = selected.map((record) => ({
    audit_id: auditId(salt, record.question_id),
    selection_stratum: publicStratum(record.question_type),
    question_id: record.question_id,
    question_type: record.question_type,
    source_index: record.source_index,
    selection_digest: record.selection_digest,
  }));
  assert.equal(new Set(privateEntries.map((entry) => entry.audit_id)).size, 120);

  // A salt-keyed display order prevents source order and selection rank from
  // being encoded in the public packet. The private mapping remains the only
  // file that links anonymous IDs to source question IDs.
  privateEntries.sort((left, right) =>
    sha256(`${salt}\0display\0${left.audit_id}`).localeCompare(
      sha256(`${salt}\0display\0${right.audit_id}`),
    ));

  const publicEntries: PublicEntry[] = privateEntries.map((entry) => ({
    audit_id: entry.audit_id,
    selection_stratum: entry.selection_stratum,
  }));
  const publicFile = {
    schema_version: "phase4-state-audit-public-selection-v1",
    status: "FROZEN_BEFORE_FORMAL_MODEL_PREDICTIONS",
    purpose: "targeted state-error audit; not a prevalence sample",
    n: publicEntries.length,
    audit_cases: publicEntries,
  } as const;
  assertNoForbiddenPublicFields(publicFile);

  const privateFile = {
    schema_version: "phase4-state-audit-private-mapping-v1",
    access: "EVALUATOR_SIDE_ONLY_DO_NOT_DISTRIBUTE_TO_ANNOTATORS",
    selection_seed: SELECTION_SEED,
    selection_hash: "SHA-256(seed NUL question_type NUL question_id), ascending",
    anonymization: "SHA-256 domain-separated IDs using the private salt below",
    anonymization_salt_hex: salt,
    n: privateEntries.length,
    mappings: privateEntries,
  } as const;

  const publicText = jsonBytes(publicFile);
  const privateText = jsonBytes(privateFile);
  await writeFile(PUBLIC_PATH, publicText, { encoding: "utf8", flag: "w" });
  await writeFile(PRIVATE_PATH, privateText, { encoding: "utf8", flag: "w", mode: 0o600 });

  const publicCounts = countBy(publicEntries.map((entry) => entry.selection_stratum));
  const privateCounts = countBy(privateEntries.map((entry) => entry.question_type));
  assert.deepEqual(privateCounts, QUOTAS);
  assert.equal(publicCounts.knowledge_update_census, 77);
  assert.equal(publicCounts.temporal_remainder, 15);
  assert.equal(publicCounts.multi_session_remainder, 14);
  assert.equal(publicCounts.single_session_remainder, 14);

  const planBytes = await readFile(PLAN_PATH);
  const selectorBytes = await readFile(SELECTOR_PATH);
  const eligibilityManifestBytes = await readFile(ELIGIBILITY_MANIFEST_PATH);

  const manifest = {
    schema_version: "phase4-state-audit-selection-manifest-v1",
    status: "FROZEN_BEFORE_FORMAL_MODEL_PREDICTIONS",
    source: {
      artifact: "data/longmemeval/longmemeval_s_cleaned.json",
      sha256: dataset.sha256,
      source_records: 500,
      leakage_safe_eligible_records: records.length,
      excluded_for_future_gold_evidence: 44,
      eligible_record_ids_sha256_source_order_newline_delimited:
        "a481d7557d7336298d2c0a0c52f232370171b192266ddabcf46de44eb7ea32c0",
    },
    design: {
      purpose: "targeted state audit; not an estimate of benchmark-wide prevalence",
      n: publicEntries.length,
      knowledge_update: "census of all 77 leakage-safe eligible cases (1 of the source 78 is ineligible)",
      remaining_43: {
        temporal_reasoning: 15,
        multi_session: 14,
        single_session: 14,
        private_single_session_subquotas: {
          user: 6,
          assistant: 5,
          preference: 3,
        },
      },
      selection_seed: SELECTION_SEED,
      selection_algorithm: "within each fixed source type, ascending SHA-256(seed NUL question_type NUL question_id), tie-broken by question_id",
      adaptive_or_prediction_based_selection: false,
    },
    blinding: {
      public_identifiers: "random-looking audit IDs generated with a private 256-bit salt",
      question_ids: "private evaluator-side mapping only",
      excluded_from_public_selection: [
        "gold answers",
        "gold evidence or evidence IDs",
        "model or arm predictions",
        "correctness",
        "confidence",
        "cost and latency",
      ],
    },
    public_stratum_counts: publicCounts,
    audit_ids: publicEntries.map((entry) => entry.audit_id),
    files: {
      public_selection: {
        path: "phase4/state_audit_selection.json",
        sha256: sha256(publicText),
      },
      private_mapping: {
        path: "phase4/state_audit_selection_private.json",
        sha256: sha256(privateText),
        distribution: "evaluator-side only",
      },
      audit_plan: {
        path: "PHASE4_STATE_AUDIT_PLAN.md",
        sha256: sha256(planBytes),
      },
      selector: {
        path: "src/phase4/select_state_audit.ts",
        sha256: sha256(selectorBytes),
      },
      eligibility_manifest: {
        path: "phase4/longmemeval_data_manifest.json",
        sha256: sha256(eligibilityManifestBytes),
      },
    },
    external_model_or_api_calls: 0,
  } as const;
  assertNoForbiddenPublicFields(manifest);
  const manifestText = jsonBytes(manifest);
  await writeFile(MANIFEST_PATH, manifestText, "utf8");

  // Read-after-write self-check. Recompute the selection from the pinned
  // inventory rather than trusting the just-written files.
  const publicRoundTrip = JSON.parse(await readFile(PUBLIC_PATH, "utf8")) as typeof publicFile;
  const privateRoundTrip = JSON.parse(await readFile(PRIVATE_PATH, "utf8")) as typeof privateFile;
  const manifestRoundTrip = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as typeof manifest;
  assertNoForbiddenPublicFields(publicRoundTrip);
  assertNoForbiddenPublicFields(manifestRoundTrip);
  assert.equal(publicRoundTrip.audit_cases.length, 120);
  assert.equal(privateRoundTrip.mappings.length, 120);
  assert.deepEqual(
    privateRoundTrip.mappings.map((entry) => entry.question_id).sort(),
    selected.map((entry) => entry.question_id).sort(),
  );
  assert.equal(
    privateRoundTrip.mappings.filter((entry) => entry.question_type === "knowledge-update").length,
    records.filter((entry) => entry.question_type === "knowledge-update").length,
  );
  assert.equal(manifestRoundTrip.files.public_selection.sha256, sha256(publicText));
  assert.equal(manifestRoundTrip.files.private_mapping.sha256, sha256(privateText));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    external_model_or_api_calls: 0,
    dataset_sha256: dataset.sha256,
    eligible_universe_n: 456,
    n: 120,
    private_type_counts: privateCounts,
    public_stratum_counts: publicCounts,
    public_selection_sha256: sha256(publicText),
    private_mapping_sha256: sha256(privateText),
    manifest_sha256: sha256(manifestText),
  }, null, 2)}\n`);
}

await main();
