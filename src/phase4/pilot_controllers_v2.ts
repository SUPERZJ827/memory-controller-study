import fs from 'node:fs';
import {OPERATION_CRITERIA,OPERATION_INSTRUCTIONS,MODEL} from '../jev.js';
import {PilotTransport,type Context} from './pilot_transport_v2.js';
import type {MemoryDecision,MemoryRecord} from './local_memory_v2.js';

const protocol=JSON.parse(fs.readFileSync('phase3/gpt56sol_protocol.json','utf8'));
export interface Prediction {decision:MemoryDecision;valid:boolean;error:string|null;probabilities:unknown;call_ids:string[]}
export async function predict(arm:'B'|'C',memories:MemoryRecord[],evidence:string,transport:PilotTransport,ctx:Context):Promise<Prediction>{
  const existingMemories=memories.map(({id,content})=>({id,content}));
  const start=transport.calls.length;
  let operation:string='INVALID',target='NONE',probabilities:unknown=null,error:string|null=null;
  if(arm==='B'){
    const response_format=structuredClone(protocol.response_format);
    delete response_format.json_schema.schema.properties.target.enum_template;
    response_format.json_schema.schema.properties.target.enum=['NONE',...existingMemories.map(m=>m.id)];
    const raw=await transport.paidChat({...ctx,name:'gpt-decision'},{model:protocol.model,reasoning:protocol.reasoning,max_completion_tokens:protocol.max_completion_tokens,
      messages:[{role:'system',content:protocol.system_prompt},{role:'user',content:JSON.stringify({current_valid_memory_state:existingMemories,current_evidence:evidence,candidate_memory_ids:existingMemories.map(m=>m.id)})}],response_format});
    try{
      const obj=JSON.parse(raw.choices?.[0]?.message?.content??'');
      if(Object.keys(obj).sort().join(',')!=='operation,target')throw Error('Unexpected JSON fields');
      operation=obj.operation;target=obj.target;
      if(raw.choices?.[0]?.finish_reason==='length')throw Error('Truncated controller output');
    }catch(e){error=String(e);}
  }else{
    const raw=await transport.paidDecision({...ctx,name:'jev-operation'},{model:MODEL,state:{existingMemories,newFact:evidence},questions:{operation:{type:'choice',instructions:OPERATION_INSTRUCTIONS,criteria:OPERATION_CRITERIA}}});
    operation=raw.answers?.operation?.choice??'INVALID';probabilities={operation:raw.answers?.operation?.probabilities??null};
    if((operation==='UPDATE'||operation==='DELETE')&&existingMemories.length){
      const targetRaw=await transport.paidDecision({...ctx,name:'jev-target'},{model:MODEL,state:{existingMemories,newFact:evidence,predictedOperation:operation},questions:{target:{type:'choice',instructions:'Choose exactly one existing memory ID as the target of the supplied predicted operation. Base the choice only on which candidate memory the new fact changes or explicitly asks to forget.',criteria:Object.fromEntries(existingMemories.map(m=>[m.id,`Select ${m.id} only if it is the existing memory that the ${operation} operation must act on: ${m.content}`]))}}});
      target=targetRaw.answers?.target?.choice??'INVALID';probabilities={...(probabilities as object),target:targetRaw.answers?.target?.probabilities??null};
    }
  }
  const valid=!error&&['ADD','UPDATE','DELETE','NOOP'].includes(operation)&&(['ADD','NOOP'].includes(operation)?target==='NONE':existingMemories.some(m=>m.id===target));
  if(!valid&&!error)error='Invalid operation/target contract; preserve state, no repair';
  return {decision:{operation:operation as MemoryDecision['operation'],target},valid,error,probabilities,call_ids:transport.calls.slice(start).filter(c=>c.context.arm===arm&&c.context.step===ctx.step&&c.paid).map(c=>c.id)};
}
