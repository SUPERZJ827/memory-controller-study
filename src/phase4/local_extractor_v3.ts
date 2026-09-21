import type {WriteSessionView} from './longmemeval_adapter.js';
import type {ExtractedFact,FactKind,LocalChatRequest,LocalDependencies} from './local_memory_v2.js';

export const EXTRACTION_V3_PROMPT=`Extract persistent or otherwise memory-relevant autobiographical facts asserted by the USER in this current session.

Hard source rule:
- A fact must be about the user, the user's own life, or a person/object directly connected to the user's life.
- Public/company/general information that the assistant supplies is never a user memory.
- A user's question about a topic does not assert the answer and does not by itself establish an enduring personal interest.
- Conversational reactions such as "interesting", "good to hear", or "I hope they succeed" are not persistent autobiographical facts.
- Assistant turns may only resolve the referent of an explicit user assertion (for example, an assistant asks "Do you live in Paris?" and the user says "Yes"). Never copy facts asserted only by the assistant.

For every fact, copy one or more exact, nonempty support quotes from USER turns. Each quote must directly support the complete fact; do not use a question as evidence for its unknown answer. Preserve negation, uncertainty, attribution, time, numbers, and whether something is planned, historical, retracted, or current. Do not infer. If the user supplies no qualifying fact, return {"facts":[]}. Empty output is normal and preferable to unsupported memory. Return only the schema JSON.`;

interface RawFact {text:string;kind:FactKind;evidence:{turn_index:number;quote:string}[]}
export interface ExtractionV3Result {facts:ExtractedFact[];evidence:{fact_index:number;items:{turn_index:number;quote:string}[]}[]}
function schema(userIndexes:number[]){return {type:'object',additionalProperties:false,required:['facts'],properties:{facts:{type:'array',items:{type:'object',additionalProperties:false,required:['text','kind','evidence'],properties:{text:{type:'string',minLength:1},kind:{type:'string',enum:['current','historical','tentative','retracted']},evidence:{type:'array',minItems:1,items:{type:'object',additionalProperties:false,required:['turn_index','quote'],properties:{turn_index:{type:'integer',enum:userIndexes},quote:{type:'string',minLength:1}}}}}}}}}};
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
export async function extractSessionV3(session:WriteSessionView,deps:LocalDependencies):Promise<ExtractionV3Result>{
  const userIndexes=session.turns.flatMap((t,i)=>t.role==='user'?[i]:[]);
  const payload={timestamp:session.timestamp,turns:session.turns.map((t,index)=>({index,role:t.role,content:t.content}))};
  const request:LocalChatRequest={stage:'extraction',model:'Qwen3-8B',temperature:0,max_tokens:4096,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:EXTRACTION_V3_PROMPT},{role:'user',content:JSON.stringify(payload)}],response_format:{type:'json_schema',json_schema:{name:'phase4_extraction_v3',strict:true,schema:schema(userIndexes)}}};
  const raw=await deps.chat(request);let parsed:any;
  try{parsed=JSON.parse(raw);}catch{throw Error('Extraction v3 rejected: invalid JSON');}
  if(!parsed||Object.keys(parsed).join(',')!=='facts'||!Array.isArray(parsed.facts))throw Error('Extraction v3 rejected: invalid envelope');
  const facts:ExtractedFact[]=[];const evidence:ExtractionV3Result['evidence']=[];
  for(let i=0;i<parsed.facts.length;i++){
    const item=parsed.facts[i] as RawFact;
    if(!item||Object.keys(item).sort().join(',')!=='evidence,kind,text'||typeof item.text!=='string'||!item.text.trim()||!['current','historical','tentative','retracted'].includes(item.kind)||!Array.isArray(item.evidence)||!item.evidence.length)throw Error('Extraction v3 rejected: invalid fact shape');
    const seen=new Set<number>();const proof=[];
    for(const e of item.evidence){
      if(!e||Object.keys(e).sort().join(',')!=='quote,turn_index'||!Number.isInteger(e.turn_index)||session.turns[e.turn_index]?.role!=='user'||typeof e.quote!=='string'||!e.quote.trim())throw Error('Extraction v3 rejected: invalid user evidence');
      const source=norm(session.turns[e.turn_index].content),quote=norm(e.quote);
      if(!source.includes(quote))throw Error(`Extraction v3 rejected: support quote is not verbatim user text at turn ${e.turn_index}`);
      seen.add(e.turn_index);proof.push({turn_index:e.turn_index,quote:e.quote});
    }
    facts.push({text:item.text.trim(),kind:item.kind,source_turns:[...seen]});evidence.push({fact_index:i,items:proof});
  }
  return {facts,evidence};
}
