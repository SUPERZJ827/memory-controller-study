# Phase 4 pre-run cost envelope

Status: planning estimate only. No Phase-4 model calls have been made.

The leakage-safe primary projection contains 456 questions and 21,550
sessions. Its timestamped session payload is approximately 57.8 million tokens
using the conservative `characters / 4` planning approximation. Exact provider
token usage will replace this estimate in the formal attempt-level ledger.

Pricing snapshot used for planning on 2026-09-20:

- GPT-5.6 Sol: $2 per million input tokens and $10 per million output tokens.
- Jev: $0.016882404 / 433 = approximately $0.0000390 per decision, based on the
  frozen Phase-3 measured controller cost. This is not assumed to remain exact.
- The official GPT-4o evaluator and local embedding compute are small relative
  to ingestion/update calls but remain separately logged in the formal run.

The range below varies extracted facts per session, decision context length,
mutation rate, writer length and reader context. It assumes state-independent
fact extraction is physically executed once and reused by A/B/C/D, while the
standalone arm totals charge the complete extraction cost to each arm.

| Scenario | Extracted facts | Actual experiment spend | Standalone A | Standalone B | Standalone C | Standalone D | C cost reduction vs B |
|---|---:|---:|---:|---:|---:|---:|---:|
| Low | 32,325 | $311.62 | $195.52 | $201.98 | $161.22 | $130.87 | 20.2% |
| Base | 53,875 | $640.21 | $311.16 | $348.07 | $247.80 | $144.15 | 28.8% |
| High | 86,200 | $1,501.31 | $592.86 | $730.78 | $484.16 | $170.48 | 33.7% |

These are deliberately broad engineering estimates, not projected findings.
They exclude unexpected retries, provider price changes, long reasoning output,
and any human annotation expense. They also do not monetize local GPU usage.

The formal runner must preserve two cost views:

1. **Actual spend:** shared extractor calls and other physically cached common
   work are counted once.
2. **Standalone attributed cost:** every arm is charged the common work it
   would incur when independently deployed.

Parallel execution changes neither view. It may reduce elapsed time but cannot
be described as a token or monetary saving.

## Spend gate

The formal paid run must not begin until an explicit maximum experiment budget
is recorded in the frozen executable manifest. The recommended planning value
is the base estimate plus a bounded retry reserve; the runner must stop before
crossing the ceiling rather than silently consuming the high estimate.
