// Offline budget amendment; preserve all previous artifacts and measurements.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const oldPath = 'phase4/low_budget_estimates.json';
const oldBytes = await readFile(oldPath);
const old = JSON.parse(oldBytes.toString());
const configPath = 'phase4/budget_config_v2.json';
const configBytes = await readFile(configPath);
const config = JSON.parse(configBytes.toString());
if (config.totalMicroUsd !== 28_000_000 || config.pools.dev !== 1_000_000 ||
    config.pools.formal_controllers !== 24_000_000 || config.pools.formal_qa !== 1_000_000 ||
    config.pools.formal_aux !== 2_000_000) throw new Error('Budget amendment does not match user authorization');
const round = (v: number) => Number(v.toFixed(6));
const estimates = old.estimates.map((s: any) => {
  const historyCost = s.B_plus_C_controller_cost_per_history_usd;
  const nByCost = Math.floor(24 / (1.5 * historyCost));
  const devCost = historyCost * 47 / s.sessions + old.formal_judge_pair_assumption_usd;
  return {
    ...s,
    formal_scenario_sessions_assumption: s.sessions,
    actual_development_sessions: 47,
    dev_full_history_including_two_judges_usd: round(devCost),
    dev_fits_1_usd_before_retries: devCost <= 1,
    formal_n_by_1point5_planning_allowance: nByCost < 12 ? null : Math.min(24, nByCost),
    formal_n_rule_outcome: devCost > 1 ? 'PILOT_MAY_HALT_BEFORE_COMPLETION_NO_EXTRA_FUNDS' : nByCost < 12 ? 'STOP_IF_PILOT_RESEMBLES_THIS' : 'ESTIMATE_ONLY_FREEZE_AFTER_PILOT',
    formal_sizes: s.formal_sizes.map((row: any) => {
      const { controller_forecast_with_50_percent_allowance_fits_16_usd: _, ...retained } = row;
      return {...retained, controller_forecast_with_50_percent_allowance_fits_24_usd: 1.5 * row.formal_controllers_usd <= 24,
        formal_qa_forecast_fits_1_usd: row.formal_judges_usd <= 1};
    }),
  };
});
const artifact = {
  ...old,
  status: 'OFFLINE_ESTIMATE_PILOT_AUTHORIZED_AFTER_SIMULATIONS_FORMAL_NOT_AUTHORIZED',
  revision: 'low-budget-v2-28-usd',
  generated_by: 'src/phase4/estimate_low_budget_v2.ts',
  source_estimates: {path: oldPath, sha256: createHash('sha256').update(oldBytes).digest('hex')},
  budget_config: {path: configPath, sha256: createHash('sha256').update(configBytes).digest('hex')},
  price_snapshot_is_reused_not_live_verified: true,
  method: 'prior uncached tariff arithmetic; development adjusted to the fixed 47 sessions, formal scenarios retain 48-session assumption; no pilot observations',
  caps_usd: {total:28,development:1,formal_controllers:24,formal_judges:1,formal_failures_retries_auxiliary:2},
  no_pool_transfers: true,
  pilot_actual_invoice: null,
  formal_sample_size_frozen: null,
  estimates,
  legacy: {...old.legacy, scope:'Phase 3 main 433 controller-only decisions per method; reused, excluded from incremental Phase 4 $28 spend'},
};
await writeFile('phase4/low_budget_estimates_v2.json', JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({inference_calls:0, estimates:estimates.map((s:any)=>({scenario:s.name,dev_usd:s.dev_full_history_including_two_judges_usd,formal_n:s.formal_n_by_1point5_planning_allowance}))},null,2));
