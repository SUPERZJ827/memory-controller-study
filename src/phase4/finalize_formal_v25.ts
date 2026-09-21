import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const RESULT = 'results/phase4_formal_v17';
const TERMINAL = 'phase4/formal_terminal_manifest_v25.json';
const PRESERVATION = 'phase4/preservation_check_post_phase4_v25.json';

type FileDigest = { path: string; bytes: number; sha256: string };

function readJson(path: string): any {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolveStream, reject) => {
    const stream = createReadStream(resolve(ROOT, path));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolveStream);
  });
  return hash.digest('hex');
}

async function fileDigest(path: string): Promise<FileDigest> {
  const absolute = resolve(ROOT, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Missing required file: ${path}`);
  }
  return { path, bytes: statSync(absolute).size, sha256: await sha256(path) };
}

function walkFiles(path: string): string[] {
  const absolute = resolve(ROOT, path);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) out.push(relative(ROOT, child));
    }
  };
  visit(absolute);
  return out.sort();
}

async function directoryDigest(path: string) {
  const files = walkFiles(path);
  const inventory = createHash('sha256');
  let bytes = 0;
  for (const file of files) {
    const item = await fileDigest(file);
    bytes += item.bytes;
    inventory.update(`${item.path}\t${item.bytes}\t${item.sha256}\n`);
  }
  return {
    path,
    file_count: files.length,
    bytes,
    inventory_sha256: inventory.digest('hex'),
    inventory_definition: 'sha256 over sorted UTF-8 lines: relative_path TAB bytes TAB content_sha256 NEWLINE',
  };
}

function sqliteScalar(sql: string): number {
  const output = execFileSync('sqlite3', [resolve(ROOT, `${RESULT}/ledger.sqlite`), sql], {
    encoding: 'utf8',
  }).trim();
  return Number(output);
}

async function main() {
  const outcome = readJson(`${RESULT}/outcome.json`);
  const status = readJson(`${RESULT}/status.json`);
  const budget = readJson(`${RESULT}/budget_reconciliation.json`);
  const analysis = readJson(`${RESULT}/analysis.json`);

  const runningAttempts = sqliteScalar("select count(*) from call_attempts where status='running';");
  const successfulAttempts = sqliteScalar("select count(*) from call_attempts where status='success';");
  const errorAttempts = sqliteScalar("select count(*) from call_attempts where status='error';");

  const validations = {
    outcome_complete: outcome.status === 'COMPLETE' && outcome.histories === 24,
    status_complete: status.status === 'COMPLETE' && status.histories === 24,
    analysis_complete: analysis.status === 'COMPLETE' && analysis.sample?.frozen_histories === 24,
    no_running_attempts: runningAttempts === 0,
    budget_not_halted: outcome.summary?.budget?.halted === false,
    campaign_under_hard_cap:
      outcome.summary?.budget?.total?.committedMicroUsd <= outcome.summary?.budget?.total?.limitMicroUsd,
    budget_reconciliation_matches_guard:
      Math.round(budget.guard_accounting.campaign_committed_total * 1_000_000) ===
      outcome.summary?.budget?.total?.committedMicroUsd,
    controller_pool_within_cap:
      outcome.summary?.budget?.pools?.formal_controllers?.committedMicroUsd <= 24_000_000,
    qa_pool_within_cap: outcome.summary?.budget?.pools?.formal_qa?.committedMicroUsd <= 1_000_000,
    auxiliary_pool_within_cap: outcome.summary?.budget?.pools?.formal_aux?.committedMicroUsd <= 2_000_000,
    development_pool_within_cap: outcome.summary?.budget?.pools?.dev?.committedMicroUsd <= 1_000_000,
  };
  if (Object.values(validations).some((value) => !value)) {
    throw new Error(`Terminal validation failed: ${JSON.stringify(validations)}`);
  }

  const oldManifest = readJson('phase4/pilot_final_manifest_v15.json');
  const preservationChecks: Array<{
    path: string;
    expected_sha256: string;
    actual_sha256: string | null;
    passed: boolean;
    error: string | null;
  }> = [];
  for (const artifact of oldManifest.artifacts as FileDigest[]) {
    try {
      const actual = await sha256(artifact.path);
      preservationChecks.push({
        path: artifact.path,
        expected_sha256: artifact.sha256,
        actual_sha256: actual,
        passed: actual === artifact.sha256,
        error: null,
      });
    } catch (error) {
      preservationChecks.push({
        path: artifact.path,
        expected_sha256: artifact.sha256,
        actual_sha256: null,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const disclosedAuthorizedChanges = preservationChecks
    .filter((item) =>
      item.path === 'src/phase4/local_extractor_v14.ts' &&
      item.expected_sha256 === '882e5a99725064dd48d5e82fa8361624e55f1deb41d8b51e1315b2b557874112' &&
      item.actual_sha256 === '043d624eef1777c6a4fad93cb856f0674a15b5b66dd548fe108ab1f7e1b7c2b1')
    .map((item) => ({
      ...item,
      authorization: [
        'phase4/formal_runtime_amendment_v21.json',
        'phase4/formal_runtime_amendment_v22.json',
        'phase4/formal_runtime_amendment_v23.json',
        'phase4/formal_runtime_amendment_v24.json',
        'phase4/formal_runtime_amendment_v25.json',
      ],
      classification: 'DISCLOSED_FORMAL_RUNTIME_SOURCE_CHANGE',
    }));
  const authorizedPaths = new Set(disclosedAuthorizedChanges.map((item) => item.path));
  const mismatches = preservationChecks.filter((item) => !item.passed && !authorizedPaths.has(item.path));
  const preservation = {
    schema: 'phase4-post-formal-preservation-check-v25',
    checked_at: new Date().toISOString(),
    source_manifest: await fileDigest('phase4/pilot_final_manifest_v15.json'),
    total_checks: preservationChecks.length,
    byte_identical_checks: preservationChecks.filter((item) => item.passed).length,
    disclosed_authorized_changes: disclosedAuthorizedChanges,
    passed_checks: preservationChecks.length - mismatches.length,
    failed_checks: mismatches.length,
    status: mismatches.length === 0 ? 'PASS_WITH_DISCLOSED_AUTHORIZED_SOURCE_CHANGE' : 'FAIL',
    mismatches,
    note: 'All development-pilot terminal-manifest artifacts were rehashed after the formal run. One source-file change was preregistered in the formal runtime amendments; all frozen data, policy, pilot results, and other artifacts remain byte-identical. Full passing rows are omitted; the immutable source manifest contains their expected hashes.',
  };
  writeFileSync(resolve(ROOT, PRESERVATION), `${JSON.stringify(preservation, null, 2)}\n`);
  if (mismatches.length > 0) throw new Error(`Unexpected old-artifact preservation failure for ${mismatches.length} files`);

  const protocolPaths = [
    'phase4/formal_freeze_v15.json',
    'phase4/formal_readiness_v15.json',
    'phase4/formal_run_authorization_v16.json',
    'phase4/formal_run_authorization_v17.json',
    'phase4/formal_runtime_amendment_v18.json',
    'phase4/formal_runtime_amendment_v19.json',
    'phase4/formal_runtime_amendment_v20.json',
    'phase4/formal_runtime_amendment_v21.json',
    'phase4/formal_runtime_amendment_v22.json',
    'phase4/formal_runtime_recovery_v22.json',
    'phase4/formal_runtime_amendment_v23.json',
    'phase4/formal_runtime_amendment_v24.json',
    'phase4/formal_runtime_amendment_v25.json',
  ];
  const sourcePaths = [
    'src/phase4/run_formal_v16.ts',
    'src/phase4/formal_transport_v16.ts',
    'src/phase4/ledger.ts',
    'src/phase4/local_extractor_v14.ts',
    'src/phase4/analyze_formal_v22.ts',
    'src/phase4/finalize_formal_v25.ts',
  ];
  const resultPaths = [
    `${RESULT}/outcome.json`,
    `${RESULT}/status.json`,
    `${RESULT}/ledger.sqlite`,
    `${RESULT}/analysis.json`,
    `${RESULT}/analysis_history_outcomes.csv`,
    `${RESULT}/analysis_controller_steps.csv`,
    `${RESULT}/analysis_cost_breakdown.csv`,
    `${RESULT}/analysis_operation_breakdown.csv`,
    `${RESULT}/budget_reconciliation.json`,
    'RESULT_PHASE4_LOW_BUDGET.md',
    PRESERVATION,
  ];

  const [protocolArtifacts, sourceArtifacts, resultArtifacts] = await Promise.all([
    Promise.all(protocolPaths.map(fileDigest)),
    Promise.all(sourcePaths.map(fileDigest)),
    Promise.all(resultPaths.map(fileDigest)),
  ]);
  const rawGroups = [];
  for (const path of [
    `${RESULT}/calls`,
    `${RESULT}/failed_attempts`,
    `${RESULT}/failures`,
    `${RESULT}/histories`,
  ]) {
    rawGroups.push(await directoryDigest(path));
  }

  const manifest = {
    schema: 'phase4-formal-terminal-manifest-v25',
    generated_at: new Date().toISOString(),
    status: 'COMPLETE_VERIFIED',
    experiment: {
      histories: 24,
      sessions: analysis.sample.sessions,
      facts_per_arm: analysis.sample.extracted_fact_decisions_per_arm,
      completed_at: outcome.finished_at,
    },
    ledger: {
      successful_attempts: successfulAttempts,
      error_attempts: errorAttempts,
      running_attempts: runningAttempts,
    },
    budget: {
      hard_cap_usd: 28,
      campaign_provider_exact_known_usd: budget.provider_exact.campaign_known_total,
      campaign_guard_settled_usd: budget.guard_accounting.campaign_settled_total,
      unknown_holds_usd: budget.guard_accounting.unknown_billing_holds,
      campaign_committed_usd: budget.guard_accounting.campaign_committed_total,
    },
    validations,
    preservation: {
      status: preservation.status,
      checked_artifacts: preservation.total_checks,
      failed_artifacts: preservation.failed_checks,
      artifact: await fileDigest(PRESERVATION),
    },
    protocol_artifacts: protocolArtifacts,
    source_artifacts: sourceArtifacts,
    result_artifacts: resultArtifacts,
    raw_artifact_groups: rawGroups,
    note: 'Raw-group digests commit to every file path, byte length, and content hash without expanding the terminal manifest to tens of thousands of rows.',
  };
  writeFileSync(resolve(ROOT, TERMINAL), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ terminal: TERMINAL, preservation: PRESERVATION, status: manifest.status, validations, rawGroups }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
