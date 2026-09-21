# Phase 4 prediction-blind state-audit plan

Status: selection frozen before any Phase 4 arm prediction or state snapshot.
This is a **targeted state-error audit**, not an estimate of state-error
prevalence in LongMemEval-S or in production traffic.

## 1. Purpose and estimand

The audit asks whether each arm's final memory state preserves the
question-relevant current fact or event, avoids retaining a contradicted value
as active truth, assigns the correct confirmed/tentative/retracted/historical
status, and retains valid source provenance. It complements QA accuracy; it
does not replace the 500-source-record dataset inventory or the primary paired
QA analysis.

The audit unit is one eligible LongMemEval-S question. Its state outcomes are
paired across arms because every arm is audited on the same selected cases.
The case-level labels are:

- `omission`: a reference-required target fact, event, status, or provenance
  link is absent from the state layer where the frozen representation policy
  requires it;
- `contamination`: a contradicted, retracted, merely tentative, or unsupported
  value is represented as active confirmed truth for the audited target;
- `status_error`: the content is present but assigned the wrong active,
  tentative, historical, or retracted status;
- `provenance_error`: a relied-upon state item has no valid supporting source
  turn or points to an unrelated source;
- `exact_target_state`: none of the four errors above is present.

These are question-relevant target-state labels. They must not be described as
an exhaustive audit of every unrelated memory in a question's store.

## 2. Source universe and leakage-safe eligibility

The only source is the pinned cleaned LongMemEval-S artifact:

- path: `data/longmemeval/longmemeval_s_cleaned.json`;
- source records: 500;
- SHA-256:
  `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.

Selection uses the same leakage-safe adapter eligibility as the formal system
experiment. Forty-four source records are ineligible because at least one
official gold-evidence session occurs after `question_date`; silently ingesting
that evidence would violate the online protocol. The eligible universe is 456
records. Future non-gold sessions are omitted by the adapter.

The source file contains 78 knowledge-update records, but only 77 are
leakage-safe eligible. The audit includes all 77 eligible knowledge-update
records. It deliberately does not reintroduce the one ineligible record merely
to preserve the source-file count of 78. Both counts and the exclusion are
recorded so the denominator change is explicit.

## 3. Fixed selection

The frozen audit size is 120:

| Eligible stratum | Eligible universe | Selected | Rule |
|---|---:|---:|---|
| Knowledge update | 77 | 77 | Census |
| Temporal reasoning | 90 | 15 | Fixed hash rank |
| Multi-session | 133 | 14 | Fixed hash rank |
| Single-session user | 70 | 6 | Fixed hash rank |
| Single-session assistant | 56 | 5 | Fixed hash rank |
| Single-session preference | 30 | 3 | Fixed hash rank |
| **Total** | **456** | **120** |  |

The original plan assigned 42 non-update cases equally across temporal,
multi-session, and combined single-session strata. Once leakage-safe
eligibility reduced the update census from 78 to 77, the replacement case was
preassigned to temporal reasoning, the type affected most by the time-boundary
exclusion. The other quotas remain unchanged. This preserves `n=120` without
using any model result.

Within each source question type, records are ordered by ascending
`SHA-256(seed NUL question_type NUL question_id)`, with `question_id` as an
impossible-in-practice collision tie-break. The fixed seed is
`phase4-state-audit-selection-v1|20260920`. The first records up to the fixed
quota are selected. There is no model score, prediction, QA correctness,
confidence, cost, latency, answer, or official evidence annotation in the
selection rule.

This design intentionally oversamples knowledge updates. Pooled error rates
over the 120 cases must not be reported as benchmark-wide prevalence. The 77
eligible knowledge-update cases form a census of that eligible category;
results for the remaining strata are descriptive targeted-audit results.

## 4. Identifier blinding and files

The selector creates a private random 256-bit salt once. It produces
random-looking audit IDs by domain-separated SHA-256 and then preserves that
salt on reproducible reruns. Public file order is also salt-keyed, so neither
source order nor hash-selection rank is encoded in packet order.

Files:

- `phase4/state_audit_selection.json`: public selection packet; contains only
  anonymous audit IDs and broad selection strata;
- `phase4/state_audit_selection_manifest.json`: public design, counts, hashes,
  and the same anonymous IDs;
- `phase4/state_audit_selection_private.json`: evaluator-side mapping from
  anonymous audit ID to source `question_id`, source index, and exact question
  type. It also contains the private anonymization salt and must not be sent to
  annotators;
- `src/phase4/select_state_audit.ts`: deterministic eligibility, selection,
  serialization, and read-after-write self-check.

The public selection and manifest contain no actual source question ID, gold
answer, official evidence or answer-session ID, arm/model prediction,
correctness, confidence, token, cost, or latency field. File hashes freeze the
selection; later state outputs may be attached to these IDs but cannot change
membership.

## 5. Two-pass human annotation

Formal state claims are blocked until annotation is completed by **two
independent human annotators** and disagreements are adjudicated. GPT, Claude,
Jev, Qwen, or any other LLM cannot substitute for either annotator or the
adjudicator.

### Pass 1: reference state, without arm snapshots

For each anonymous audit ID, each annotator independently receives:

- the frozen memory-representation policy;
- the benchmark question and question date;
- the sanitized chronological source transcript up to the question date,
  without `has_answer`, official answer-session IDs, or evidence markings.

The annotator records the minimal question-relevant reference state: the
current value, any competing obsolete value, whether the information belongs
in active state or the timestamped event log, its confirmed/tentative/
retracted/historical status, and the supporting source turn(s). The released
benchmark answer and official evidence labels are not shown. Reference forms
are locked before either annotator sees an arm state.

### Pass 2: blinded arm-state scoring

Each annotator then receives canonical renderings of the arms' final active
state and event/provenance log for the audited target. Arm names, controller
names, QA answers, QA correctness, confidence, costs, and latency are hidden.
Arm display labels and order are randomized by case and retained only in a
second evaluator-private mapping. Raw snapshots remain archived so canonical
rendering can be checked.

Using the locked reference, each annotator independently assigns the five
case-level labels above to every blinded arm and cites the state record and
source turn supporting each error. Annotators cannot see or discuss the other
annotator's forms until both passes are complete.

### Adjudication

Agreement is reported before adjudication as raw agreement and Cohen's kappa
for each binary label where kappa is defined. Every reference-state or arm-label
disagreement is sent to a third human adjudicator, still blinded to arm
identity and model metrics. The adjudicator sees both rationales and the
sanitized source transcript, records a resolution and reason, and cannot use an
LLM vote as the deciding label. Formal state tables use adjudicated labels and
also retain the two original independent labels.

If two qualified independent humans and human adjudication are unavailable,
the project may report the frozen sampling design and unreviewed state
snapshots only; it must not make formal comparative state-correctness claims.

## 6. Reporting limits

Report omission, contamination, status, provenance, and exact-target-state
counts by arm and selection stratum. Arm contrasts are paired on the same audit
IDs. The knowledge-update census and each sampled stratum must be shown
separately; a pooled 120-case percentage may be supplied only as an explicitly
unweighted audit-set summary.

Do not:

- call the audit-set rate a LongMemEval-S prevalence estimate;
- use the selected subset as a replacement QA benchmark;
- alter membership after seeing state snapshots or predictions;
- drop adjudicated disagreements or ambiguous cases;
- reveal the private source-ID mapping or arm mapping to annotators;
- infer system-wide state stability from QA correctness alone.

## 7. Self-check

Run:

```text
npx tsc --noEmit
npx tsx src/phase4/select_state_audit.ts
```

The selector verifies the pinned dataset hash, obtains the 456 eligible source
indices from the leakage-safe adapter, independently streams the 500-record
source inventory, recomputes all fixed quotas, checks 120 unique anonymous IDs,
checks that every eligible knowledge-update record is included, rejects
forbidden public fields, verifies file hashes after serialization, and makes no
model or external API call.
