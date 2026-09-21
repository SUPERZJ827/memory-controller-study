import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {LongMemEvalTrajectory,verifyPinnedLongMemEval,LONGMEMEVAL_RELATIVE_PATH} from './longmemeval_adapter.js';
import {extractSessionV3,EXTRACTION_V3_PROMPT} from './local_extractor_v3.js';
import type {LocalChatRequest} from './local_memory_v2.js';
const ID='9bbe84a2',DIR='results/phase4_low_budget_v3/extraction_repair',MANIFEST='phase4/extraction_repair_manifest_v3.json';
const sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');const write=(p:string,x:unknown)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});};
async function main(){
 if(!process.argv.includes('--run-local-extraction-repair'))throw Error('Explicit local extraction repair flag required');
 if(fs.existsSync(path.join(DIR,'outcome.json')))throw Error('Extraction repair already terminal');
 const sim=JSON.parse(fs.readFileSync('phase4/budget_guard_v2_simulation.json','utf8'));if(!sim.passed)throw Error('Budget simulations failed');
 const sourceFiles=['src/phase4/local_extractor_v3.ts','src/phase4/run_extraction_repair_v3.ts','src/phase4/longmemeval_adapter.ts','src/phase4/local_memory_v2.ts','phase4/budget_config_v2.json','phase4/budget_guard_v2_simulation.json','phase4/local_weights_v2.json'];
 const manifest={schema_version:'phase4-local-extraction-repair-v3',development_id:ID,formal_authorized:false,api_budget_same_campaign:true,prompt:EXTRACTION_V3_PROMPT,model:'Qwen3-8B',temperature:0,thinking:false,max_tokens:4096,validation:['source index is USER','support quote is nonempty normalized-verbatim substring of cited USER turn','empty facts accepted'],source_hashes:Object.fromEntries(sourceFiles.map(p=>[p,sha(p)]))};
 write(MANIFEST,manifest);await verifyPinnedLongMemEval();const rows=JSON.parse(fs.readFileSync(LONGMEMEVAL_RELATIVE_PATH,'utf8')) as any[];const ix=rows.findIndex(r=>r.question_id===ID);const trajectory=LongMemEvalTrajectory.fromRaw(rows[ix],ix);if(trajectory.sessionCount!==47)throw Error('Session count changed');
 const key=process.env.PHASE4_LOCAL_API_KEY??fs.readFileSync('src/phase2_controllers.ts','utf8').match(/process\.env\.OPENROUTER_API_KEY\s*:\s*'([^']+)'/)?.[1]??'';if(!key)throw Error('Local credential missing');
 const usage:any[]=[];let accepted=0,totalFacts=0;
 try{while(!trajectory.ingestionComplete){const session=trajectory.nextWriteSession()!,si=accepted;let last:any;
   const result=await extractSessionV3(session,{chat:async(req:LocalChatRequest)=>{const start=performance.now();const response=await fetch('http://127.0.0.1:9910/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({...req,model:'Qwen3-8B'}),signal:AbortSignal.timeout(180000)});const raw=await response.json() as any;last={request:req,response:raw,http_status:response.status,latency_ms:performance.now()-start,usage:raw.usage};if(!response.ok)throw Error('Local HTTP '+response.status);if(raw.choices?.[0]?.finish_reason==='length')throw Error('Local extraction truncated');const content=raw.choices?.[0]?.message?.content;if(typeof content!=='string')throw Error('Missing local content');return content;},embed:async()=>{throw Error('Extraction does not embed');}});
   write(path.join(DIR,'sessions',String(si).padStart(3,'0')+'.json'),{session_index:si,session,result,raw:last});usage.push(last);accepted++;totalFacts+=result.facts.length;console.log(JSON.stringify({session:accepted,total:47,facts:result.facts.length,cumulative_facts:totalFacts}));
 }
 write(path.join(DIR,'outcome.json'),{status:'COMPLETE',sessions:accepted,facts:totalFacts,paid_api_calls:0,api_cost_usd:0,local_usage:{calls:usage.length,input_tokens:usage.reduce((n,x)=>n+(x.usage?.prompt_tokens??0),0),output_tokens:usage.reduce((n,x)=>n+(x.usage?.completion_tokens??0),0),latency_ms:usage.map(x=>x.latency_ms)}});
 }catch(e){write(path.join(DIR,'outcome.json'),{status:'STOPPED',reason:String(e),sessions:accepted,facts:totalFacts,paid_api_calls:0,api_cost_usd:0});throw e;}
}
main().catch(e=>{console.error(String(e));process.exitCode=2;});
