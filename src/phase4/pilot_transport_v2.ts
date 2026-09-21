import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { BudgetGuard } from './budget_guard_v2.js';
import { Phase4Ledger } from './ledger.js';
import { makeCallKey, hashJson } from './hash.js';
import type { JsonValue, Phase4Stage } from './types.js';

dotenv.config({path:'.env.local',quiet:true});
export interface Context {arm:'B'|'C'|'shared';history:string;step:number;stage:Phase4Stage;name:string}
export interface RawCall {id:string;context:Context;model:string;request:unknown;response:any;usage:{input_tokens:number;output_tokens:number;reasoning_tokens:number;cached_input_tokens:number;cost_usd:number|null};latency_ms:number;paid:boolean;cache_hit?:boolean;http_status?:number;error?:string;reservation_micro_usd?:number}
const safe=(s:string)=>s.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]');
const tokenUsage=(raw:any)=>({input_tokens:raw.usage?.input_tokens??raw.usage?.prompt_tokens??0,output_tokens:raw.usage?.output_tokens??raw.usage?.completion_tokens??0,reasoning_tokens:raw.usage?.completion_tokens_details?.reasoning_tokens??0,cached_input_tokens:raw.usage?.prompt_tokens_details?.cached_tokens??0,cost_usd:typeof raw.usage?.cost==='number'?raw.usage.cost:null});

// Pure request builders are shared by live transport and zero-network simulations.
export function boundedChatRequest(body:any):{request:any;upperMicroUsd:number}{
  if(!['openai/gpt-5.6-sol','openai/gpt-4o-2024-08-06'].includes(body.model))throw Error('Model has no frozen price ceiling');
  if(!Number.isSafeInteger(body.max_completion_tokens)||body.max_completion_tokens<=0||body.max_completion_tokens>512)throw Error('Output budget must be integer 1..512');
  if(body.n!==undefined&&body.n!==1)throw Error('Multiple completions are not covered by the budget bound');
  if(body.stream||body.tools||body.plugins||body.audio||body.modalities)throw Error('Unsupported billable request feature');
  if(!Array.isArray(body.messages)||body.messages.some((m:any)=>typeof m.content!=='string'))throw Error('Only text messages have a price bound');
  const priceIn=body.model==='openai/gpt-4o-2024-08-06'?2.5:2;
  const request={...body,provider:{only:['OpenAI'],allow_fallbacks:false,require_parameters:true,max_price:{prompt:String(priceIn),completion:'10',request:'0'}}};
  const inputBound=Buffer.byteLength(JSON.stringify(request),'utf8')+8192;
  if(inputBound>24000)throw Error('Prompt exceeds frozen 24000-token conservative envelope');
  return {request,upperMicroUsd:Math.ceil(inputBound*priceIn+body.max_completion_tokens*10)};
}

export function boundedDecisionRequest(body:any):{request:any;upperMicroUsd:number}{
  if(body.model!=='typesafe/jev-1.13')throw Error('Decision model has no frozen price ceiling');
  const request={...body,provider:{only:['TypeSafe'],allow_fallbacks:false,max_price:{prompt:'0.042',completion:'0',request:'0'}}};
  const inputBound=Buffer.byteLength(JSON.stringify(request),'utf8')+8192;
  if(inputBound>32000)throw Error('Decision input exceeds reserved 32000-token envelope');
  return {request,upperMicroUsd:1344};
}

export class PilotTransport {
  readonly guard:BudgetGuard;
  readonly ledger:Phase4Ledger;
  readonly calls:RawCall[]=[];
  private localKey:string;
  constructor(readonly dir:string,readonly manifest:any){
    fs.mkdirSync(path.join(dir,'calls'),{recursive:true});
    const cfg=JSON.parse(fs.readFileSync('phase4/budget_config_v2.json','utf8'));
    this.guard=new BudgetGuard('results/phase4_low_budget_v2/campaign_budget.sqlite',cfg);
    this.ledger=new Phase4Ledger(path.join(dir,'ledger.sqlite'),'development-9bbe84a2-v2',manifest);
    // Reuse the already configured local service credential without logging it.
    this.localKey=process.env.PHASE4_LOCAL_API_KEY??fs.readFileSync('src/phase2_controllers.ts','utf8').match(/process\.env\.OPENROUTER_API_KEY\s*:\s*'([^']+)'/)?.[1]??'';
    if(!this.localKey)throw Error('Local service credential missing');
  }
  private persist(call:RawCall){
    const p=path.join(this.dir,'calls',call.id+'.json');
    fs.writeFileSync(p+'.tmp',JSON.stringify(call,null,2)+'\n');fs.renameSync(p+'.tmp',p);
    this.calls.push(call);
  }
  private async request(ctx:Context,body:any,url:string,paid:boolean,upperMicroUsd=0,reservedId?:string):Promise<any>{
    const requestHash=hashJson(body);
    const identity={manifestHash:this.ledger.manifestHash,stage:ctx.stage,scope:ctx.arm,trajectoryId:ctx.history,stepIndex:ctx.step,logicalCallId:ctx.name,request:body};
    const key=makeCallKey(identity);
    const file=path.join(this.dir,'calls',key+'.json');
    const previous=this.ledger.getSuccessfulAttempt(key);
    if(previous){
      if(!fs.existsSync(file))throw Error('Successful ledger call missing durable raw output: '+key);
      const saved=JSON.parse(fs.readFileSync(file,'utf8')) as RawCall;
      this.calls.push({...saved,cache_hit:true});return saved.response;
    }
    // All callers go through this path; no SDK/HTTP implicit retries.
    const rid=reservedId??key;
    if(paid){
      if(reservedId){
        const existing=this.guard.getReservation(rid);
        if(!existing||existing.pool!=='dev'||existing.status!=='reserved'||existing.upperMicroUsd<upperMicroUsd)throw Error('Missing or insufficient unspent development judge reservation');
        if(body.model!=='openai/gpt-4o-2024-08-06'||rid!=='development-v2-judge-'+ctx.arm)throw Error('Prepaid judge reservation cannot fund another call');
      }
      else this.guard.reserve({id:rid,pool:'dev',upperMicroUsd,requestHash});
    }
    const handle=this.ledger.beginAttempt({callKey:key,stage:ctx.stage,scope:ctx.arm,trajectoryId:ctx.history,stepIndex:ctx.step,logicalCallId:ctx.name,requestHash,request:body,model:body.model,provider:paid?'OpenRouter':'local-vLLM'});
    if(paid)this.guard.markDispatched(rid);
    const started=performance.now();let response:Response;let raw:any;
    try{
      response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+(paid?process.env.OPENROUTER_API_KEY:this.localKey),'Content-Type':'application/json',...(paid?{'X-Title':'Jev Memory Phase4 budgeted development'}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(paid?90000:180000)});
      const content=await response.text();try{raw=JSON.parse(content);}catch{raw={unparsed_body:content};}
    }catch(e){
      const msg=safe(String(e));if(paid)this.guard.markUnknown(rid);
      this.ledger.failAttempt({...handle,latencyMs:performance.now()-started,errorKind:'transport_unknown_billing',errorMessage:msg});
      this.persist({id:key,context:ctx,model:body.model,request:body,response:null,usage:{input_tokens:0,output_tokens:0,reasoning_tokens:0,cached_input_tokens:0,cost_usd:paid?null:0},latency_ms:performance.now()-started,paid,error:msg,reservation_micro_usd:upperMicroUsd});
      throw Error(msg);
    }
    const usage=tokenUsage(raw);if(!paid)usage.cost_usd=0;
    const record:RawCall={id:key,context:ctx,model:body.model,request:body,response:raw,usage,latency_ms:performance.now()-started,paid,http_status:response.status,reservation_micro_usd:upperMicroUsd};
    this.persist(record); // Durable raw response BEFORE cost reconciliation.
    if(paid){
      if(usage.cost_usd===null)this.guard.markUnknown(rid);
      else this.guard.settle(rid,Math.ceil(usage.cost_usd*1e6-1e-9));
    }
    const attribution=(ctx.arm==='shared'?['B','C']:[ctx.arm]).map(armId=>({armId,standaloneCostUsd:usage.cost_usd??0,inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,reasoningTokens:usage.reasoning_tokens,cachedInputTokens:usage.cached_input_tokens,note:paid?'Provider invoice; unresolved costs additionally held in campaign guard':'Local work: zero API charge, hardware cost unmonetized'}));
    if(!response.ok){this.ledger.failAttempt({...handle,latencyMs:record.latency_ms,errorKind:'http_error',errorMessage:'HTTP '+response.status,usage:{inputTokens:usage.input_tokens,outputTokens:usage.output_tokens},actualPhysicalCostUsd:usage.cost_usd??0,providerMetadata:raw,attributions:attribution});throw Error('HTTP '+response.status+'; see raw '+key);}
    this.ledger.completeAttempt({...handle,latencyMs:record.latency_ms,usage:{inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,reasoningTokens:usage.reasoning_tokens,cachedInputTokens:usage.cached_input_tokens},actualPhysicalCostUsd:usage.cost_usd??0,response:raw,providerMetadata:{id:raw.id??null,provider:raw.provider??null,billing_known:usage.cost_usd!==null},attributions:attribution});
    return raw;
  }
  async localChat(ctx:Context,body:any):Promise<string>{
    const raw=await this.request(ctx,body,'http://127.0.0.1:9910/v1/chat/completions',false);
    if(raw.choices?.[0]?.finish_reason==='length')throw Error('Local output truncated; no silent partial extraction');
    const content=raw.choices?.[0]?.message?.content;if(typeof content!=='string')throw Error('Missing local chat content');return content;
  }
  async embed(ctx:Context,texts:string[]):Promise<number[][]>{
    const raw=await this.request(ctx,{model:'Qwen3-Embedding-4B',input:texts},'http://127.0.0.1:9010/v1/embeddings',false);
    if(!Array.isArray(raw.data)||raw.data.length!==texts.length)throw Error('Embedding shape mismatch');
    return raw.data.sort((a:any,b:any)=>a.index-b.index).map((x:any)=>x.embedding);
  }
  async paidChat(ctx:Context,body:any,judgeReservation?:string):Promise<any>{
    // UTF-8 bytes upper-bound text tokenization; include full schema/request and
    // an 8192-token envelope for provider formatting. Reject long requests before
    // pricing tiers/context boundaries; reservation is not a chars/4 estimate.
    const {request,upperMicroUsd:reserve}=boundedChatRequest(body);
    if(judgeReservation&&reserve>50000)throw Error('Judge exceeds pre-reserved $0.05');
    return this.request(ctx,request,'https://openrouter.ai/api/v1/chat/completions',true,judgeReservation?50000:reserve,judgeReservation);
  }
  async paidDecision(ctx:Context,body:any):Promise<any>{
    const {request,upperMicroUsd}=boundedDecisionRequest(body);
    return this.request(ctx,request,'https://openrouter.ai/api/alpha/decisions',true,upperMicroUsd);
  }
  reserveJudges(){
    for(const arm of ['B','C']){const id='development-v2-judge-'+arm;if(!this.guard.getReservation(id))this.guard.reserve({id,pool:'dev',upperMicroUsd:50000,requestHash:createHash('sha256').update('fixed official judge '+arm).digest('hex')});}
  }
  summary(){return {budget:this.guard.snapshot(),ledger:this.ledger.summarizeCosts(),calls:this.calls.length};}
  close(){this.ledger.close();this.guard.close();}
}
