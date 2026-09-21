import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const RESULTS = 'results/phase4_low_budget_v14';
const SESSION_DIR = path.join(RESULTS, 'extraction_repair/sessions');
const MANIFEST = 'phase4/pilot_final_manifest_v15.json';
const sha256 = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function walk(relative: string): string[] {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [relative];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    walk(path.join(relative, entry.name)),
  );
}

const sessionFiles = walk(SESSION_DIR).filter((p) => p.endsWith('.json')).sort();
let facts = 0;
let exactUserMatches = 0;
let userSourced = 0;
const violations: unknown[] = [];
for (const file of sessionFiles) {
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const fact of record.result.facts) {
    facts += 1;
    const indices = Array.isArray(fact.source_turns) ? fact.source_turns : [];
    const sourceTurns = indices.map((index: number) => record.session.turns[index]);
    const rolesOkay = sourceTurns.length > 0 && sourceTurns.every((turn: any) => turn?.role === 'user');
    const exact = sourceTurns.some((turn: any) =>
      typeof turn?.content === 'string' && turn.content.includes(fact.text),
    );
    if (rolesOkay) userSourced += 1;
    if (exact) exactUserMatches += 1;
    if (!rolesOkay || !exact) violations.push({ file, fact, rolesOkay, exact });
  }
}
if (sessionFiles.length !== 47 || facts !== 310 || violations.length) {
  throw new Error(`Extraction invariant failed: sessions=${sessionFiles.length}, facts=${facts}, violations=${violations.length}`);
}

const invariantPath = path.join(RESULTS, 'extraction_verbatim_invariant_v15.json');
fs.writeFileSync(invariantPath, JSON.stringify({
  schema: 'phase4-extraction-verbatim-invariant-v15',
  status: 'PASS',
  sessions: sessionFiles.length,
  facts,
  user_sourced: userSourced,
  exact_substring_in_cited_user_turn: exactUserMatches,
  violations,
}, null, 2) + '\n', { flag: 'wx' });

const roots = [
  RESULTS,
  'phase4/budget_config_v2.json',
  'phase4/budget_guard_v2_simulation.json',
  'phase4/extraction_repair_manifest_v14.json',
  'phase4/full_pilot_manifest_v14.json',
  'phase4/full_pilot_resume_manifest_v15.json',
  'phase4/formal_freeze_v15.json',
  'phase4/formal_readiness_v15.json',
  'phase4/preservation_check_v2.json',
  'EXTRACTION_REPAIR_AUDIT_V14.md',
  'RESULT_PHASE4_PILOT_V15.md',
  'src/phase4/local_extractor_v14.ts',
  'src/phase4/run_extraction_repair_v14.ts',
  'src/phase4/run_full_pilot_v14.ts',
  'src/phase4/resume_full_pilot_v15.ts',
  'src/phase4/analyze_full_pilot_v15.ts',
  'src/phase4/freeze_pilot_v15.ts',
];
const files = [...new Set(roots.flatMap(walk))]
  .filter((p) => p !== MANIFEST && !p.endsWith('-wal') && !p.endsWith('-shm'))
  .sort();
const artifacts = files.map((file) => ({
  path: file,
  bytes: fs.statSync(file).size,
  sha256: sha256(file),
}));
const manifest = {
  schema: 'phase4-development-pilot-terminal-manifest-v15',
  status: 'COMPLETE_AWAITING_EXPLICIT_FORMAL_CONFIRMATION',
  formal_authorized: false,
  development_id: '9bbe84a2',
  development_budget: {
    cap_usd: 1,
    settled_usd: 0.58125,
    exact_provider_sum_usd: 0.58109998,
    held_usd: 0,
    unknown_usd: 0,
  },
  extraction_invariant: {
    status: 'PASS',
    sessions: 47,
    facts: 310,
    user_sourced: 310,
    exact_substring_in_cited_user_turn: 310,
    artifact: invariantPath,
    sha256: sha256(invariantPath),
  },
  formal_freeze: {
    status: 'FROZEN_NOT_RUN',
    n: 24,
    path: 'phase4/formal_freeze_v15.json',
    sha256: sha256('phase4/formal_freeze_v15.json'),
  },
  artifact_count: artifacts.length,
  artifacts,
};
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({
  manifest: MANIFEST,
  artifact_count: artifacts.length,
  extraction_invariant: manifest.extraction_invariant,
  formal_freeze: manifest.formal_freeze,
}, null, 2));
