# memory-controller-study

Code, protocols, and result records for an empirical study of **operation-controller choice in LLM agent memory**:
two controller configurations (GPT-5.6 Sol and Jev) inside one fixed memory pipeline, compared on cost,
maintenance behaviour (ADD / UPDATE / DELETE / NOOP), downstream workload, and final answer quality over
24 LongMemEval knowledge-update histories run in independent closed loops.

This is an exploratory system comparison, not a new memory framework or model. The two configurations differ
in model, request protocol, and policy wording, so behavioural differences are not attributable to a single model.

## Repository layout

| Path | Contents |
|---|---|
| `src/` | TypeScript harness: MemOps/LongMemEval adapters, controllers, local memory pipeline, budget guard, ledger, formal runner, analysis (`src/phase4/`) |
| `protocol/` | Frozen protocols, preregistrations, sample freeze, authorisations, runtime amendments v18–v25, manifests |
| `docs/` | Design specifications and phase reports written during the study (historical records; plans in them are not results) |
| `data/` | MemOps-derived transition/trajectory cases, boundary stress set, sanity cases |
| `audit/` | Phase-3 construct-audit packets and LLM reviewer outputs |
| `results/` | Phase 1–3 results; Phase-4 formal analysis files, per-history QA records, final states, decision indices, stop records |

## What is not included, and why

- **API keys and environment files** (`.env*`) — never committed.
- **LongMemEval data** — obtain `longmemeval_s_cleaned.json` from the official LongMemEval release; the adapter
  checks SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
- **Third-party repositories** (MemOps, LongMemEval, Mem0) and `node_modules/` — install or clone from their sources.
- **Large raw Phase-4 archives** — the call ledger (~2 GB SQLite), 55,098 raw call records (~2.9 GB), and
  per-step state snapshots (~2.5 GB).
- **Private blinding and audit-selection keys** (`*_private.json`).
- **Manuscript, paper analysis scripts, and supplementary material** — not included while the paper is under preparation.

## Reproducibility

- The Phase-4 summary files in `results/phase4_formal_v17/` were produced by `src/phase4/analyze_formal_v22.ts`
  from the full run records. Re-running the
  experiment requires the LongMemEval file, local Qwen3-8B and Qwen3-Embedding-4B services, and paid API access;
  whether the same commercial model snapshots (`openai/gpt-5.6-sol`, `typesafe/jev-1.13-20260917`,
  `openai/gpt-4o-2024-08-06`) remain available depends on the providers.
- Runtime amendments made after the formal run started are documented in `protocol/phase4/formal_runtime_amendment_v*.json`
  and `protocol/phase4/formal_runtime_recovery_v22.json`.

## Key limitations

24 histories with two discordant QA outcomes; automated QA judging; no human annotation of memory states;
shared extraction, writer, and reader errors; no DELETE observed; local compute not monetised.

## Licence

The author's own code and original materials are released under the MIT licence (`LICENSE`). Content derived from
LongMemEval and MemOps keeps its original licence and copyright notices; see `THIRD_PARTY_NOTICES.md`.

## Author

Jun Zhou, Shanghai Jiao Tong University.
