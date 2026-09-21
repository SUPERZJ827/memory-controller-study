# Jev Memory Operator — Phase 3 Result

## Decision

**GO**

Jev is statistically indistinguishable from GPT-5.6 Sol on the frozen 300-case
Layer-A test, retains a closed-loop final-state advantage, and does not collapse
on the independent 180-case boundary set. However, Phase 2's large advantage
over Claude was entirely a net ADD-slice effect and is materially entangled
with MemOps/policy construct mismatch. This supports moving to a scoped full
memory-system experiment, but not a claim that Jev generally outperforms
frontier generative LLMs.

## Frozen inputs and protocols

- Phase-2 transitions: `6156f02056c9dcf5d890cbcdc5c3db7a33698b4a5ba2fa0283da668b5d475447`
- Phase-2 trajectories: `92b27bdacba25fc7631b77ddc9b913ef2ef8b640fd2c702a445ba3996a439ca0`
- Jev policy: `e824dfdeffe485ddde0fa6fbe5500c73874335c9ec57f473f74e463b4bdc2393`
- GPT-5.6 Sol protocol: `7be699ffa443845699a893b10709f7491c39a0ee2abd09fad2dad5f21840185b`
- Blind audit packet: `0703e54d9ee5f700d53405cdb47f1f1579df8590e6a9f6749d9aeb8db412bf0d`
- Boundary Stress v1: `eddfea9d2a331a0698a47fed4f11a731a640febb8a47520d1a5ce6945e208c06`

GPT-5.6 Sol used `reasoning.effort="medium"`, strict JSON schema, and
`max_completion_tokens=512`. The fixed five-case preflight parsed 5/5 with no
retry. The subsequent 300 transitions and 133 trajectory steps had zero parse
errors and zero retries. No Phase-2 frozen artifact was rerun or modified.

## Four-controller main result

### Layer A — 300 frozen transitions

| Controller | Operation Accuracy | Macro-F1 | Target Accuracy | Target-required Accuracy | Joint Accuracy |
|---|---:|---:|---:|---:|---:|
| Jev 1.13 | 85.33% | 85.45% | 91.00% | 92.00% | 85.33% (256/300) |
| GPT-5.6 Sol | **86.67%** | **86.71%** | **93.33%** | 94.67% | **86.67% (260/300)** |
| Claude Sonnet 4.6 | 72.00% | 70.09% | 88.33% | 94.00% | 72.00% (216/300) |
| Qwen3-8B | 51.00% | 44.68% | 72.00% | **95.33%** | 51.00% (153/300) |

High target-required accuracy alongside lower joint accuracy means that most
errors are operation-selection errors rather than wrong-target errors.

### Layer B — 25 trajectories / 133 steps

| Controller | Step Accuracy | Intermediate-State Accuracy | Final-State Accuracy | Error Propagation Rate |
|---|---:|---:|---:|---:|
| Jev 1.13 | **89.47%** | **96.30%** | **88.00% (22/25)** | **40.00% (2/5)** |
| GPT-5.6 Sol | 84.21% | 85.19% | 76.00% (19/25) | 68.42% (13/19) |
| Claude Sonnet 4.6 | 72.93% | 42.59% | 24.00% (6/25) | 98.41% (62/63) |
| Qwen3-8B | 52.63% | 25.00% | 0.00% (0/25) | 100.00% (81/81) |

The error-propagation denominator counts only steps strictly after the first
wrong prediction, so it is not directly an error-frequency metric.

### Controller-only efficiency over 433 decisions

| Controller | Median / mean / p90 latency | Input tokens | Output tokens | Cost |
|---|---:|---:|---:|---:|
| Jev 1.13 | **539 / 606 / 856 ms** | 401,962 | 29,283 | **$0.0169** |
| GPT-5.6 Sol | 1,541 / 1,830 / 2,828 ms | 180,308 | 16,308 (7,799 reasoning) | $0.5237 |
| Claude Sonnet 4.6 | 1,392 / 1,475 / 1,720 ms | 273,488 | 5,951 | $0.9097 |
| Qwen3-8B | **258 / 275 / 311 ms** | 158,758 | 4,879 | $0 metered API cost* |

*Local cost excludes hardware, electricity, and shared-server opportunity cost.
No whole-memory-system cost claim is made.

## Operator and difficulty slices

Joint accuracy:

| Slice | n | Jev | GPT-5.6 Sol | Claude | Qwen3-8B |
|---|---:|---:|---:|---:|---:|
| ADD | 75 | 81.33% | 69.33% | 28.00% | 4.00% |
| UPDATE | 75 | 84.00% | **89.33%** | 88.00% | **89.33%** |
| DELETE | 75 | 100.00% | 100.00% | 100.00% | 98.67% |
| NOOP | 75 | 76.00% | **88.00%** | 72.00% | 12.00% |
| tentative | 74 | 77.03% | **87.84%** | 71.62% | 10.81% |
| recency trap | 69 | 75.36% | **86.96%** | 69.57% | 4.35% |
| candidate disambiguation | 119 | 94.12% | **96.64%** | 95.80% | **96.64%** |
| update chain | 144 | 79.86% | **88.19%** | 79.17% | 48.61% |
| retraction | 1 | 0.00% | 100.00% | 100.00% | 100.00% |

The official retraction slice remains `n=1` and supports no general conclusion.
The dedicated stress set supplies the meaningful retraction evidence.

The Jev–Claude correct-count difference by operator is ADD `+40`, UPDATE `-3`,
DELETE `0`, and NOOP `+3`: the entire net `+40` Phase-2 difference is therefore
an ADD-slice effect. Against GPT, Jev is `+9` on ADD but `-4` on UPDATE and `-9`
on NOOP, producing the net `-4` cases.

## Paired comparisons

### Jev vs GPT-5.6 Sol

- Joint delta (Jev − GPT): **−1.33 percentage points**
- 20,000-resample paired bootstrap 95% CI: **[−5.33, +2.67] points**
- Both correct: 240
- Jev only correct: 16
- GPT only correct: 20
- Both wrong: 24
- Exact two-sided McNemar: **p = 0.6177**

There is no evidence of a Layer-A accuracy difference at this sample size. This
is evidence of similar quality, not proof of equivalence. GPT is numerically
higher on Layer A; Jev is numerically higher on closed-loop final state.

### Jev vs Claude Sonnet 4.6

- Joint delta (Jev − Claude): **+13.33 points**
- Paired bootstrap 95% CI: **[+8.67, +18.00] points**
- Both correct / Jev only / Claude only / both wrong: 208 / 48 / 8 / 36
- Exact two-sided McNemar: **p = 4.7e-8**

The statistical result is real under original MemOps gold, but the practical
interpretation changes after the construct audit below.

## Construct-validity blind audit

The packet contained the complete disagreement/wrong union (94 cases) plus 30
triple-correct controls. It was intentionally enriched and is not an estimate
of mismatch prevalence across all 300 cases.

Reviewer A was GPT-5.6 Sol; Reviewer B was Claude Sonnet 4.6. Both completed
124/124 independently with zero parse errors/retries.

| Audit result | Count |
|---|---:|
| A — reviewers agree with benchmark | 52 |
| B — reviewers agree with each other, disagree with benchmark | **38** |
| C — reviewers disagree | 33 |
| D — at least one MATERIAL ambiguity | 1 |

- Operation agreement: 90/124 = 72.58%; Cohen's κ = 0.619
- Joint agreement: 90/124 = 72.58%; Cohen's κ = 0.622
- Reviewer A vs benchmark joint agreement: 79/124 = 63.71%
- Reviewer B vs benchmark joint agreement: 57/124 = 45.97%

The 38 consensus mismatches consist mainly of policy-consistent rejection of
one-time/historical/tentative ADDs, treating “return to the already represented
value” as NOOP rather than benchmark UPDATE, and treating near-certain future
values as current UPDATE. They are preserved as an audit finding; no Phase-2
label was changed.

### Sensitivity

Strict-consensus audited subset (`n=52`):

| Controller | Joint Accuracy |
|---|---:|
| Jev | 86.54% |
| GPT-5.6 Sol | **94.23%** |
| Claude | 65.38% |
| Qwen3-8B | 46.15% |

This subset is selection-enriched and should not be read as a new benchmark.
For a conservative full-set sensitivity, all 176 unaudited triple-correct cases
are retained and audited cases are retained only under strict consensus
(`n=228`):

- Jev 96.93%, GPT 98.68%, Claude 92.11%, Qwen 65.79%.
- Jev−GPT: −1.75 points, CI [−4.39, +0.44], McNemar p=0.289.
- Jev−Claude: +4.82 points, CI [+0.88, +8.77], McNemar p=0.0266.

Thus the Jev/Claude advantage **shrinks from 13.33 to 4.82 points** after strict
policy-consensus filtering but does not reverse. Jev remains statistically
indistinguishable from GPT. The comparative conclusion does not disappear, but
the original effect size clearly depended in substantial part on construct
mismatch and Claude's ADD behavior.

Excluding only the one MATERIAL case (`n=299`) barely changes results:
Jev−GPT −1.00 points and Jev−Claude +13.38 points. MATERIAL-only filtering is
therefore too weak to resolve the broader benchmark/policy mismatch.

## Boundary Stress v1 — 180 cases

| Controller | Joint Accuracy | Macro-F1 | Target Accuracy | Over-mutation | Under-mutation |
|---|---:|---:|---:|---:|---:|
| Jev 1.13 | 98.89% (178/180) | 98.22% | 99.44% | **0/80 = 0%** | 1/100 = 1% |
| GPT-5.6 Sol | **100%** | **100%** | **100%** | 0% | 0% |
| Claude Sonnet 4.6 | **100%** | **100%** | **100%** | 0% | 0% |
| Qwen3-8B | 86.67% | 69.14% | 92.22% | 14/80 = 17.5% | 10/100 = 10% |

Jev family accuracy:

- tentative plan: 30/30
- explicit retraction/cancellation: 29/30
- recency trap: 30/30
- round-trip update: 29/30
- partial update: 30/30
- persistence ambiguity: 30/30

Jev's two errors were one cancelled-plan DELETE predicted UPDATE and one
round-trip UPDATE predicted NOOP. No stress-set error had confidence ≥0.9.

The stress result rules out a systematic collapse on clearly specified
boundaries. It does not establish real-world saturation: deterministic template
rules create a ceiling for both frontier LLMs, and more natural, less explicitly
signalled policy-native boundary data is still needed.

## Jev confidence — Phase 2 Layer A + Boundary Stress

Combined `n=480`: 434 correct, 46 wrong.

| Group | Mean confidence | Median | p10–p90 |
|---|---:|---:|---:|
| Correct | 0.934 | 0.980 | 0.800–1.000 |
| Wrong | 0.712 | 0.680 | 0.485–0.960 |
| Over-mutation errors (n=18) | 0.596 | 0.575 | 0.451–0.733 |
| Under-mutation errors (n=24) | **0.791** | 0.795 | 0.573–0.977 |

| Confidence bucket | Accuracy | Coverage |
|---|---:|---:|
| `>= 0.95` | 97.43% | 64.79% |
| `>= 0.90` | 97.26% | 76.04% |
| `0.80 <= c < 0.90` | 85.71% | 8.75% |
| `< 0.80` | 58.90% | 15.21% |

There are 10 wrong predictions at confidence ≥0.9, all from Phase 2. Combined
10-bin ECE is 0.0138 and multiclass operation Brier score is 0.1403, but these
aggregate values do not justify calling Jev reliably calibrated. In particular,
under-mutation errors are more confident than over-mutation errors. Full
risk-coverage data and all high-confidence errors are saved in the result JSON.

## Failure analysis and the eight required answers

1. **GPT-5.6 Sol Joint Accuracy:** 86.67% (260/300); final-state accuracy
   76% (19/25).
2. **Jev vs GPT:** −1.33 points, 95% CI [−5.33, +2.67], McNemar p=0.6177.
3. **Was the Phase-2 Jev advantage mainly Claude ADD failure?** Yes. The net
   40-case Jev advantage is exactly the net 40-case ADD difference; non-ADD
   slices sum to zero net difference.
4. **Blind-audit construct mismatches:** 38 reviewer-consensus mismatches in
   the enriched 124-case audit, plus 33 reviewer disagreements and one MATERIAL
   case.
5. **Does Jev's advantage survive exclusion?** Against Claude, yes but much
   smaller (+4.82 points in the conservative strict-consensus full subset).
   Against GPT, Jev remains slightly lower and statistically indistinguishable.
6. **Boundary Stress:** GPT 100%, Claude 100%, Jev 98.89%, Qwen 86.67%.
7. **Jev's dominant failure mode:** the mutation-versus-NOOP boundary. Across
   Phase 2 + stress, under-mutation is slightly more frequent than
   over-mutation (24 vs 18) and is more highly confident; the recurring forms
   are persistent ADD/round-trip UPDATE being treated as NOOP and tentative
   future values being over-applied.
8. **Enough evidence for a full memory-system experiment?** Yes for a scoped
   research experiment with policy-native labels and real text/state execution;
   no for production readiness or for claiming universal superiority over
   frontier LLMs.

## Paper-project recommendation

**Yes, upgrade to a paper project**, with the claim repositioned to:

- decision-native operation control can match a frontier reasoning LLM on
  independent transitions;
- it can preserve closed-loop state better under this executor;
- it offers a large controller-only latency/cost advantage;
- benchmark-policy alignment is a first-class evaluation requirement.

Do not center the paper on “Jev beats generative LLMs.” The GPT result and blind
audit support a stronger, more defensible story about decision/generation
separation, state stability, efficiency-quality trade-offs, and construct-valid
evaluation. The next experiment should be the full memory-system study; it is
not started here.
