import assert from "node:assert/strict";
import {
  LONGMEMEVAL_SHA256,
  iteratePinnedLongMemEval,
  verifyPinnedLongMemEval,
  type QueryTimeView,
  type WriteSessionView,
} from "./longmemeval_adapter.js";

const FORBIDDEN_WRITE_KEYS = new Set([
  "question",
  "answer",
  "question_type",
  "answer_session_ids",
  "question_date",
  "question_id",
  "qid",
  "_abs",
  "has_answer",
  "haystack_session_ids",
  "haystack_sessions",
  "haystack_dates",
]);

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys`);
}

function auditWriteView(view: WriteSessionView): void {
  assertExactKeys(view, ["timestamp", "turns"], "write session");
  assert.match(view.timestamp, /^\d{4}\/\d{2}\/\d{2} \([A-Za-z]{3}\) \d{2}:\d{2}$/);
  for (const turn of view.turns) {
    assertExactKeys(turn, ["role", "content"], "write turn");
    assert.ok(turn.role === "user" || turn.role === "assistant");
    assert.equal(typeof turn.content, "string");
  }
  const serialized = JSON.stringify(view);
  const parsed = JSON.parse(serialized) as unknown;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        assert.ok(!FORBIDDEN_WRITE_KEYS.has(key), `forbidden write-time key ${key}`);
        visit(child);
      }
    }
  };
  visit(parsed);
}

function auditQueryView(view: QueryTimeView): void {
  assertExactKeys(view, ["question", "question_date"], "query view");
  assert.equal(typeof view.question, "string");
  assert.equal(typeof view.question_date, "string");
}

async function main(): Promise<void> {
  const verified = await verifyPinnedLongMemEval();
  assert.equal(verified.sha256, LONGMEMEVAL_SHA256);
  await assert.rejects(
    verifyPinnedLongMemEval("package.json"),
    /does not match pinned/,
  );

  let records = 0;
  let sessions = 0;
  let turns = 0;
  let sourceOutOfOrder = 0;
  let futureSessionsOmitted = 0;
  const excluded: Array<{ future_session_count: number; future_gold_session_count: number }> = [];
  const sourceIds = new Set<string>();
  const questionTypes = new Map<string, number>();

  for await (const trajectory of iteratePinnedLongMemEval({
    onExcluded: (record) => excluded.push(record),
  })) {
    assert.throws(() => trajectory.queryView(), /query requested/);
    assert.throws(() => trajectory.sourceMetadata(), /metadata requested/);
    let previousTimestamp = "";
    while (!trajectory.ingestionComplete) {
      const view = trajectory.nextWriteSession();
      assert.ok(view);
      auditWriteView(view);
      // Lexical comparison is valid for this fixed-width YYYY/MM/DD HH:mm form.
      const sortable = view.timestamp.replace(/ \([A-Za-z]{3}\)/, "");
      assert.ok(!previousTimestamp || previousTimestamp <= sortable,
        `non-chronological projected session ${previousTimestamp} > ${sortable}`);
      previousTimestamp = sortable;
      sessions += 1;
      turns += view.turns.length;
    }
    assert.equal(trajectory.nextWriteSession(), null);
    auditQueryView(trajectory.queryView());
    const metadata = trajectory.sourceMetadata();
    assert.equal(metadata.source_index, records + excluded.length);
    assert.equal(metadata.session_count, trajectory.sessionCount);
    assert.ok(!sourceIds.has(metadata.source_question_id), "duplicate source question ID");
    sourceIds.add(metadata.source_question_id);
    questionTypes.set(
      metadata.source_question_type,
      (questionTypes.get(metadata.source_question_type) ?? 0) + 1,
    );
    if (!metadata.source_was_chronological) sourceOutOfOrder += 1;
    futureSessionsOmitted += metadata.future_sessions_omitted;
    records += 1;
  }

  assert.equal(records + excluded.length, 500);
  assert.equal(excluded.length, 44);
  assert.equal(excluded.reduce((sum, item) => sum + item.future_gold_session_count, 0), 75);
  assert.deepEqual(Object.fromEntries([...questionTypes].sort()), {
    "knowledge-update": 77,
    "multi-session": 133,
    "single-session-assistant": 56,
    "single-session-preference": 30,
    "single-session-user": 70,
    "temporal-reasoning": 90,
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    external_calls: 0,
    dataset_sha256: verified.sha256,
    dataset_bytes: verified.bytes,
    records,
    excluded_records: excluded.length,
    sessions,
    turns,
    source_out_of_order_records: sourceOutOfOrder,
    future_sessions_omitted: futureSessionsOmitted,
    query_gate_checked: true,
    write_view_allowlist_checked: true,
    future_session_guard_checked: true,
    hash_mismatch_fail_closed_checked: true,
  }, null, 2)}\n`);
}

await main();
