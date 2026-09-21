# Contribution and evidence plan

This is a scope decision and evidence inventory, not a paper draft or completed
Phase 4 result. The target is a focused empirical submission; no venue promise.

| Proposed contribution | Existing evidence | New evidence inside $20 | Maximum defensible conclusion |
|---|---|---|---|
| Controller replacement quality–cost trade-off | Phase 3 Jev 256/300 vs GPT 260/300; delta −1.33 pp, CI [−5.33,+2.67] | 12–24 complete knowledge-update histories, B/C own states, shared local modules, fixed automated QA score | Observed trade-off for this controller pair, local stack and selected task |
| Actual cost composition | 433 old decisions per method with tokens/API costs; only controller costs measured | New stage costs, shared-work attribution, local work and end-to-end times | Which stages consume resources and how much replacing the controller changes the observed bill/workload |
| Construct-validity limitation | 38/124 enriched audit cases with model-consensus mismatch; 9/10 high-confidence errors match reviewers | No new paid audit; disclose existing selection/reviewer limits | Evaluation-policy alignment can substantially alter interpretation; no replacement human gold |
| Boundaries of reliability | Old stress Jev178/180, GPT180/180, Claude180/180; template ceiling | Traceable before/after state examples; optional fixed human inspection | Descriptive failure cases; formal state accuracy only if independently human-validated |

Do not claim A-vs-B decision/generation separation effects from B-vs-C alone.
Do not claim non-inferiority, calibration reliability, or causal error
propagation from the new small sample. The old 22/25 vs19/25 final-state result
remains exploratory. Do not relabel the old consensus-filtered samples as a new
unbiased benchmark.

Current recommendation: prepare the bounded B/C pilot; paper drafting remains
conditional on completion and interpretability of the resulting evidence.
At the end of the approved round, give a write/stop decision using the actual
results. A narrow null/negative finding is reported without a new spending
request. Do not automatically add A/D, extra reviewers, a new dataset, training,
GPU rental, or another phase to reach a venue target.

Potential claim if supported: “For a fixed local memory stack and a small
natural-language knowledge-update sample, replacing a generative operation
controller changes QA by X pp [CI] while changing API spend by Y and local work
by Z.” This deliberately leaves the sign and magnitude to the experiment.

