# MemOps Adapter Audit (Phase 2)

Status: **completed before any Phase-2 controller run**.

## Frozen source

- Upstream: `https://github.com/MemTensor/MemOps`
- Local snapshot: `vendor/MemOps`
- Commit: `312af65e2c7b6d1b70f062ffa8b4cde32aaf6f35`
- Input artifact: `generated_result/2-evidence_conversation/*.json`
- Rationale: this is the repository-provided, verifier-accepted stage-2 product. The
  experiment does not call the benchmark-generation LLM and does not use the
  earlier `2-evidence_trace` drafts or the stage-4 long-conversation carrier text.

The accepted artifact has 403 files: 68 Remember, 80 Forget, 77 Update, 96
Reflect, and 82 TrajectoryOps. Reflect files and `type="reflect"` records are
excluded from the four-label task.

## Actual schema and adapter interpretation

| Required concept | MemOps field | Adapter use |
|---|---|---|
| Operation | top-level `operation_type`; per-event `operations[].type` | Per-event `type` is authoritative. `remember`, `update`, and `forget` map to ADD, UPDATE, and DELETE only under the validity/executability rules below. Top-level `TrajectoryOps` is a family, not a label. |
| Target | `operations[].target.target_id`, `target_name` | `target_id` is an internal state key. The oracle state renders every active target as a candidate with an experiment-local `Mx` ID and semantic content `target_name: current value`. Gold target is the active candidate whose internal key equals the event target. |
| Old value | `operations[].old_value` | Used offline to validate that UPDATE/DELETE is executable from the current confirmed state. Never put in the model prompt as an annotation. It can naturally already be visible inside the current candidate memory. |
| New value | `operations[].new_value` | Used offline by the deterministic executor after a prediction. Never exposed as a separate gold field; the model sees only the current trigger quote, which may naturally state it. |
| Evidence | `trigger_span` and `evidence_spans[]`, each with `segment_index`, `turn_index`, and exact `quote` | Layer A/B exposes only the current event's `trigger_span.quote`. Coordinates and provenance lists remain evaluator-only. |
| Confirmed/tentative/retracted | `operations[].validity` | Confirmed events can mutate state. Tentative and retracted Remember/Update/Forget events map to NOOP. The validity string itself is never shown to a controller. |
| Trajectory | top-level `operation_type="TrajectoryOps"`, ordered `operations[]`, optional `chain_id`/`chain_step`, and `state_checkpoints[]` | TrajectoryOps supplies Layer-B sequences. Checkpoint descriptions are audit references only and are never controller input or executor input. |
| Difficulty | top-level `difficulty_knobs` | Preserved as slice metadata. Relevant fields are `recency_trap`, `update_chain`, `multi_target`, `multi_hop`, `negative_seed`, and `adversarial_injection`. They are never shown to a controller. |

Stage 4 retains questions and injected carrier conversations but drops the full
operation trace and difficulty object. Because this experiment requires
transition-level gold actions and a deterministic executor, it uses the accepted
stage-2 trace rather than attempting to reconstruct labels from stage 4.

## Mapping and admissibility rules

Events are ordered by `(trigger_span.segment_index, trigger_span.turn_index,
operation_id)`, not by raw JSON array position. For each file, the adapter
replays only prior confirmed, admissible events to construct the current valid
state.

- confirmed `remember` -> ADD only when `old_value` is null and the target is
  not active;
- confirmed `update` -> UPDATE only when the target is active and its current
  value exactly equals `old_value`;
- confirmed `forget` -> DELETE only when the target is active and its current
  value exactly equals `old_value`;
- tentative or retracted `remember`/`update`/`forget` -> NOOP;
- `reflect` -> excluded;
- any event that fails the structural/executability checks -> excluded and
  logged, with no inferred replacement label.

In the accepted stage-2 product, chronological replay finds 40 confirmed Update
events whose `old_value` does not equal the confirmed state (32 in TrajectoryOps,
8 in Update) and one Forget event whose target is absent. These records are
incompatible with a literal one-step executor and are excluded rather than
silently repaired. A typical mismatch is a confirmed event whose `old_value`
refers to a preceding tentative value even though that value was never valid
state. The official data contains only two retracted records, both duplicate
versions of the same event in C10; after excluding Reflect, the independent
retraction slice therefore has one case. This is reported as a benchmark
coverage limitation.

## Leakage controls

For transition at time `t`, the serialized controller request contains exactly:

1. the oracle/current controller state immediately before `t`, rendered as
   candidate `{id, content}` records;
2. `operations[t].trigger_span.quote` as the current evidence;
3. the candidate IDs already present on those records.

It does **not** contain the source filename, top-level family, operation type,
validity, internal target ID/name for the new event, old/new value fields,
difficulty knobs, chain metadata, provenance coordinates, future dialogue,
future operations, answers, `gold_memory_state`, candidate options, rubrics,
diagnostic checks, state checkpoints, or final state.

The adapter verifies that every trigger quote is a verbatim substring of the
specified user turn. It never uses assistant turns as evidence. Current state is
built only from chronologically earlier confirmed events, so neither a later
turn nor a later event in the same segment can enter the prompt. Gold labels and
offline structured values remain in evaluation-only fields in the frozen case
file; the runner builds a fresh, allow-listed request object rather than
serializing a case wholesale.

Candidate `Mx` IDs are deterministic experiment-local aliases and do not encode
the MemOps target ID, operation, file, or chronology. Candidate ordering is
seeded and fixed. All controllers receive byte-equivalent semantic inputs and
the same candidate order (controller-specific wrapper syntax aside).

## Sampling contract

Layer A is a balanced 300-case sample: 75 ADD, 75 UPDATE, 75 DELETE, and 75
NOOP. Sampling is deterministic and stratified instead of naive random
sampling. It favors enabled difficulty knobs, multiple active candidates,
update-chain steps, tentative events, and the single available non-Reflect
retraction while deduplicating equivalent `(state, evidence, label, target)`
transitions.

Layer B uses 25 deterministic, multi-operation TrajectoryOps files for which
every event passes the same chronological replay and executability checks. No
Layer-B sequence is repaired from `state_checkpoints` or answer annotations.

The frozen case JSON records source/audit metadata for reproducibility, but the
runner's explicit allow-list is the security boundary that prevents those
fields from reaching a controller.
