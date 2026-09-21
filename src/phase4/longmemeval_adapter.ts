import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

export const LONGMEMEVAL_RELATIVE_PATH =
  "data/longmemeval/longmemeval_s_cleaned.json";
export const LONGMEMEVAL_SHA256 =
  "d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442";

export type MemoryRole = "user" | "assistant";

export interface WriteTurnView {
  readonly role: MemoryRole;
  readonly content: string;
}

/**
 * This is the complete write-time payload. Do not add identifiers, gold fields,
 * the query, or accumulated/future sessions here.
 */
export interface WriteSessionView {
  readonly timestamp: string;
  readonly turns: readonly WriteTurnView[];
}

/** Only becomes available after every write session has been consumed. */
export interface QueryTimeView {
  readonly question: string;
  readonly question_date: string;
}

interface RawTurn {
  role?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

interface RawExample {
  question_id?: unknown;
  question_type?: unknown;
  question?: unknown;
  question_date?: unknown;
  answer?: unknown;
  answer_session_ids?: unknown;
  haystack_dates?: unknown;
  haystack_session_ids?: unknown;
  haystack_sessions?: unknown;
  [key: string]: unknown;
}

export interface AdapterSourceMetadata {
  readonly source_index: number;
  /** Control-plane identity; never part of a write/query model payload. */
  readonly source_question_id: string;
  /** Control-plane stratum; never part of a write/query model payload. */
  readonly source_question_type: string;
  readonly session_count: number;
  readonly source_was_chronological: boolean;
  readonly future_sessions_omitted: number;
}

export interface ExcludedSourceRecord {
  readonly source_index: number;
  readonly source_question_id: string;
  readonly source_question_type: string;
  readonly reason: "FUTURE_GOLD_EVIDENCE";
  readonly future_session_count: number;
  readonly future_gold_session_count: number;
}

export interface IterateLongMemEvalOptions {
  readonly path?: string;
  /** Control-plane audit hook. Never include this object in a model payload. */
  readonly onExcluded?: (record: ExcludedSourceRecord) => void;
}

interface ProjectedExample {
  metadata: AdapterSourceMetadata;
  writes: readonly WriteSessionView[];
  query: QueryTimeView;
}

class FutureGoldEvidenceError extends Error {
  readonly record: ExcludedSourceRecord;

  constructor(record: ExcludedSourceRecord) {
    super(`record ${record.source_index} has gold evidence after question_date`);
    this.name = "FutureGoldEvidenceError";
    this.record = record;
  }
}

const DATE_PATTERN =
  /^(\d{4})\/(\d{2})\/(\d{2}) \([A-Za-z]{3}\) (\d{2}):(\d{2})$/;

const EXPECTED_TOP_LEVEL_KEYS = new Set([
  "question_id",
  "question_type",
  "question",
  "question_date",
  "answer",
  "answer_session_ids",
  "haystack_dates",
  "haystack_session_ids",
  "haystack_sessions",
]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`LongMemEval adapter rejected input: ${message}`);
}

function timestampKey(value: string, label: string): number {
  const match = DATE_PATTERN.exec(value);
  invariant(match, `${label} has unsupported timestamp ${JSON.stringify(value)}`);
  const [, year, month, day, hour, minute] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  invariant(mo >= 1 && mo <= 12, `${label} has invalid month`);
  invariant(d >= 1 && d <= 31, `${label} has invalid day`);
  invariant(h >= 0 && h <= 23, `${label} has invalid hour`);
  invariant(mi >= 0 && mi <= 59, `${label} has invalid minute`);
  // Dataset timestamps have no timezone offset. This arithmetic key avoids
  // locale-dependent Date parsing while preserving their declared order.
  return ((((y * 13 + mo) * 32 + d) * 24 + h) * 60 + mi);
}

function stringField(value: unknown, label: string): string {
  invariant(typeof value === "string", `${label} must be a string`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  invariant(Array.isArray(value), `${label} must be an array`);
  for (let index = 0; index < value.length; index += 1) {
    invariant(typeof value[index] === "string", `${label}[${index}] must be a string`);
  }
  return value as string[];
}

function freezeWriteView(timestamp: string, rawTurns: unknown, label: string): WriteSessionView {
  invariant(Array.isArray(rawTurns), `${label} must be an array of turns`);
  const turns = rawTurns.map((raw, turnIndex): WriteTurnView => {
    invariant(raw !== null && typeof raw === "object" && !Array.isArray(raw),
      `${label}[${turnIndex}] must be an object`);
    const turn = raw as RawTurn;
    invariant(turn.role === "user" || turn.role === "assistant",
      `${label}[${turnIndex}].role must be user or assistant`);
    invariant(typeof turn.content === "string",
      `${label}[${turnIndex}].content must be a string`);
    // Deliberate whitelist projection strips has_answer and any future source
    // annotation without relying on a blacklist that could miss new fields.
    return Object.freeze({ role: turn.role, content: turn.content });
  });
  return Object.freeze({ timestamp, turns: Object.freeze(turns) });
}

function projectExample(rawValue: unknown, sourceIndex: number): ProjectedExample {
  invariant(rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue),
    `record ${sourceIndex} must be an object`);
  const raw = rawValue as RawExample;
  const rawKeys = Object.keys(raw);
  for (const required of EXPECTED_TOP_LEVEL_KEYS) {
    invariant(Object.prototype.hasOwnProperty.call(raw, required),
      `record ${sourceIndex} is missing ${required}`);
  }
  for (const key of rawKeys) {
    invariant(EXPECTED_TOP_LEVEL_KEYS.has(key),
      `record ${sourceIndex} has unknown top-level field ${key}`);
  }

  const questionId = stringField(raw.question_id, `record ${sourceIndex}.question_id`);
  const questionType = stringField(raw.question_type, `record ${sourceIndex}.question_type`);
  invariant([
    "knowledge-update",
    "multi-session",
    "single-session-assistant",
    "single-session-preference",
    "single-session-user",
    "temporal-reasoning",
  ].includes(questionType), `record ${sourceIndex} has unknown question_type ${questionType}`);
  const question = stringField(raw.question, `record ${sourceIndex}.question`);
  const questionDate = stringField(raw.question_date, `record ${sourceIndex}.question_date`);
  const questionTime = timestampKey(questionDate, `record ${sourceIndex}.question_date`);
  invariant(typeof raw.answer === "string" ||
    (typeof raw.answer === "number" && Number.isFinite(raw.answer)),
  `record ${sourceIndex}.answer must be a string or finite number`);
  const dates = stringArray(raw.haystack_dates, `record ${sourceIndex}.haystack_dates`);
  const sessionIds = stringArray(
    raw.haystack_session_ids,
    `record ${sourceIndex}.haystack_session_ids`,
  );
  const answerSessionIds = stringArray(
    raw.answer_session_ids,
    `record ${sourceIndex}.answer_session_ids`,
  );
  const answerSessionIdSet = new Set(answerSessionIds);
  invariant(Array.isArray(raw.haystack_sessions),
    `record ${sourceIndex}.haystack_sessions must be an array`);
  const sessions = raw.haystack_sessions as unknown[];
  invariant(dates.length === sessionIds.length && dates.length === sessions.length,
    `record ${sourceIndex} has unaligned session/date/id arrays`);

  let futureSessionCount = 0;
  let futureGoldSessionCount = 0;
  const ordered: Array<{
    originalIndex: number;
    timeKey: number;
    view: WriteSessionView;
  }> = [];
  dates.forEach((timestamp, originalIndex) => {
    const timeKey = timestampKey(timestamp, `record ${sourceIndex}.haystack_dates[${originalIndex}]`);
    if (timeKey > questionTime) {
      futureSessionCount += 1;
      if (answerSessionIdSet.has(sessionIds[originalIndex])) futureGoldSessionCount += 1;
      return;
    }
    ordered.push({
      originalIndex,
      timeKey,
      view: freezeWriteView(
        timestamp,
        sessions[originalIndex],
        `record ${sourceIndex}.haystack_sessions[${originalIndex}]`,
      ),
    });
  });
  if (futureGoldSessionCount > 0) {
    throw new FutureGoldEvidenceError(Object.freeze({
      source_index: sourceIndex,
      source_question_id: questionId,
      source_question_type: questionType,
      reason: "FUTURE_GOLD_EVIDENCE" as const,
      future_session_count: futureSessionCount,
      future_gold_session_count: futureGoldSessionCount,
    }));
  }
  const sourceWasChronological = ordered.every(
    (item, index) => index === 0 || ordered[index - 1].timeKey <= item.timeKey,
  );
  ordered.sort((left, right) =>
    left.timeKey - right.timeKey || left.originalIndex - right.originalIndex);

  return {
    metadata: Object.freeze({
      source_index: sourceIndex,
      source_question_id: questionId,
      source_question_type: questionType,
      session_count: ordered.length,
      source_was_chronological: sourceWasChronological,
      future_sessions_omitted: futureSessionCount,
    }),
    writes: Object.freeze(ordered.map((item) => item.view)),
    query: Object.freeze({ question, question_date: questionDate }),
  };
}

/**
 * A protocol gate. The query is inaccessible until the last chronological
 * write-time session has been handed to the caller. Gold fields are never
 * retained in this object.
 */
export class LongMemEvalTrajectory {
  readonly #metadata: AdapterSourceMetadata;
  readonly #writes: readonly WriteSessionView[];
  readonly #query: QueryTimeView;
  #cursor = 0;

  private constructor(projected: ProjectedExample) {
    this.#metadata = projected.metadata;
    this.#writes = projected.writes;
    this.#query = projected.query;
  }

  static fromRaw(raw: unknown, sourceIndex: number): LongMemEvalTrajectory {
    return new LongMemEvalTrajectory(projectExample(raw, sourceIndex));
  }

  get sessionCount(): number {
    return this.#writes.length;
  }

  get ingestedSessionCount(): number {
    return this.#cursor;
  }

  get ingestionComplete(): boolean {
    return this.#cursor === this.#writes.length;
  }

  /** Returns only the current session, never previous or future sessions. */
  nextWriteSession(): WriteSessionView | null {
    if (this.#cursor >= this.#writes.length) return null;
    const current = this.#writes[this.#cursor];
    this.#cursor += 1;
    return current;
  }

  /** Throws if called before chronological ingestion is complete. */
  queryView(): QueryTimeView {
    invariant(this.ingestionComplete,
      `query requested after ${this.#cursor}/${this.#writes.length} sessions`);
    return this.#query;
  }

  /**
   * Orchestration metadata is released only after ingestion. It must not be
   * included in a controller/model payload.
   */
  sourceMetadata(): AdapterSourceMetadata {
    invariant(this.ingestionComplete,
      `metadata requested after ${this.#cursor}/${this.#writes.length} sessions`);
    return this.#metadata;
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function verifyPinnedLongMemEval(
  path = resolve(LONGMEMEVAL_RELATIVE_PATH),
): Promise<{ path: string; sha256: string; bytes: number }> {
  const before = await stat(path);
  invariant(before.isFile(), `${path} is not a regular file`);
  const sha256 = await sha256File(path);
  const after = await stat(path);
  invariant(before.dev === after.dev && before.ino === after.ino &&
    before.size === after.size && before.mtimeMs === after.mtimeMs,
  `${path} changed while it was being hashed`);
  invariant(sha256 === LONGMEMEVAL_SHA256,
    `${path} SHA-256 ${sha256} does not match pinned ${LONGMEMEVAL_SHA256}`);
  return { path, sha256, bytes: after.size };
}

/**
 * Memory-conscious parser for a top-level JSON array. It holds one benchmark
 * record at a time rather than JSON.parse-ing the 265 MB dataset wholesale.
 */
async function* streamTopLevelObjects(path: string): AsyncGenerator<unknown> {
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
        invariant(/\s/.test(character), "non-whitespace appears after top-level array");
        continue;
      }
      if (!started) {
        if (/\s/.test(character)) continue;
        invariant(character === "[", "dataset root must be a JSON array");
        started = true;
        continue;
      }
      if (!capturing) {
        if (/\s/.test(character) || character === ",") continue;
        if (character === "]") {
          finished = true;
          continue;
        }
        invariant(character === "{", "top-level array members must be objects");
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
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(buffer) as unknown;
          } catch (error) {
            throw new Error(`LongMemEval record is invalid JSON: ${String(error)}`);
          }
          yield parsed;
          capturing = false;
          buffer = "";
        }
      }
    }
  }
  invariant(started, "dataset is empty");
  invariant(finished && !capturing && depth === 0 && !inString,
    "dataset ended before the top-level array was complete");
}

export async function* iteratePinnedLongMemEval(
  options: IterateLongMemEvalOptions = {},
): AsyncGenerator<LongMemEvalTrajectory> {
  const path = options.path ?? resolve(LONGMEMEVAL_RELATIVE_PATH);
  // Verify the complete file before yielding any source-derived content.
  const verified = await verifyPinnedLongMemEval(path);
  const stableStat = await stat(path);
  let sourceIndex = 0;
  for await (const raw of streamTopLevelObjects(verified.path)) {
    try {
      yield LongMemEvalTrajectory.fromRaw(raw, sourceIndex);
    } catch (error) {
      if (!(error instanceof FutureGoldEvidenceError)) throw error;
      options.onExcluded?.(error.record);
    }
    sourceIndex += 1;
  }
  const finalStat = await stat(path);
  invariant(stableStat.dev === finalStat.dev && stableStat.ino === finalStat.ino &&
    stableStat.size === finalStat.size && stableStat.mtimeMs === finalStat.mtimeMs,
  `${path} changed while it was being parsed`);
  invariant(sourceIndex === 500, `expected 500 records, found ${sourceIndex}`);
}
