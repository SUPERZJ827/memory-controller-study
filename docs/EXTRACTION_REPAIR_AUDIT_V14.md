# Phase 4 local extraction repair audit (development only)

This audit covers the fixed development history `9bbe84a2`. It does not create
benchmark gold and does not estimate formal-test accuracy. Formal histories have
not been passed to any model.

## What changed

The failed extractor allowed the local model to generate paraphrased facts and
then checked only a claimed turn index. Its first response produced 16 facts
from assistant turns about GAIL and zero autobiographical facts. The validator
stopped before any write or paid controller call.

The repaired extractor enumerates deterministic fragments of USER text. A local
Qwen3-8B verifier may only classify each immutable fragment as current,
historical, tentative, retracted or DROP. It cannot generate fact text. Every
retained fact stores the original user-turn index and exact source text.

Source hygiene removes pure leading interrogatives, narrow conversational
acknowledgments, non-user-subject fragments, signed testimonial blocks, and
unattributed user turns longer than 2,000 characters. The last rule is
conservative and may omit genuine long narratives without an ownership marker;
explicit `my bio`, `my resume`, `story of mine`, and related markers bypass it.

## Development checks

| Check | Result |
|---|---:|
| Chronological sessions completed | 47 / 47 |
| Deterministic USER fragments | 757 |
| Source-prefiltered fragments | 337 |
| Retained verbatim facts | 310 |
| Current / historical / tentative / retracted | 117 / 67 / 126 / 0 |
| Retained facts with USER source | 310 / 310 |
| Retained fact text found verbatim in cited USER turn | 310 / 310 |
| Original GAIL distractor retained | 0 |
| Signed/unattributed long testimonial/article fragments retained | 0 / 74 |
| Truncated verifier batches | 1 |
| Deterministic split fallback | 1 |
| Unknown extra verdict keys | 1 (`"0"`, logged and ignored) |
| Missing required verdicts accepted | 0 |

The intended final extraction path used 95 local calls, 118,089 input tokens and
94,106 output/thinking tokens. One failed batch is included in those totals.
These are local-model tokens; local hardware cost was not monetized and must not
be described as free compute.

## Remaining limits

- Verbatim evidence removes generated-fact hallucination, but selection and
  state-kind classification remain model judgments.
- Some genuine user utterances are conversational, topical or short-lived. The
  extractor may surface them as evidence; the lifecycle controller must still
  choose NOOP when they do not justify persistent mutation.
- Empty extraction is explicitly valid. This prevents assistant contamination
  but means recall cannot be established without prediction-blinded human gold.
- The 2,000-character unattributed-text rule trades possible recall for source
  safety and needs disclosure in any paper.
- All prompt and parser repairs used only the fixed development history. The 24
  frozen formal histories remain untouched by model inference.

The development evidence supports proceeding to the already-scoped B/C formal
comparison. It does not establish extraction accuracy or justify adding a new
research claim about the extractor.
