import {extractSessionV3} from './local_extractor_v3.js';import type {WriteSessionView} from './longmemeval_adapter.js';
const session:WriteSessionView={timestamp:'2026/09/20 (Sun) 12:00',turns:[{role:'user',content:'What city is Acme based in?'},{role:'assistant',content:'Acme is based in Paris.'},{role:'user',content:'I moved to Berlin last week.'}]};
const base=(content:string)=>({chat:async()=>content,embed:async()=>[]});
const empty=await extractSessionV3(session,base('{"facts":[]}'));if(empty.facts.length)throw Error('empty failed');
const good=await extractSessionV3(session,base('{"facts":[{"text":"The user moved to Berlin last week.","kind":"current","evidence":[{"turn_index":2,"quote":"I moved to Berlin last week."}]}]}'));if(good.facts[0].source_turns[0]!==2)throw Error('good failed');
for(const bad of ['{"facts":[{"text":"Acme is in Paris.","kind":"current","evidence":[{"turn_index":1,"quote":"Acme is based in Paris."}]}]}','{"facts":[{"text":"Acme is in Paris.","kind":"current","evidence":[{"turn_index":0,"quote":"Acme is based in Paris."}]}]}']){let rejected=false;try{await extractSessionV3(session,base(bad));}catch{rejected=true;}if(!rejected)throw Error('bad evidence accepted');}
console.log('local_extractor_v3: fake checks passed');
