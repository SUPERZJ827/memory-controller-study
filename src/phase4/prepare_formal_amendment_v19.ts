import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {BudgetGuard} from './budget_guard_v2.js';

const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write = (p: string, x: unknown) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n', {flag: 'wx'});

function main(): void {
  const status = JSON.parse(fs.readFileSync('results/phase4_formal_v17/status.json', 'utf8'));
  if (status.status !== 'STOPPED' || status.histories_completed !== 0 ||
      !String(status.error).includes('Unterminated string in JSON')) throw new Error('Unexpected writer stop');
  const ledger = new DatabaseSync('results/phase4_formal_v17/ledger.sqlite', {readOnly: true});
  const paid = ledger.prepare("select count(*) n,coalesce(sum(actual_physical_cost_usd),0) cost,max(step_index) max_step from call_attempts where provider='OpenRouter' and status='success'").get() as any;
  const malformed = ledger.prepare("select scope,response_json from call_attempts where stage='rewrite_joint_update' and trajectory_id='89941a94' and step_index=135 and status='success' order by scope").all() as any[];
  ledger.close();
  if (paid.n !== 277 || paid.max_step !== 135 || malformed.length !== 2) throw new Error('Unexpected paid/writer evidence');
  const contents = malformed.map((x) => JSON.parse(x.response_json).choices?.[0]?.message?.content);
  if (contents.some((x) => typeof x !== 'string' || !x.includes('</think>'))) throw new Error('Writer failure signature changed');
  const config = JSON.parse(fs.readFileSync('phase4/budget_config_v2.json', 'utf8'));
  const guard = new BudgetGuard('results/phase4_low_budget_v2/campaign_budget.sqlite', config);
  const budget = guard.snapshot();
  guard.close();
  if (budget.pools.formal_controllers.unknownMicroUsd || budget.pools.formal_controllers.heldMicroUsd ||
      budget.pools.formal_qa.settledMicroUsd || budget.pools.formal_aux.settledMicroUsd) {
    throw new Error('Unexpected budget state before writer amendment');
  }
  write('phase4/formal_runtime_amendment_v19.json', {
    schema: 'phase4-formal-runtime-amendment-v19',
    scope: 'uniform executor failure semantics required to finish the already-started system experiment',
    post_start: true,
    disclosure_required: true,
    base_authorization: 'phase4/formal_run_authorization_v17.json',
    base_authorization_sha256: sha('phase4/formal_run_authorization_v17.json'),
    supersedes: 'phase4/formal_runtime_amendment_v18.json',
    supersedes_sha256: sha('phase4/formal_runtime_amendment_v18.json'),
    prior_status_sha256: sha('results/phase4_formal_v17/status.json'),
    evidence: {histories_completed: 0, successful_paid_calls: paid.n,
      successful_paid_cost_usd: paid.cost, max_completed_controller_step: paid.max_step,
      failed_stage: 'shared local writer', affected_arms: ['B','C'], same_malformed_output: contents[0] === contents[1],
      held_usd: 0, unknown_usd: 0},
    change: 'After a valid controller prediction, if the common local applyDecision writer or its content embedding throws, record execution_error and preserve the post-ingest/pre-mutation state. Do not retry, repair, or reinterpret the controller prediction or writer output.',
    unchanged: ['completed controller predictions', 'sample membership/order', 'controller prompts/models',
      'writer prompt/model', 'retrieval', 'QA scoring', 'budgets', 'no semantic retry'],
    interpretation: 'This is a disclosed full-system reliability failure and must not be counted as a successful mutation.',
    revised_runner_sha256: sha('src/phase4/run_formal_v16.ts'),
  });
  console.log(JSON.stringify({status: 'POST_START_EXECUTOR_FAILURE_RULE_RECORDED', paid}, null, 2));
}
main();
