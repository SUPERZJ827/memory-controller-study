/** Offline reconciliation only. Never invokes a model or transport. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {extractSession} from './local_memory_v2.js';

const dir='results/phase4_low_budget_v2/development';
const sha=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write=(file:string,obj:unknown)=>fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{flag:'wx'});
const outcome=JSON.parse(fs.readFileSync(path.join(dir,'outcome.json'),'utf8'));
const files=fs.readdirSync(path.join(dir,'calls')).filter(f=>f.endsWith('.json')).sort();
const calls=files.map(f=>JSON.parse(fs.readFileSync(path.join(dir,'calls',f),'utf8')));
const manifest=JSON.parse(fs.readFileSync('phase4/pilot_execution_manifest_v2.json','utf8'));
const frozenChecks=Object.entries(manifest.source_hashes).map(([file,expected])=>({file,expected,actual:sha(file),matches:sha(file)===expected}));
if(frozenChecks.some(x=>!x.matches))throw Error('Frozen pilot source changed');
const paid=calls.filter(c=>c.paid);
const unknown=paid.filter(c=>c.usage.cost_usd===null);
const latency=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);return s.length?{mean_ms:s.reduce((x,y)=>x+y,0)/s.length,median_ms:s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2,p90_ms:s[Math.ceil(s.length*.9)-1]}:null;};
const usage=(rows:any[])=>({calls:rows.length,input_tokens:rows.reduce((n,c)=>n+c.usage.input_tokens,0),output_tokens:rows.reduce((n,c)=>n+c.usage.output_tokens,0),reasoning_tokens:rows.reduce((n,c)=>n+c.usage.reasoning_tokens,0),api_cost_usd:rows.reduce((n,c)=>n+(c.usage.cost_usd??0),0),unknown_bill_calls:rows.filter(c=>c.paid&&c.usage.cost_usd===null).length,latency:latency(rows.map(c=>c.latency_ms))});
const byStage=Object.fromEntries([...new Set(calls.map(c=>c.context.stage))].map(stage=>[stage,usage(calls.filter(c=>c.context.stage===stage))]));
const first=calls[0];const session=JSON.parse(first.request.messages[1].content);
let replayError:string|null=null;
try{
  await extractSession(session,{chat:async()=>first.response.choices[0].message.content,embed:async()=>{throw Error('Offline validation must not embed');}});
}catch(e){replayError=String(e);}
const summary={
  schema:'phase4-pilot-v2-offline-reconciliation',status:outcome.status,reason:outcome.reason,
  development_id:'9bbe84a2',source_sessions_required:47,source_sessions_attempted:calls.filter(c=>c.context.stage==='extraction').length,source_sessions_accepted:outcome.extracted_sessions??outcome.sessions,
  completed_BC_steps:outcome.completed_steps,paid_requests:paid.length,exact_known_API_invoice_usd:paid.reduce((n,c)=>n+(c.usage.cost_usd??0),0),unknown_bills:unknown.length,
  budget:outcome.summary.budget,physical_usage:usage(calls),standalone_usage:{B:usage(calls.filter(c=>['shared','B'].includes(c.context.arm))),C:usage(calls.filter(c=>['shared','C'].includes(c.context.arm)))},by_stage:byStage,
  local_hardware_cost_usd:null,local_hardware_cost_note:'Unmonetized local compute, not free-system-cost claim.',
  raw_HTTP_success_is_not_semantic_success:true,offline_replay:{api_calls:0,error:replayError,reproduces_failure:replayError===outcome.reason},
  frozen_source_checks:frozenChecks,
  formal_recommendation:{status:'HOLD_IMPLEMENTATION_GATE',recommended_n:null,permitted_range:[12,24],formal_sample_ids_frozen:false,reason:'No complete pilot and no B/C billed controller decision; cost-only scale selection is not possible from these measurements. Do not substitute prior scenario estimates for observations.',formal_calls:0},
  no_sample_replacement:true,no_prompt_repair_or_retry:true,no_other_pool_used:true,
};
write(path.join(dir,'reconciled_summary.json'),summary);
const csv=['scope,calls,input_tokens,output_tokens,reasoning_tokens,api_cost_usd,median_latency_ms,local_hardware_cost'];
for(const [scope,u] of Object.entries({physical:summary.physical_usage,B_standalone:summary.standalone_usage.B,C_standalone:summary.standalone_usage.C}))csv.push([scope,u.calls,u.input_tokens,u.output_tokens,u.reasoning_tokens,u.api_cost_usd,u.latency?.median_ms??'','unmonetized'].join(','));
fs.writeFileSync(path.join(dir,'usage.csv'),csv.join('\n')+'\n',{flag:'wx'});
write('phase4/formal_readiness_v2.json',{schema:'phase4-formal-readiness-v2',status:'NOT_READY',development_result:path.join(dir,'reconciled_summary.json'),development_result_sha256:sha(path.join(dir,'reconciled_summary.json')),formal_authorized:false,n:null,ids:null,permitted_n:[12,24],selection_seed:'phase4-low-budget-test-v1',budget_usd:{campaign:28,development:1,formal_controllers:24,formal_QA:1,formal_auxiliary:2},blocker:'Local extraction rejected assistant-sourced non-autobiographical facts at first fixed session; no full-history cost measurement available.',next_scope:'Repair/check existing local extraction on the SAME development history under unchanged cumulative $1 development pool; no automatic invocation, new model, new method, extra task, or funds.'});
console.log(JSON.stringify({paid_requests:summary.paid_requests,api_usd:summary.exact_known_API_invoice_usd,formal:summary.formal_recommendation,offline_replay:summary.offline_replay},null,2));
