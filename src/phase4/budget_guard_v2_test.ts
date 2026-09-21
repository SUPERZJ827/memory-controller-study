import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { BudgetGuard, PHASE4_BUDGET_V2, type BudgetConfig } from "./budget_guard_v2.js";
import { boundedChatRequest, boundedDecisionRequest } from "./pilot_transport_v2.js";

const root = process.argv.includes("--worker") ? "" : mkdtempSync(join(tmpdir(),"phase4-budget-v2-"));
const tests: {name:string;passed:boolean}[] = [];
const config = (total=10, dev=10): BudgetConfig => ({campaignId:"simulation-only",totalMicroUsd:total,
  pools:{dev,formal_controllers:10,formal_qa:10,formal_aux:10}});
const request = (id:string, upperMicroUsd:number) => ({id,pool:"dev" as const,upperMicroUsd,requestHash:`hash-${id}`});
function test(name:string,run:()=>void):void { run(); tests.push({name,passed:true}); }

if (process.argv.includes("--worker")) {
  const guard = new BudgetGuard(process.argv[3],config(7,7));
  for(let n=0;n<20;n++) {
    const id=`worker-${process.argv[4]}-${n}`;
    try { guard.reserve(request(id,1)); guard.markDispatched(id); }
    catch(error) { if (!String(error).includes("exhausted")) throw error; }
  }
  guard.close();
} else {
  test("Production allocation is $28 total and $1/$24/$1/$2 immutable pools",()=>{
    assert.deepEqual(PHASE4_BUDGET_V2,JSON.parse(readFileSync('phase4/budget_config_v2.json','utf8')));
    assert.equal(PHASE4_BUDGET_V2.totalMicroUsd,28_000_000);
    assert.deepEqual(PHASE4_BUDGET_V2.pools,{dev:1_000_000,formal_controllers:24_000_000,formal_qa:1_000_000,formal_aux:2_000_000});
    const g=new BudgetGuard(join(root,"production.sqlite"),PHASE4_BUDGET_V2);
    g.reserve(request("dev-max",1_000_000));
    assert.throws(()=>g.reserve(request("dev-over",1)),/pool exhausted/);
    assert.equal(g.snapshot().total.availableMicroUsd,27_000_000);g.close();
  });
  test("Transport uses text-byte input upper envelope, bounded output and frozen maximum prices",()=>{
    const body={model:'openai/gpt-5.6-sol',messages:[{role:'user',content:'Question'}],max_completion_tokens:512};
    const chat=boundedChatRequest(body);
    assert.equal(chat.upperMicroUsd,(Buffer.byteLength(JSON.stringify(chat.request),'utf8')+8192)*2+5120);
    assert.equal(chat.request.provider.allow_fallbacks,false);
    assert.deepEqual(chat.request.provider.max_price,{prompt:'2',completion:'10',request:'0'});
    assert.throws(()=>boundedChatRequest({...body,max_completion_tokens:513}),/Output budget/);
    assert.throws(()=>boundedChatRequest({...body,messages:[{role:'user',content:'x'.repeat(24000)}]}),/envelope/);
    assert.throws(()=>boundedChatRequest({...body,n:2}),/Multiple completions/);
    assert.throws(()=>boundedChatRequest({...body,model:'unpriced/model'}),/price ceiling/);
    assert.throws(()=>boundedChatRequest({...body,messages:[{role:'user',content:[{type:'image_url'}]}]}),/Only text/);
    const decision=boundedDecisionRequest({model:'typesafe/jev-1.13',state:{fact:'small'},questions:{}});
    assert.equal(decision.upperMicroUsd,1344);
    assert.throws(()=>boundedDecisionRequest({model:'typesafe/jev-1.13',state:{fact:'x'.repeat(32000)}}),/envelope/);
  });
  test("Exact boundary accepted; +1 microUSD denied; unknown request consumes reservation",()=>{
    const g=new BudgetGuard(join(root,"boundary.sqlite"),config());
    g.reserve(request("a",10));g.markDispatched("a");g.markUnknown("a");
    assert.equal(g.snapshot().total.unknownMicroUsd,10);
    assert.throws(()=>g.reserve(request("b",1)),/exhausted/);g.close();
  });
  test("Global cap enforced separately from pool limits",()=>{
    const g=new BudgetGuard(join(root,"global.sqlite"),config(10,10));
    g.reserve(request("a",6));
    assert.throws(()=>g.reserve({...request("b",5),pool:"formal_controllers"}),/Global budget exhausted/);
    g.reserve({...request("b",4),pool:"formal_controllers"});assert.equal(g.snapshot().total.availableMicroUsd,0);g.close();
  });
  test("Unknown and dispatched holds survive close/reopen; config cannot change",()=>{
    const path=join(root,"restart.sqlite");let g=new BudgetGuard(path,config());
    g.reserve(request("a",4));g.markDispatched("a");g.markUnknown("a");
    g.reserve(request("b",3));g.markDispatched("b");g.close();
    g=new BudgetGuard(path,config());assert.equal(g.snapshot().total.heldMicroUsd,7);
    assert.equal(g.getReservation("a")?.status,"unknown");g.close();
    assert.throws(()=>new BudgetGuard(path,config(11)),/immutable/);
    assert.throws(()=>new BudgetGuard(path,{...config(),campaignId:"reset-bypass"}),/immutable/);
    g=new BudgetGuard(path,config());assert.equal(g.snapshot().total.heldMicroUsd,7);g.close();
  });
  test("Only known invoice releases excess; duplicate settlement cannot change bill",()=>{
    const g=new BudgetGuard(join(root,"settle.sqlite"),config());
    g.reserve(request("a",10));g.markDispatched("a");g.markUnknown("a");g.settle("a",3);
    assert.equal(g.snapshot().total.availableMicroUsd,7);g.settle("a",3);
    assert.throws(()=>g.settle("a",0),/Conflicting invoice/);
    g.reserve(request("b",7));assert.equal(g.snapshot().total.committedMicroUsd,10);g.close();
  });
  test("Duplicate reserve and duplicate dispatch prohibited, retry has independent hold",()=>{
    const g=new BudgetGuard(join(root,"duplicates.sqlite"),config());
    g.reserve(request("a",4));assert.throws(()=>g.reserve(request("a",4)),/Duplicate/);
    g.markDispatched("a");assert.throws(()=>g.markDispatched("a"),/Cannot dispatch/);g.markUnknown("a");
    assert.throws(()=>g.markDispatched("a"),/Cannot dispatch/);
    g.reserve({...request("a-retry-1",4),requestHash:"hash-a"});g.markDispatched("a-retry-1");
    assert.equal(g.snapshot().total.heldMicroUsd,8);g.close();
  });
  test("Cannot cancel dispatched/unknown; unsent cancellation needs explicit attestation",()=>{
    const g=new BudgetGuard(join(root,"cancel.sqlite"),config());
    g.reserve(request("a",5));g.markDispatched("a");
    assert.throws(()=>g.cancelUnsent("a",{neverDispatched:true}),/Cannot release/);
    g.markUnknown("a");assert.throws(()=>g.cancelUnsent("a",{neverDispatched:true}),/Cannot release/);
    g.reserve(request("b",5));
    assert.throws(()=>g.cancelUnsent("b",undefined as never),/Explicit/);
    assert.throws(()=>g.settle("b",0),/Cannot settle reserved/);
    g.cancelUnsent("b",{neverDispatched:true});assert.equal(g.snapshot().total.heldMicroUsd,5);
    assert.throws(()=>g.reserve(request("b",5)),/Duplicate/);g.close();
  });
  test("Over-bound invoice is committed and campaign remains halted after restart",()=>{
    const path=join(root,"violation.sqlite");let g=new BudgetGuard(path,config());
    g.reserve(request("a",4));g.markDispatched("a");g.reserve(request("b",1));
    assert.throws(()=>g.settle("a",5),/violation/);
    assert.equal(g.getReservation("a")?.actualMicroUsd,5);assert.equal(g.snapshot().halted,true);
    assert.throws(()=>g.reserve(request("c",1)),/halted/);assert.throws(()=>g.markDispatched("b"),/halted/);g.close();
    g=new BudgetGuard(path,config());assert.equal(g.snapshot().halted,true);assert.equal(g.snapshot().total.committedMicroUsd,6);g.close();
  });
  test("Unsafe integer, negative, fractional and NaN amounts rejected",()=>{
    const g=new BudgetGuard(join(root,"invalid.sqlite"),config());
    for(const n of [-1,.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>g.reserve(request(`bad-${n}`,n)),/integer microUSD/);
    assert.equal(g.snapshot().reservations.length,0);g.close();
  });
  const concurrentPath=join(root,"concurrent.sqlite");new BudgetGuard(concurrentPath,config(7,7)).close();
  const children=Array.from({length:12},(_,n)=>new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,["--import","tsx",fileURLToPath(import.meta.url),"--worker",concurrentPath,String(n)],{stdio:["ignore","pipe","pipe"]});
    let stderr="";child.stderr.on("data",data=>{stderr+=String(data);});
    child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(`worker ${n} exit ${code}: ${stderr}`)));
  }));
  await Promise.all(children);
  test("12 OS processes / 240 attempts cannot over-reserve or lose holds",()=>{
    const g=new BudgetGuard(concurrentPath,config(7,7));const s=g.snapshot();
    assert.equal(s.total.committedMicroUsd,7);assert.equal(s.reservations.length,7);
    assert.equal(s.reservations.filter(row=>row.status==="dispatched").length,7);g.close();
  });
  const report={schema:"phase4-budget-guard-v2-simulation",passed:true,paidCalls:0,apiCostUsd:0,
    finishedAt:new Date().toISOString(),tests};
  const reportIndex=process.argv.indexOf("--report");
  if(reportIndex>=0) writeFileSync(process.argv[reportIndex+1],JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}
