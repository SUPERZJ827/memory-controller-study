# RESULT PHASE 2

MemOps source commit: `312af65e2c7b6d1b70f062ffa8b4cde32aaf6f35`  
Layer-A cases: 300 (75 each ADD/UPDATE/DELETE/NOOP)  
Layer-B trajectories: 25, 133 total steps  
Frozen transition SHA-256: `6156f02056c9dcf5d890cbcdc5c3db7a33698b4a5ba2fa0283da668b5d475447`  
Frozen trajectory SHA-256: `92b27bdacba25fc7631b77ddc9b913ef2ef8b640fd2c702a445ba3996a439ca0`  
Frozen Jev operation-policy SHA-256: `e824dfdeffe485ddde0fa6fbe5500c73874335c9ec57f473f74e463b4bdc2393`

## Main table

Target Accuracy below is over all 300 cases, including the required `NONE` for
ADD/NOOP. Target-required-only accuracy was 92.0% for Jev, 94.0% for Claude,
and 95.3% for Qwen. Latency and cost aggregate the 433 controller decisions
(300 independent transitions plus 133 closed-loop steps); Jev latency is the
full operation-plus-conditional-target path. Cost is controller-only.

| Controller | Operation Macro-F1 | Target Accuracy | Joint Accuracy | Final-State Accuracy | Median Latency | Cost |
|---|---:|---:|---:|---:|---:|---:|
| Jev `typesafe/jev-1.13` | **85.45%** | **91.00%** | **85.33%** (256/300) | **88.00%** (22/25) | 539 ms | $0.0169 |
| Strong LLM `anthropic/claude-sonnet-4.6` | 70.09% | 88.33% | 72.00% (216/300) | 24.00% (6/25) | 1,392 ms | $0.9097 |
| Local `Qwen3-8B` | 44.68% | 72.00% | 51.00% (153/300) | 0.00% (0/25) | **258 ms** | $0 API marginal cost* |

Closed-loop diagnostics:

| Controller | Step Accuracy | Intermediate-State Accuracy | Error Propagation Rate |
|---|---:|---:|---:|
| Jev | **89.47%** (119/133) | **96.30%** (104/108) | **40.00%** (2/5) |
| Claude Sonnet 4.6 | 72.93% (97/133) | 42.59% (46/108) | 98.41% (62/63) |
| Qwen3-8B | 52.63% (70/133) | 25.00% (27/108) | 100.00% (81/81) |

`Error Propagation Rate` uses only downstream steps strictly after a
trajectory's first wrong prediction, as frozen in `EXECUTOR_SPEC.md`. Jev's
denominator is small because most Jev errors occurred at final tentative steps.

Efficiency details:

| Controller | Mean / p90 latency | Input / output tokens | Total controller cost |
|---|---:|---:|---:|
| Jev | 606 / 856 ms | 401,962 / 29,283 | $0.016882 |
| Claude Sonnet 4.6 | 1,475 / 1,720 ms | 273,488 / 5,951 | $0.909729 |
| Qwen3-8B | 275 / 311 ms | 158,758 / 4,879 | $0* |

*Local cost means no metered API charge; it excludes GPU depreciation,
electricity, and shared-server opportunity cost. These numbers do not imply
whole-memory-system savings.

Paired Layer-A comparison gives a Jev-minus-strong joint-accuracy delta of
**+13.33 percentage points**, with a paired 20,000-resample bootstrap 95% CI of
**[+8.67, +18.00] points**. Paired outcomes were: both correct 208, Jev-only
correct 48, strong-only correct 8, both wrong 36. Exact two-sided McNemar
`p = 4.7e-8`.

## Difficulty slices

Values are joint accuracy; `n` is shared by all controllers.

| Slice | n | Jev | Claude Sonnet 4.6 | Qwen3-8B |
|---|---:|---:|---:|---:|
| tentative | 74 | **77.03%** | 71.62% | 10.81% |
| retraction | 1 | 0.00% | **100.00%** | **100.00%** |
| recency trap | 69 | **75.36%** | 69.57% | 4.35% |
| multi-target | 300 | **85.33%** | 72.00% | 51.00% |
| candidate disambiguation | 119 | 94.12% | 95.80% | **96.64%** |
| update chain | 144 | **79.86%** | 79.17% | 48.61% |

All selected cases satisfy the benchmark's enabled multi-target knob and have
at least two active candidates, so the multi-target slice equals the full test
rather than providing an internal easy-vs-hard contrast. The official accepted
non-Reflect data provides only one independent retraction transition; that row
cannot support a comparative conclusion.

Operator slices explain most of the aggregate difference:

| Gold operation | n | Jev | Claude Sonnet 4.6 | Qwen3-8B |
|---|---:|---:|---:|---:|
| ADD | 75 | **81.33%** | 28.00% | 4.00% |
| UPDATE | 75 | 84.00% | 88.00% | **89.33%** |
| DELETE | 75 | **100.00%** | **100.00%** | 98.67% |
| NOOP | 75 | **76.00%** | 72.00% | 12.00% |

## Jev confidence

Confidence is `P(predicted operation)` multiplied by `P(predicted target)` for
UPDATE/DELETE; ADD/NOOP use an implicit target factor of 1. Results refer to
the 300 independent Layer-A cases.

| Group | n | Mean | Median | p10–p90 |
|---|---:|---:|---:|---:|
| Correct joint predictions | 256 | 0.907 | 0.950 | 0.715–0.990 |
| Wrong joint predictions | 44 | 0.717 | 0.695 | 0.483–0.964 |

| Confidence bucket | Accuracy |
|---|---:|
| `>= 0.9` | 94.90% (186/196) |
| `>= 0.8` | 93.25% (221/237) |
| `< 0.8` | 55.56% (35/63) |

There are enough errors to report exploratory calibration metrics: 10-bin
equal-width ECE on joint confidence is **0.0279**, and multiclass operation
Brier score is **0.2132**. The low aggregate ECE should not obscure the ten
wrong predictions at confidence at least 0.9, including one confidence-1.0
error. Confidence is useful for abstention below 0.8, but high confidence is not
a correctness guarantee.

## Failure analysis

1. **The dominant boundary is mutation versus non-mutation, not target
   selection.** In Layer A, every controller selected the correct target on
   every case where it first selected the correct operation. Jev's 44 errors
   were therefore operation errors: 13 NOOP→UPDATE, 12 ADD→NOOP, 11
   UPDATE→NOOP, 5 NOOP→ADD, 2 ADD→UPDATE, and 1 UPDATE→ADD.

2. **MemOps Remember and the frozen persistence policy are not perfectly
   aligned.** Some official confirmed Remember events concern one-time
   verification codes, completed historical episodes, or statements worded as
   “considering” an additional contact. MemOps maps them to ADD by instruction,
   while the frozen Jev policy treats temporary/tentative/non-persistent facts
   as NOOP. This accounts for several Jev ADD→NOOP errors and many more for the
   generative baselines. It is a real construct-validity tension; no labels or
   policy were changed after observing it.

3. **Tentative future statements still cause over-mutation.** Jev made 18
   NOOP over-mutation errors (13 UPDATE, 5 ADD) and scored 75.36% on recency
   traps. Two of Jev's three wrong final states began with a final tentative
   statement incorrectly applied as UPDATE. The sole retraction was also
   missed by Jev, but `n=1` prevents a general claim.

4. **Round-trip/confirmation wording causes under-mutation.** Eleven confirmed
   updates were predicted NOOP by Jev, often when the user returned to a prior
   value (for example, keeping a due date after all) or invalidated an
   intervening measurement. One such UPDATE→NOOP was the first error in Jev's
   third wrong-final-state trajectory.

5. **Closed-loop error accumulation sharply separates controllers.** Jev
   retained exact final state on 22/25 trajectories. Claude frequently
   classified secondary confirmed facts as NOOP instead of ADD; these early
   omissions persisted, producing 19 wrong final states and 98.41% downstream
   propagation. Qwen had the same ADD omission plus severe tentative-value
   over-updating, leaving every final state wrong.

6. **Official-schema exclusions matter.** Chronological replay excluded 40
   confirmed updates whose `old_value` referred to a non-current value and one
   Forget whose target was absent. Reflect was excluded. These were recorded in
   `data/memops_adapter_exclusions.json`; no ambiguous event was relabeled or
   repaired. This improves executor validity but narrows coverage relative to
   all published artifacts.

7. **Baseline protocol remained short-output and fixed.** Both LLM baselines
   returned only strict `{operation,target}` JSON under the same frozen policy
   semantics. A GPT-5.4 infrastructure preflight exhausted a 64-token budget in
   hidden reasoning and returned no JSON; it was preserved under
   `results/preflight/` and excluded before formal measurement. Claude Sonnet
   4.6 was then frozen for all 433 strong-controller decisions; no prompt was
   changed in response to benchmark failures.

## Final decision

**GO**

Jev exceeds the strong short-output LLM baseline by a statistically clear
13.33 points on paired Layer-A joint accuracy, is faster and substantially
cheaper at the controller layer, and maintains exact final state on 88% of
closed-loop trajectories versus 24% for the strong LLM. Its advantage remains
on tentative and recency-trap slices and is especially large for ADD and
closed-loop error containment.

The decision is not `STRONG_GO` because absolute robustness is not yet high
enough: Layer-A joint accuracy is 85.33%, recency-trap accuracy is 75.36%, three
of 25 final states are wrong, high-confidence errors remain, retraction coverage
is only one case, and the official Remember labels expose a policy/benchmark
construct mismatch. The result supports feasibility and a next-stage
evaluation, not unattended production deployment.
