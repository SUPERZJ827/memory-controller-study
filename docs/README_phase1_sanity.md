# Jev Memory Operator Sanity Experiment

Minimal, reproducible kill test for ADD / UPDATE / DELETE / NOOP classification and two-stage target-memory selection using OpenRouter's typed Decisions API.

## Requirements

- Node.js 22 or newer
- `OPENROUTER_API_KEY` in the process environment or project-root `.env.local`

The key is never written to source or result files. `.env` and `.env.local` are ignored by Git.

## Run

```bash
npm install
npm run smoke
npm run sanity
```

The formal runner is serial. Stage 2 runs only when Stage 1 predicts UPDATE or DELETE. ADD and NOOP receive target `NONE` without a second request.

Outputs:

- `results/sanity_results.jsonl`
- `results/sanity_summary.json`
- `RESULT.md`

The 20-case set contains 15 basic cases (4 ADD, 4 UPDATE, 3 DELETE, 4 NOOP) and 5 boundary cases (tentative plan, retraction, duplicate paraphrase, target ambiguity, and partial update). Confidence results are exploratory only.
