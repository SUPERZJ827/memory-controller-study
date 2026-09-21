/** Freeze terminal development artifacts; no inference and no source mutation. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dest='phase4/pilot_final_manifest_v2.json';
if(fs.existsSync(dest))throw Error('Terminal manifest already frozen');
function walk(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);}
const paths=[
  ...walk('results/phase4_low_budget_v2'),
  ...fs.readdirSync('phase4').filter(f=>f.includes('_v2.')||f==='pilot_execution_manifest_v2.json').map(f=>path.join('phase4',f)),
  ...fs.readdirSync('src/phase4').filter(f=>f.includes('_v2')).map(f=>path.join('src/phase4',f)),
  'PHASE4_LOW_BUDGET_REVISION_V2.md','PHASE4_PILOT_EXECUTION_V2.md','RESULT_PHASE4_PILOT_V2.md','BUDGET_GUARD_V2_SPEC.md',
].filter(p=>p!==dest&&!p.endsWith('-wal')&&!p.endsWith('-shm')&&!p.endsWith('.tmp'));
const hashes=Object.fromEntries([...new Set(paths)].sort().map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const manifest={schema:'phase4-development-terminal-freeze-v2',status:'STOPPED_LOCAL_EXTRACTION_FORMAL_NOT_RUN',finished_at:new Date().toISOString(),paid_API_requests:0,new_API_bill_usd:0,formal_n:null,formal_ids:null,hashes,notes:['Pilot source manifest predates inference. This terminal manifest hashes failed outputs as evidence, not formal test membership.','SQLite hashes describe current closed snapshots. The campaign budget database is operational state and will change if a later explicitly approved run uses it; preserve this terminal manifest and copied/archived snapshot first.']};
fs.writeFileSync(dest,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:dest,files:Object.keys(hashes).length,sha256:createHash('sha256').update(fs.readFileSync(dest)).digest('hex')},null,2));
