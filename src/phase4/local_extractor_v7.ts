import type {WriteSessionView} from './longmemeval_adapter.js';import type {ExtractedFact,FactKind,LocalChatRequest,LocalDependencies} from './local_memory_v2.js';import {userClaimCandidates,type ClaimCandidate} from './local_extractor_v6.js';
export const EXTRACTION_V7_PROMPT=`Select only user-authored claim fragments worth preserving as faithful memory evidence. Text is immutable; never add an answer or rewrite a claim.

Positive examples:
- "I live in Berlin." -> current
- "I bought a bicycle last week." -> historical
- "I might move to Berlin next year." -> tentative
- "The Berlin move is cancelled." -> retracted

Negative examples (do not select):
- "Do you know where Acme is based?" (question, not an asserted answer)
- "Thanks, that's interesting." (conversation only)
- first-person testimonials, resumes, reviews, or other text pasted/quoted by the user but explicitly attributed to somebody else
- requests for recommendations/advice with no durable personal fact
- facts stated only by the assistant

Scope is the user, the user's life, or people/objects directly connected to the user. A question about a public topic does not prove enduring interest. Assistant text is context only.

Kind is semantic state, not grammatical tense: current is confirmed present/ongoing; historical is completed past; tentative includes every not-yet-completed plan, intention, aim, option, or consideration (including "I will", "I'm going to", "planning", "thinking of"); retracted is only explicit cancellation, withdrawal, correction, denial, or request to forget. Never call a past event retracted. Return IDs and kinds only. Empty selections are normal.`;
export interface ExtractionV7Result{facts:ExtractedFact[];selected_claims:{claim_id:string;turn_index:number;verbatim_text:string;kind:FactKind}[];candidates:ClaimCandidate[];prefiltered:{claim_id:string;reason:string}[]}
function prefilter(c:ClaimCandidate):string|null{const t=c.text.trim();if(/^(?:do|does|did|can|could|would|should|what|why|where|when|who|which|is|are|was|were|have|has|how)\b/i.test(t)&&t.endsWith('?'))return'pure_interrogative';if(/^you\b/i.test(t))return'non_user_subject';if(/^(?:thanks?|thank you|that(?:'s| is) (?:helpful|great|good|interesting)|interesting|good to (?:know|hear)|i see)[!.]*$/i.test(t))return'conversation_only';return null;}
function schema(ids:string[]){return {type:'object',additionalProperties:false,required:['selections'],properties:{selections:{type:'array',items:{type:'object',additionalProperties:false,required:['claim_id','kind'],properties:{claim_id:{type:'string',enum:ids},kind:{type:'string',enum:['current','historical','tentative','retracted']}}}}}}};
export async function extractSessionV7(session:WriteSessionView,deps:LocalDependencies):Promise<ExtractionV7Result>{const all=userClaimCandidates(session),prefiltered=all.flatMap(c=>{const reason=prefilter(c);return reason?[{claim_id:c.claim_id,reason}]:[]}),blocked=new Set(prefiltered.map(x=>x.claim_id)),candidates=all.filter(c=>!blocked.has(c.claim_id)),context=session.turns.map((t,index)=>({index,role:t.role,content:t.content}));const req:LocalChatRequest={stage:'extraction',model:'Qwen3-8B',temperature:0,max_tokens:4096,chat_template_kwargs:{enable_thinking:true} as never,messages:[{role:'system',content:EXTRACTION_V7_PROMPT},{role:'user',content:JSON.stringify({timestamp:session.timestamp,candidates,conversation_context:context})}],response_format:{type:'json_schema',json_schema:{name:'phase4_extraction_v7',strict:true,schema:schema(candidates.map(c=>c.claim_id))}}};let o:any;try{o=JSON.parse(await deps.chat(req));}catch{throw Error('Extraction v7 rejected: invalid JSON');}if(!o||Object.keys(o).join(',')!=='selections'||!Array.isArray(o.selections))throw Error('Extraction v7 rejected: invalid envelope');const byId=new Map(candidates.map(c=>[c.claim_id,c])),seen=new Set<string>(),facts:ExtractedFact[]=[],selected_claims:ExtractionV7Result['selected_claims']=[];for(const s of o.selections){if(!s||Object.keys(s).sort().join(',')!=='claim_id,kind'||typeof s.claim_id!=='string'||!['current','historical','tentative','retracted'].includes(s.kind)||!byId.has(s.claim_id))throw Error('Extraction v7 rejected: invalid selection');if(seen.has(s.claim_id))continue;seen.add(s.claim_id);const c=byId.get(s.claim_id)!;facts.push({text:c.text,kind:s.kind,source_turns:[c.turn_index]});selected_claims.push({...c,verbatim_text:c.text,kind:s.kind});}return {facts,selected_claims,candidates,prefiltered};}
