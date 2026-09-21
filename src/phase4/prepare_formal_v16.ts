import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { BudgetGuard } from './budget_guard_v2.js';
import { verifyPinnedLongMemEval } from './longmemeval_adapter.js';

const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write = (p: string, value: unknown) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const FREEZE_HASH = '43035baddce5a2d73c658e4c8431c953d2412a4e1f7a3ade60729d4402406a1a';

async function main(): Promise<void> {
  if (!process.argv.includes('--record-explicit-authorization')) throw new Error('Explicit authorization flag required');
  if (sha('phase4/formal_freeze_v15.json') !== FREEZE_HASH) throw new Error('Formal freeze hash changed');
  const freeze = JSON.parse(fs.readFileSync('phase4/formal_freeze_v15.json', 'utf8'));
  if (freeze.n !== 24 || freeze.ids.length !== 24) throw new Error('Frozen membership changed');
  await verifyPinnedLongMemEval();
  const simulation = JSON.parse(fs.readFileSync('phase4/budget_guard_v2_simulation.json', 'utf8'));
  if (!simulation.passed || !Array.isArray(simulation.tests) || simulation.tests.length !== 11 ||
      simulation.tests.some((test: any) => !test.passed)) throw new Error('Budget simulation gate failed');
  const config = JSON.parse(fs.readFileSync('phase4/budget_config_v2.json', 'utf8'));
  const guard = new BudgetGuard('results/phase4_low_budget_v2/campaign_budget.sqlite', config);
  const snapshot = guard.snapshot();
  guard.close();
  if (snapshot.halted || snapshot.pools.formal_controllers.settledMicroUsd ||
      snapshot.pools.formal_controllers.heldMicroUsd || snapshot.pools.formal_qa.settledMicroUsd ||
      snapshot.pools.formal_qa.heldMicroUsd || snapshot.pools.formal_aux.settledMicroUsd ||
      snapshot.pools.formal_aux.heldMicroUsd) throw new Error('Formal pools are not pristine');
  const sources = [
    'src/phase4/run_formal_v16.ts', 'src/phase4/formal_transport_v16.ts',
    'src/phase4/formal_predict_v16.ts', 'src/phase4/local_extractor_v14.ts',
    'src/phase4/local_memory_v2.ts', 'src/phase4/longmemeval_adapter.ts',
    'src/phase4/budget_guard_v2.ts', 'src/phase4/ledger.ts', 'src/jev.ts',
    'phase3/gpt56sol_protocol.json', 'phase4/formal_freeze_v15.json',
    'phase4/budget_config_v2.json', 'phase4/budget_guard_v2_simulation.json',
    'phase4/local_weights_v2.json',
  ];
  write('phase4/formal_run_authorization_v17.json', {
    schema_version: 'phase4-formal-run-authorization-v17',
    authorized: true,
    authorization_scope: 'Exactly the frozen 24-history B/C formal run and official paired QA judging',
    authorization_received_date: '2026-09-20',
    no_scope_expansion: true,
    freeze_sha256: FREEZE_HASH,
    n: 24,
    ids: freeze.ids.map((x: any) => x.question_id),
    budgets_micro_usd: config,
    pre_dispatch_budget_snapshot: snapshot,
    paid_concurrency_limit: 2,
    semantic_retries: 0,
    paid_transport_retries_automatic: 0,
    local_transport_max_attempts: 2,
    implementation_revision: 'v17 removes an undefined response_format property before canonical request hashing; no prompt, data, model, budget, or scoring change',
    supersedes_zero_call_start: 'phase4/formal_run_authorization_v16.json',
    source_hashes: Object.fromEntries(sources.map((p) => [p, sha(p)])),
  });
  console.log(JSON.stringify({status: 'AUTHORIZED_AND_FROZEN', n: 24,
    freeze_sha256: FREEZE_HASH, budget: snapshot}, null, 2));
}
main().catch((error) => { console.error(String(error)); process.exitCode = 1; });
