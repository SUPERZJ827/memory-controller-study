// Offline planning only: no network, model calls, or writes to frozen artifacts.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const priceSnapshot = {
  checked_at_utc: '2026-09-20T10:38:51.698Z',
  sources: [
    'https://openrouter.ai/api/v1/models',
    'https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints',
  ],
  gpt_input_per_million_usd: 2,
  gpt_output_per_million_usd: 10,
  judge_input_per_million_usd: 2.5,
  judge_output_per_million_usd: 10,
  jev_input_per_million_usd: 0.042,
  jev_output_per_million_usd: 0,
  jev_context_tokens: 32000,
};
const scenarios = [
  {name: 'low', sessions: 48, facts_per_session: 1.5, gpt_input: 650, gpt_completion_including_reasoning: 60, jev_pair_cost: 0.00006},
  {name: 'base', sessions: 48, facts_per_session: 2.5, gpt_input: 1200, gpt_completion_including_reasoning: 140, jev_pair_cost: 0.00010},
  {name: 'high', sessions: 48, facts_per_session: 4, gpt_input: 2200, gpt_completion_including_reasoning: 320, jev_pair_cost: 0.00020},
];
const r = (v: number) => Number(v.toFixed(6));
const judgePairCost = 2 * (1000 * 2.5 + 10 * 10) / 1e6;
const estimates = scenarios.map(s => {
  const facts = s.sessions * s.facts_per_session;
  const gptPerDecision = (s.gpt_input * 2 + s.gpt_completion_including_reasoning * 10) / 1e6;
  const pairedControllersPerHistory = facts * (gptPerDecision + s.jev_pair_cost);
  const nByCost = Math.floor(16 / (1.5 * pairedControllersPerHistory));
  return {
    ...s,
    assumption_only_not_measurement: true,
    facts_per_history: facts,
    gpt_cost_per_decision_usd: r(gptPerDecision),
    B_plus_C_controller_cost_per_history_usd: r(pairedControllersPerHistory),
    dev_full_history_including_two_judges_usd: r(pairedControllersPerHistory + judgePairCost),
    dev_fits_1_usd_before_retries: pairedControllersPerHistory + judgePairCost <= 1,
    formal_n_by_1point5_planning_allowance: nByCost < 12 ? null : Math.min(24, nByCost),
    formal_n_rule_outcome: nByCost < 12 ? 'STOP_IF_PILOT_RESEMBLES_THIS' : 'ESTIMATE_ONLY_FREEZE_AFTER_PILOT',
    formal_sizes: [12,18,24].map(n => ({
      n,
      B_plus_C_decisions: 2 * n * facts,
      B_input_tokens: n * facts * s.gpt_input,
      B_completion_tokens_including_reasoning: n * facts * s.gpt_completion_including_reasoning,
      formal_controllers_usd: r(n * pairedControllersPerHistory),
      formal_judges_usd: r(n * judgePairCost),
      projected_invoice_with_full_1_usd_dev_and_2_usd_failure_allowance: r(3 + n * (pairedControllersPerHistory + judgePairCost)),
      controller_forecast_with_50_percent_allowance_fits_16_usd: 1.5 * n * pairedControllersPerHistory <= 16,
    })),
  };
});
const oldPath = 'results/phase3/main_results.json';
const oldBytes = await readFile(oldPath);
const old = JSON.parse(oldBytes.toString());
const legacy = Object.fromEntries(Object.entries(old.controllers).map(([name, value]) => {
  const v = value as {efficiency: Record<string, unknown>};
  return [name, v.efficiency];
}));
const artifact = {
  status: 'PLANNING_ONLY_NO_INFERENCE_AUTHORIZED',
  new_inference_calls: 0,
  method: 'uncached tariff arithmetic; facts/session and tokens/decision are scenario assumptions, not pilot observations',
  price_snapshot: priceSnapshot,
  caps_usd: {total:20,development:1,formal_controllers:16,formal_judges:1,formal_failures_retries_auxiliary:2},
  expected_vs_reserved: 'scenario averages never substitute for request upper-bound reservations',
  jev_full_context_reservation_usd_per_request: 32000 * 0.042 / 1e6,
  formal_judge_pair_assumption_usd: judgePairCost,
  estimates,
  local_compute: 'API charge absent; tokens, local service time, queueing and resource limitations still reported',
  legacy: {
    source: oldPath,
    sha256: createHash('sha256').update(oldBytes).digest('hex'),
    scope: 'Phase 3 main 433 controller-only decisions per method; reused, not part of the new $20 spend',
    methods: legacy,
  },
};
await writeFile('phase4/low_budget_estimates.json', JSON.stringify(artifact, null, 2) + '\n');
const csv = ['method,decisions,input_tokens,output_tokens,reasoning_tokens,api_cost_usd,median_latency_ms,scope'];
for (const [name, e] of Object.entries(legacy)) {
  csv.push([name,e.decisions,e.input_tokens,e.output_tokens,e.reasoning_tokens ?? '',e.controller_only_cost_usd,e.median_latency_ms,'legacy_controller_only'].join(','));
}
await writeFile('phase4/legacy_controller_usage.csv', csv.join('\n') + '\n');
// Select only development membership; formal n/IDs remain undecided until pilot.
const datasetPath = 'data/longmemeval/longmemeval_s_cleaned.json';
const datasetBytes = await readFile(datasetPath);
const datasetHash = createHash('sha256').update(datasetBytes).digest('hex');
if (datasetHash !== 'd6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442') {
  throw new Error('Pinned dataset mismatch');
}
type Row = {question_id:string;question_type:string;question_date:string;answer_session_ids:string[];haystack_session_ids:string[];haystack_dates:string[]};
const dateKey = (s:string) => s.slice(0,10) + ' ' + s.slice(-5);
const seed = 'phase4-low-budget-dev-v1';
const eligible = (JSON.parse(datasetBytes.toString()) as Row[]).filter(x =>
  x.question_type === 'knowledge-update' && !x.haystack_session_ids.some((id,i) =>
    x.answer_session_ids.includes(id) && dateKey(x.haystack_dates[i]) > dateKey(x.question_date)));
if (eligible.length !== 77) throw new Error('Expected 77 eligible knowledge-update histories');
const ranked = eligible.map(row => ({row,rank:createHash('sha256').update(seed+'\0'+row.question_id).digest('hex')}))
  .sort((a,b)=>a.rank.localeCompare(b.rank));
const selected = ranked[0];
await writeFile('phase4/low_budget_development_selection.json', JSON.stringify({
  status:'FIXED_DEVELOPMENT_MEMBERSHIP_NOT_AUTHORIZED_TO_RUN',
  source:datasetPath,source_sha256:datasetHash,
  seed,algorithm:'ascending SHA256(seed NUL question_id)',
  eligible_knowledge_update_count:77,formal_pool_after_development:76,
  development_question_id:selected.row.question_id,selection_digest:selected.rank,
  chronological_sessions_to_ingest:selected.row.haystack_dates.filter(d=>dateKey(d)<=dateKey(selected.row.question_date)).length,
  hard_cap_including_judges_retries_and_failures_usd:1,
  formal_membership_frozen:false,
  controller_payload_excludes_question_id:true,
},null,2)+'\n');
console.log(JSON.stringify({inference_calls:0,estimates:estimates.map(s=>({scenario:s.name,dev_usd:s.dev_full_history_including_two_judges_usd,formal_n:s.formal_n_by_1point5_planning_allowance}))},null,2));
