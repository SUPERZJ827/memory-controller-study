# Phase 4 preregistration addendum v2: future-evidence eligibility

This addendum was frozen before any Phase-4 model prediction. It supersedes the
primary sample definition in the original preregistration while leaving that
file unchanged for provenance.

The LongMemEval adapter audit found:

- 211/500 source records are not stored chronologically;
- 76 records contain 1,475 sessions timestamped after `question_date`;
- 44 records contain 75 gold-evidence sessions after `question_date`;
- the remaining eligible records contain 253 future non-gold sessions.

Using all source sessions would violate the no-future-evidence requirement.
Removing only a future gold session would leave that question unanswerable.
Therefore the primary projection is fixed as follows:

1. stably sort sessions chronologically;
2. exclude an entire question when any gold evidence is after the question;
3. otherwise omit every session after the question;
4. retain every other question without result-dependent filtering.

This produces 456 eligible questions and 21,550 sessions. Eligible-ID hash in
source order is:

```text
a481d7557d7336298d2c0a0c52f232370171b192266ddabcf46de44eb7ea32c0
```

The original non-inferiority margin (−3 pp), paired 20,000-resample bootstrap,
cost threshold (at least 10% standalone complete-system reduction), arms and
interpretation rules remain unchanged. The 456-case result is explicitly a
leakage-safe projection, not an unbiased replacement benchmark or a number
directly comparable with official 500-history runs.

