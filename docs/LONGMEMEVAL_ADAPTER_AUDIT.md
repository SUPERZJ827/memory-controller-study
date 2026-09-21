# LongMemEval Phase 4 adapter and leakage audit

## Status

The adapter is implemented without model or API calls. It reads the pinned
`data/longmemeval/longmemeval_s_cleaned.json` and fails closed unless its
SHA-256 is exactly:

```text
d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442
```

The source file is 277,383,467 bytes and contains 500 questions, 23,867
sessions, and 246,750 turns. The adapter uses a streaming top-level-array
parser so that it retains one question record at a time instead of parsing the
265 MiB file into one in-memory object.

## Source schema

Each question has these top-level fields:

```text
question_id, question_type, question, question_date, answer,
answer_session_ids, haystack_dates, haystack_session_ids, haystack_sessions
```

The three haystack arrays are positionally aligned. A session is an array of
turn objects. Every turn has `role` and `content`; 10,960 turns additionally
carry `has_answer`, which is an evaluator annotation and is therefore gold
leakage at write time. There are 30 `_abs` question IDs. Neither IDs nor the
abstention suffix are included in a controller-facing view.

## Controller-visible protocol

For every eligible question, sessions are stably sorted by their timestamp and
released one at a time. The complete write-time shape is:

```json
{
  "timestamp": "2023/05/20 (Sat) 02:21",
  "turns": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

This is a positive allowlist projection, not a blacklist cleanup. Thus
`has_answer` and any future source annotation are not copied. A write view
contains only the current session: it does not contain earlier accumulated
sessions or any later session.

Before the final session is consumed, attempts to obtain either the query or
control-plane metadata throw. After ingestion, the only query-time view is:

```json
{
  "question": "...",
  "question_date": "..."
}
```

The following are never present in a write-time view: `question`, `answer`,
`question_type`, `answer_session_ids`, `question_date`, `question_id`/`qid`,
`_abs`, `has_answer`, session IDs, or haystack containers.

## Chronology and future-evidence finding

The source arrays cannot be consumed in stored order: 211/500 records are not
chronological. The adapter performs a stable timestamp sort.

More importantly, exact minute-level comparison found 76 questions containing
1,475 sessions later than `question_date`. Of these, 44 questions contain 75
gold evidence sessions after the query time. Silently ingesting those sessions
would leak future evidence. Silently deleting only the gold sessions would
instead leave an unanswerable benchmark item.

The fail-closed projection therefore applies these rules before producing any
view:

- If any gold evidence session is after `question_date`, exclude the complete
  question. This excludes 44 questions.
- If only non-gold distractor sessions are after `question_date`, omit those
  future distractors. Across eligible questions this omits 253 sessions.
- Do not modify the pinned source file or its labels.

The resulting leakage-safe projection contains 456 questions, 21,550 sessions,
and 222,878 turns. Its question-type composition is 77 knowledge-update, 133
multi-session, 56 single-session-assistant, 30 single-session-preference, 70
single-session-user, and 90 temporal-reasoning questions. This is an adapter
eligibility decision, not a claim that the resulting subset is an unbiased new
benchmark. The eligible set must be frozen before any controller predictions
are inspected and reported separately from the original 500-question source.

## Fail-closed checks

The adapter rejects:

- a source file whose complete SHA-256 differs from the pinned value;
- a file that changes during hashing or parsing;
- unknown or missing top-level fields;
- misaligned session/date/session-ID arrays;
- malformed timestamps, turns, roles, or content;
- early access to the query;
- future gold evidence at the question level.

The self-check traverses the complete pinned source, validates every emitted
view's exact keys, checks chronological order and the query gate, verifies the
aggregate counts above, and confirms hash mismatch rejection:

```bash
npm run typecheck
npx tsx src/phase4/self_check_longmemeval.ts
```

Machine-readable records are in
`phase4/longmemeval_data_manifest.json` and
`phase4/longmemeval_schema_audit.json`.

## Boundary of this audit

This code does not call a controller, extractor, writer, retriever, answer
model, or evaluator. It does not decide whether LongMemEval's memory semantics
match the Phase 4 persistence policy. It only establishes a pinned,
chronological, controller-safe data boundary. Phase 2 and Phase 3 artifacts are
not read for mutation and are not modified.
