import type {WriteSessionView} from './longmemeval_adapter.js';
import type {ExtractedFact,FactKind,LocalChatRequest,LocalDependencies} from './local_memory_v2.js';

export const EXTRACTION_V4_PROMPT=`Extract memory-relevant autobiographical facts asserted by the USER in this current session.

Source rules:
- A fact must be about the user, the user's own life, or a person/object directly connected to the user's life.
- Public/company/general information supplied by the assistant is never a user memory.
- A user's question does not assert its unknown answer and does not by itself establish an enduring interest.
- Conversational reactions such as "interesting", "good to hear", or "I hope they succeed" are not persistent autobiographical facts.
- Assistant turns may only resolve the referent of an explicit user assertion, such as a user answering an assistant question. Never copy a fact asserted only by the assistant.

For every fact select all zero-based USER turn indexes that directly support the complete fact. The program will preserve those user turns verbatim beside the fact, so do not manufacture evidence. Preserve negation, uncertainty, attribution, time, numbers, and whether something is planned, historical, retracted, or current. Do not infer. If the user supplies no qualifying fact, return {"facts":[]}. Empty output is normal and preferable to unsupported memory. Return only the schema JSON.`;
interface RawFact{text:string;kind:FactKind;source_turns:number[]}
export interface ExtractionV4Result{facts:ExtractedFact[];verbatim_user_evidence:{fact_index:number;turns:{turn_index:number;content:string}[]}[]}
function schema(userIndexes:number[]){return {type:'object',additionalProperties:false,required:['facts'],properties:{facts:{type:'array',items:{type:'object',additionalProperties:false,required:['text','kind','source_turns'],properties:{text:{type:'string',minLength:1},kind:{type:'string',enum:['current','historical','tentative','retracted']},source_turns:{type:'array',minItems:1,uniqueItems:true,items:{type:'integer',enum:userIndexes}}}}}}}};
export async function extractSessionV4(session:WriteSessionView,deps:LocalDependencies):Promise<ExtractionV4Result>{
 const userIndexes=session.turns.flatMap((t,i)=>t.role==='user'?[i]:[]);const payload={timestamp:session.timestamp,turns:session.turns.map((t,index)=>({index,role:t.role,content:t.content}))};
 const request:LocalChatRequest={stage:'extraction',model:'Qwen3-8B',temperature:0,max_tokens:4096,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:EXTRACTION_V4_PROMPT},{role:'user',content:JSON.stringify(payload)}],response_format:{type:'json_schema',json_schema:{name:'phase4_extraction_v4',strict:true,schema:schema(userIndexes)}}};
 const raw=await deps.chat(request);let parsed:any;try{parsed=JSON.parse(raw);}catch{throw Error('Extraction v4 rejected: invalid JSON');}
 if(!parsed||Object.keys(parsed).join(',')!=='facts'||!Array.isArray(parsed.facts))throw Error('Extraction v4 rejected: invalid envelope');
 const facts:ExtractedFact[]=[];const verbatim_user_evidence:ExtractionV4Result['verbatim_user_evidence']=[];
 for(let i=0;i<parsed.facts.length;i++){const f=parsed.facts[i] as RawFact;
  if(!f||Object.keys(f).sort().join(',')!=='kind,source_turns,text'||typeof f.text!=='string'||!f.text.trim()||!['current','historical','tentative','retracted'].includes(f.kind)||!Array.isArray(f.source_turns)||!f.source_turns.length||f.source_turns.some(x=>!Number.isInteger(x)||session.turns[x]?.role!=='user'))throw Error('Extraction v4 rejected: invalid fact/source');
  const turns=[...new Set(f.source_turns)].map(turn_index=>({turn_index,content:session.turns[turn_index].content}));facts.push({text:f.text.trim(),kind:f.kind,source_turns:turns.map(t=>t.turn_index)});verbatim_user_evidence.push({fact_index:i,turns});
 }
 return {facts,verbatim_user_evidence};
}
