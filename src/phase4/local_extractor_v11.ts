import type{WriteSessionView}from'./longmemeval_adapter.js';import type{LocalDependencies}from'./local_memory_v2.js';import{extractSessionV10,type ExtractionV10Result,EXTRACTION_V10_PROMPT}from'./local_extractor_v10.js';
export const EXTRACTION_V11_PROMPT_SUFFIX='\n\nKeep internal reasoning concise. Resolve each item once, then emit the required final JSON; do not repeatedly reconsider verdicts.';
export async function extractSessionV11(session:WriteSessionView,deps:LocalDependencies):Promise<ExtractionV10Result>{return extractSessionV10(session,{...deps,chat:req=>deps.chat({...req,max_tokens:8192,messages:req.messages.map((m,i)=>i===0?{...m,content:m.content+EXTRACTION_V11_PROMPT_SUFFIX}:m)})});}
export{EXTRACTION_V10_PROMPT};
