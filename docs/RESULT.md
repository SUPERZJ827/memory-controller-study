# Jev Memory Operator Sanity Result

## Setup

- Node version: v26.7.0
- ai package version: 7.0.107 (installed but not used for Jev calls)
- OpenRouter SDK version: 1.3.8
- Model: typesafe/jev-1.13
- Case count: 20
- Fixed policy SHA-256: `e824dfdeffe485ddde0fa6fbe5500c73874335c9ec57f473f74e463b4bdc2393`

## Results

| Metric | Result |
|---|---:|
| Operation Accuracy | 20/20 (100.0%) |
| Target Accuracy | 10/10 (100.0%) |
| Joint Accuracy | 20/20 (100.0%) |
| Boundary Accuracy | 5/5 (100.0%) |
| Median Latency | 734.97 ms total (413.27 ms operation) |

## Failures

No failed cases.

## Confidence

Lower-confidence samples were not less accurate in this run; exploratory only. Correct mean/median confidence: 0.96 / 0.99; wrong mean/median confidence: N/A / N/A.

## Preliminary Decision

GO
