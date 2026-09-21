import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {BudgetGuard} from './budget_guard_v2.js';

const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write = (p: string, x: unknown) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n', {flag: 'wx'});

function main(): void {
  const status = JSON.parse(fs.readFileSync('results/phase4_formal_v17/status.json', 'utf8'));
  if (status.status !== 'STOPPED' || status.histories_completed !== 0 || status.error !== 'Error: Truncated') {
    throw new Error('Unexpected v17 stop condition');
  }
  const ledger = new DatabaseSync('results/phase4_formal_v17/ledger.sqlite', {readOnly: true});
  const calls = ledger.prepare('select provider,status,actual_physical_cost_usd from call_attempts').all() as any[];
  ledger.close();
  if (!calls.length || calls.some((x) => x.provider !== 'local-vLLM' || x.status !== 'success' || x.actual_physical_cost_usd !== 0)) {
    throw new Error('Predictions or paid calls exist before amendment');
  }
  const config = JSON.parse(fs.readFileSync('phase4/budget_config_v2.json', 'utf8'));
  const guard = new BudgetGuard('results/phase4_low_budget_v2/campaign_budget.sqlite', config);
  const budget = guard.snapshot();
  guard.close();
  for (const pool of ['formal_controllers', 'formal_qa', 'formal_aux'] as const) {
    if (budget.pools[pool].settledMicroUsd || budget.pools[pool].heldMicroUsd || budget.pools[pool].unknownMicroUsd) {
      throw new Error('Formal budget changed before amendment: ' + pool);
    }
  }
  write('phase4/formal_runtime_amendment_v18.json', {
    schema: 'phase4-formal-runtime-amendment-v18',
    scope: 'implementation reliability only before any formal prediction',
    base_authorization: 'phase4/formal_run_authorization_v17.json',
    base_authorization_sha256: sha('phase4/formal_run_authorization_v17.json'),
    prior_status_sha256: sha('results/phase4_formal_v17/status.json'),
    evidence: {histories_completed: 0, paid_calls: 0, formal_spend_usd: 0,
      local_successful_calls: calls.length, stopped_error: status.error},
    change: 'For an extraction request containing exactly one immutable USER fragment, retry the exact same local request once only when the first response finish_reason is length. Batch truncation still uses the frozen deterministic split; a second singleton truncation still stops.',
    unchanged: ['sample membership and order', 'extractor prompt', 'local model and temperature',
      'fact text immutability', 'controller protocols', 'scoring', 'budgets', 'paid concurrency'],
    revised_runner_sha256: sha('src/phase4/run_formal_v16.ts'),
  });
  console.log(JSON.stringify({status: 'AMENDED_BEFORE_PREDICTIONS', local_calls: calls.length,
    formal_spend_usd: 0}, null, 2));
}
main();
