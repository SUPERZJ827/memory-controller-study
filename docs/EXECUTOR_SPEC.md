# Deterministic Closed-Loop Executor Specification (Phase 2)

Status: **frozen before any Layer-B controller run**.

## State representation

A state is an ordered set of records:

```json
{
  "id": "M2",
  "semantic_target_id": "job_title",
  "target_name": "job title at Bridgemark Solutions",
  "value": "Senior Data Analyst"
}
```

Only `{id, content: "<target_name>: <value>"}` is sent to a controller.
`semantic_target_id` and all step metadata remain executor/evaluator-only. State
order is not semantically meaningful; equality uses records sorted by `id`.

Every trajectory begins from the same official gold initial state (empty for the
selected trajectories). Each benchmark semantic target has the `Mx` ID assigned
on its first gold ADD. These canonical IDs are frozen in
`data/memops_trajectories.json`. IDs are preserved by UPDATE and removed by
DELETE.

## Prediction validation

A prediction is exactly `{operation, target}`.

- `operation` must be one of ADD, UPDATE, DELETE, NOOP.
- ADD and NOOP require `target="NONE"`.
- UPDATE and DELETE require a target ID that exists in the controller's current
  candidate state.
- A syntactically invalid/missing prediction is normalized to
  `{operation:"NOOP", target:"NONE"}` and marked with a parse/execution error.
- A valid operation paired with an invalid target has no executable referent,
  so state is left unchanged and the step is wrong.

Structured output constraints are controller-specific wrappers around this
same contract; no controller may emit or use generated memory text.

## Transition execution

The executor uses the current MemOps step's frozen structured payload. It never
calls an LLM and never consults `state_checkpoints`, expected answers, rubrics,
future steps, or a gold post-state to repair a controller state.

- **ADD**: append a new record for the step's benchmark semantic target using
  the step `target_name` and `new_value`. If `new_value` is null (possible only
  after a wrong ADD on a non-ADD event), use the literal sentinel
  `__NULL_PAYLOAD__`. If the canonical `Mx` ID is unused, use it; otherwise
  allocate the smallest unused error ID above the trajectory's largest
  canonical M-number. Thus a wrong duplicate ADD remains an observable
  duplicate rather than replacing current state.
- **UPDATE**: replace only the selected record's `target_name` and `value` with
  the current step's structured `target_name` and `new_value`; preserve the
  selected record's ID and original `semantic_target_id`. A null `new_value`
  becomes `__NULL_PAYLOAD__`. Therefore a wrong-target UPDATE corrupts the
  selected memory and does not silently update the gold target.
- **DELETE**: remove only the selected record.
- **NOOP**: leave state unchanged.

The executor applies the predicted operation even when it differs from gold,
subject only to the invalid-target no-op rule above. It does not restore gold
state between steps. The resulting controller-owned state is rendered as the
candidate state for the next prediction.

Gold state is produced independently by the same mechanics using each frozen
gold `(operation, target)` pair. Tentative and retracted events have gold NOOP
and therefore do not change gold state.

## Metrics

- **Step Accuracy**: fraction of Layer-B steps where both operation and target
  equal the frozen gold pair. `NONE` is part of the pair for ADD/NOOP.
- **Intermediate State Accuracy**: exact-state accuracy over every non-final
  post-step checkpoint. Exact equality includes IDs, semantic target IDs,
  target names, values, duplicates, and absences; record order is ignored.
- **Final State Accuracy**: fraction of trajectories whose controller-owned
  state exactly equals the official final executor state after the last step.
- **Error Propagation Rate**: among all steps strictly after the first wrong
  `(operation,target)` prediction in each affected trajectory, the fraction of
  post-step controller states that are still incorrect. Trajectories with no
  step error, and errors on the final step with no downstream opportunity, add
  no denominator. This measures persistence/accumulation, not initial error
  frequency.

For diagnosis, results also retain every pre-state, raw prediction, normalized
prediction, executor action/error, post-state, gold state, and exact-state flag.

## Invariants

1. All controllers start a trajectory from identical state.
2. No controller receives another controller's state.
3. No intermediate gold reset or repair is permitted.
4. The same payload and state-transition code is used for every controller.
5. Controller output is limited to operation and target; memory content always
   comes from the frozen MemOps structured event.
