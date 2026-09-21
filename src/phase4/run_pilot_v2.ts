import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PilotTransport,type Context} from './pilot_transport_v2.js';
import {predict} from './pilot_controllers_v2.js';
import {LongMemEvalTrajectory,verifyPinnedLongMemEval,LONGMEMEVAL_RELATIVE_PATH,type WriteSessionView} from './longmemeval_adapter.js';
import {LOCAL_MEMORY_CONFIG,extractSession,createMemoryState,ingestFact,candidates,applyDecision,answerFromState,type LocalDependencies,type MemoryState,type ExtractedFact} from './local_memory_v2.js';

const DIR='results/phase4_low_budget_v2/development';
const ID='9bbe84a2';
const MANIFEST='phase4/pilot_execution_manifest_v2.json';
const hash=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const write=(p:string,x:unknown)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const freeze=(p:string,x:unknown)=>{const s=JSON.stringify(x,null,2)+'\n';if(fs.existsSync(p)){if(fs.readFileSync(p,'utf8')!==s)throw Error('Refuse frozen overwrite: '+p);}else {fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s,{flag:'wx'});}};
const project=(state:MemoryState)=>({next_memory_id:state.next_memory_id,active:state.active.map(({embedding,...m})=>m),events:state.events.map(({embedding,...e})=>e)});
const SOURCES=['src/phase4/run_pilot_v2.ts','src/phase4/pilot_controllers_v2.ts','src/phase4/pilot_transport_v2.ts','src/phase4/local_memory_v2.ts','src/phase4/budget_guard_v2.ts','src/phase4/budget_guard_v2_test.ts','src/phase4/ledger.ts','src/phase4/longmemeval_adapter.ts','src/jev.ts','phase3/gpt56sol_protocol.json','phase4/budget_config_v2.json','phase4/low_budget_protocol_v2.json','phase4/budget_guard_v2_simulation.json','phase4/local_weights_v2.json','PHASE4_PILOT_EXECUTION_V2.md','vendor/LongMemEval/src/evaluation/evaluate_qa.py'];

function manifest(){
  const tests=JSON.parse(fs.readFileSync('phase4/budget_guard_v2_simulation.json','utf8'));
  if(!tests.passed||tests.tests.length<10||tests.tests.some((t:any)=>!t.passed))throw Error('Budget simulation gate failed');
  return {schema_version:'phase4-pilot-v2',question_id:ID,formal_authorized:false,development_cap_usd:1,
    source_hashes:Object.fromEntries(SOURCES.map(p=>[p,hash(fs.readFileSync(p))])),local:LOCAL_MEMORY_CONFIG,
    paid_models:{B:'openai/gpt-5.6-sol',C:'typesafe/jev-1.13',judge:'openai/gpt-4o-2024-08-06'},
    local_service_model_ids:{chat:'Qwen3-8B',embedding:'Qwen3-Embedding-4B'},
    paid_request_concurrency:2,local_chat_concurrency:1,retries:0,semantic_retries:0,
    ingestion:'All 47 eligible sessions chronological, no truncation; evidence archive plus arm-specific active state. Query inaccessible until ingestion completes.',
    accounting:'Local extraction once, full standalone attribution to both arms. Other local calls per-arm. Costs are API bills, not monetized hardware.',
    provider_price_caps_per_million:{B_input:2,B_output:10,C_input:0.042,C_output:0,judge_input:2.5,judge_output:10},
    reservation:'B/judge: UTF8 request bytes +8192 token formatting envelope, reject >24000; output max512/10. Jev: full32000-token provider context. Judge capacity $0.05 per arm reserved before controllers. No release of unknown charges.',
    state_error:'Invalid operation or target: log failure, unchanged active store. Local extraction/rewrite/answer failures stop pilot. No prediction repair.',
    fixed_development_only:true};
}

async function main(){
  if(!process.argv.includes('--run-authorized-pilot'))throw Error('Only --run-authorized-pilot is supported; formal execution unavailable');
  if(fs.existsSync(path.join(DIR,'outcome.json')))throw Error('Pilot has terminal outcome; no implicit restart or overwrite');
  const m=manifest();freeze(MANIFEST,m);
  const verified=await verifyPinnedLongMemEval();
  const rows=JSON.parse(fs.readFileSync(LONGMEMEVAL_RELATIVE_PATH,'utf8')) as any[];
  const ix=rows.findIndex(r=>r.question_id===ID);if(ix<0)throw Error('Fixed development sample missing');
  const source=rows[ix];const trajectory=LongMemEvalTrajectory.fromRaw(source,ix);
  if(trajectory.sessionCount!==47)throw Error('Development session count changed');
  fs.mkdirSync(DIR,{recursive:true});
  const transport=new PilotTransport(DIR,m);
  const started=Date.now();
  let localTail:Promise<unknown>=Promise.resolve();
  function deps(arm:Context['arm'],step:number):LocalDependencies {
    let chatIndex=0,embeddingIndex=0;
    return {
      chat:async req=>{
        const {stage,...body}=req;
        const mapped=stage==='rewrite'?'rewrite_joint_update':stage==='answer'?'answer_generation':'extraction';
        const ctx:Context={arm,history:ID,step,stage:mapped,name:stage+'-'+chatIndex++};
        const call=localTail.then(()=>transport.localChat(ctx,{...body,model:'Qwen3-8B'}));
        localTail=call.catch(()=>undefined);return call;
      },
      embed:texts=>transport.embed({arm,history:ID,step,stage:'embedding',name:'embedding-'+embeddingIndex++},texts),
    };
  }
  let states:{B:MemoryState;C:MemoryState}={B:createMemoryState(),C:createMemoryState()};
  const extracted:{session:WriteSessionView;facts:ExtractedFact[]}[]=[];
  let completedSteps=0;const decisions:any[]=[];
  try{
    // Local-only first pass checks full fixed source extraction. It cannot see QA.
    while(!trajectory.ingestionComplete){
      const session=trajectory.nextWriteSession()!;const si=extracted.length;
      const facts=await extractSession(session,deps('shared',si));
      extracted.push({session,facts});
      freeze(path.join(DIR,'extraction',String(si).padStart(3,'0')+'.json'),{session_index:si,session,facts});
      console.log(JSON.stringify({stage:'extraction',session:si+1,total:trajectory.sessionCount,facts:facts.length,cumulative_facts:extracted.reduce((n,x)=>n+x.facts.length,0)}));
    }
    freeze(path.join(DIR,'extraction_manifest.json'),{source:verified,question_id:ID,sessions:47,facts:extracted.reduce((n,x)=>n+x.facts.length,0),manifest_sha256:hash(fs.readFileSync(MANIFEST))});
    transport.reserveJudges();
    let step=0;
    for(let si=0;si<extracted.length;si++){
      const {session,facts}=extracted[si];
      for(let fi=0;fi<facts.length;fi++,step++){
        const fact=facts[fi];const context={session_index:si,fact_index:fi,timestamp:session.timestamp};
        // Arm calls may overlap, but all work at t settles before either arm's t+1.
        const outcomes=await Promise.allSettled((['B','C'] as const).map(async arm=>{
          const d=deps(arm,step);const before=project(states[arm]);
          states[arm]=await ingestFact(states[arm],fact,context,d);
          const selected=await candidates(states[arm],fact.text,d);
          const pred=await predict(arm,selected,fact.text,transport,{arm,history:ID,step,stage:'decision',name:'decision'});
          if(pred.valid)states[arm]=await applyDecision(states[arm],fact,pred.decision,context,d);
          const row={arm,step,context,evidence:fact,candidates:selected.map(({embedding,...v})=>v),prediction:pred,before,after:project(states[arm])};
          freeze(path.join(DIR,'steps',`${step.toString().padStart(5,'0')}-${arm}.json`),row);decisions.push({arm,step,prediction:pred});
          return {arm,operation:pred.decision.operation,valid:pred.valid,active:states[arm].active.length};
        }));
        const failure=outcomes.find(x=>x.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
        completedSteps++;
        console.log(JSON.stringify({stage:'decision',step:completedSteps,total:extracted.reduce((n,x)=>n+x.facts.length,0),arms:outcomes.map(x=>(x as PromiseFulfilledResult<unknown>).value),dev_budget:transport.guard.snapshot().pools.dev}));
      }
    }
    // No question is passed into any write, retrieval, or decision above.
    const query=trajectory.queryView();const answers:any={};const grades:any={};
    for(const arm of ['B','C'] as const){
      answers[arm]=await answerFromState(states[arm],query,deps(arm,completedSteps));
      const prompt=`I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: ${query.question}\n\nCorrect Answer: ${source.answer}\n\nModel Response: ${answers[arm].answer}\n\nIs the model response correct? Answer yes or no only.`;
      const raw=await transport.paidChat({arm,history:ID,step:completedSteps,stage:'evaluator',name:'official-qa-judge'},{model:'openai/gpt-4o-2024-08-06',max_completion_tokens:10,temperature:0,messages:[{role:'user',content:prompt}]},'development-v2-judge-'+arm);
      const content=raw.choices?.[0]?.message?.content??'';grades[arm]={raw:content,correct:/^yes\.?$/i.test(content.trim())?true:/^no\.?$/i.test(content.trim())?false:null};
    }
    freeze(path.join(DIR,'qa.json'),{query,reference_answer:source.answer,answers,grades,note:'One development history; not a quality estimate or selection criterion.'});
    write(path.join(DIR,'outcome.json'),{status:'COMPLETE',completed_steps:completedSteps,sessions:extracted.length,finished_at:new Date().toISOString(),elapsed_ms:Date.now()-started,summary:transport.summary()});
  }catch(e){
    // All concurrently dispatched B/C requests have settled or retained their hold.
    for(const arm of ['B','C']){const id='development-v2-judge-'+arm;const r=transport.guard.getReservation(id);if(r?.status==='reserved')transport.guard.cancelUnsent(id,{neverDispatched:true});}
    write(path.join(DIR,'outcome.json'),{status:'STOPPED',reason:String(e),completed_steps:completedSteps,extracted_sessions:extracted.length,extracted_facts:extracted.reduce((n,x)=>n+x.facts.length,0),finished_at:new Date().toISOString(),elapsed_ms:Date.now()-started,summary:transport.summary()});
    console.error('Pilot stopped:',String(e));process.exitCode=2;
  }finally{
    write(path.join(DIR,'final_states.json'),{B:project(states.B),C:project(states.C)});
    write(path.join(DIR,'decision_index.json'),decisions);
    transport.close();
  }
}
main().catch(e=>{console.error(String(e));process.exitCode=1;});
