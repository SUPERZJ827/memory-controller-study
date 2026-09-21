# Fixed development execution, budget revision v2

This is an additive implementation note, not a replacement for previous
preregistrations or results. It authorizes no formal run. User authorization
covers this fixed development history only, with a cumulative $1 ceiling
inside the new $28 campaign. No pool transfers.

The executable freezes its source hashes before any model call. The budget
simulations must pass first. Local model weights are separately hashed in
`phase4/local_weights_v2.json`. The only entry point is
`npx tsx src/phase4/run_pilot_v2.ts --run-authorized-pilot`.

Development membership remains `9bbe84a2`: all 47 chronologically eligible
sessions, not a shortened prefix. The inherited timestamp projection excludes
one later-dated distractor session; this is a local conservative task definition,
not an assertion that the official benchmark is defective. First extract all
sessions locally using the same frozen prompts/settings and source-index
validation. The extractor never receives the query, answer, answer locations,
or future sessions. Its raw responses are saved even if parsing fails.

For every fact, B and C retrieve from their own active stores, independently
predict, and apply the same local writer. Both arms finish step t before t+1.
There are at most two paid requests in flight and one local chat generation.
Invalid controller semantics are recorded as failures without mutation or
repair. Local extraction/writer/answer failure stops this pilot rather than
silently dropping evidence or changing the prompt. No automatic retries are
enabled (the proposal allowed at most one, not a required retry).

The evidence/event archive is preserved in each arm, as previously specified.
It retains historical/tentative/retracted evidence with provenance separately
from active state. QA can retrieve from both layers. Consequently correct QA
alone does not establish correct active memory or causal controller benefit;
retrieved active/archive counts and inspectable state snapshots must be reported.
The system is not claimed to enforce irreversible deletion of the evidence log.

Budget reservations precede transport. Each Jev call reserves the cost of the
provider's full 32,000-token context at $0.042/M input tokens. GPT input reserves
one token per UTF-8 request byte plus an 8,192-token provider-formatting envelope;
requests above the frozen 24,000-token bound are rejected. GPT output reserves
all 512 completion/reasoning tokens at $10/M. The router is constrained to the
specified provider and price ceilings. These conservative bounds depend on the
provider honoring its price/token contract; an inconsistent invoice persists
and halts the campaign, rather than being discarded. No multimodal, tools,
plugins, multiple completions, or unpriced model requests are allowed.

Two $0.05 judge-capacity holds are made in the development pool before controller
execution. They can fund only that arm's official-rubric GPT-4o judge call.
Unused and provably unsent judge holds are cancelled when the pilot stops.
Dispatched or unknown-charge requests retain their entire holds. All new paid
calls, including any errors, belong to the development pool. The formal pools
remain untouched. Raw exact API dollar amounts are retained; the guard rounds
each actual invoice upward to integer micro-USD, conservatively.

Physical shared extraction is counted once in actual usage and fully in each
arm's standalone usage. Other local calls are per-arm. Report local token use
and latency; zero local API charge does **not** mean zero hardware cost. QA judge
charges are reported separately from system costs. An incomplete pilot must not
be described as a complete-history cost measurement or used to claim QA quality.

At a terminal pilot outcome, freeze the output without implicit resume. If the
fixed pilot cannot complete within $1, report the stop: do not replace its sample,
shorten it, transfer funds, or launch the formal run. Formal n and membership are
frozen only after a successful cost/implementation check, using cost alone and
the already specified random ranking. A complete pilot is not a guarantee that
every formal history fits the forecast; the same cumulative guard remains binding.
