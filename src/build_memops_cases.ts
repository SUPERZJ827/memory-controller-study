import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type OperationType = 'remember' | 'update' | 'forget' | 'reflect';
type Validity = 'confirmed' | 'tentative' | 'retracted';
type GoldOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';

type Span = { segment_index: number; turn_index: number; quote: string };
type MemOpsOperation = {
  operation_id: string;
  type: OperationType;
  validity: Validity;
  chain_id?: string;
  chain_step?: number;
  trigger_span: Span;
  target: { target_id: string; target_name: string };
  old_value: string | null;
  new_value: string | null;
  evidence_spans: Span[];
};
type DifficultyKnobs = Record<
  string,
  { enabled?: boolean; [key: string]: unknown }
>;
type SourceFile = {
  operation_type: string;
  conversations: Array<{
    segment_index: number;
    dialogue: Array<{ role: string; content: string }>;
  }>;
  difficulty_knobs: DifficultyKnobs;
  operations: MemOpsOperation[];
};

type StateEntry = {
  id: string;
  semantic_target_id: string;
  target_name: string;
  value: string;
};
type CandidateMemory = { id: string; content: string };

type TransitionCase = {
  id: string;
  existing_memories: CandidateMemory[];
  new_fact: string;
  gold_operation: GoldOperation;
  gold_target: string | 'NONE';
  slices: Record<string, boolean>;
  source: {
    file: string;
    family: string;
    operation_id: string;
    validity: Validity;
    trigger_span: Span;
  };
  executor: {
    semantic_target_id: string;
    target_name: string;
    old_value: string | null;
    new_value: string | null;
  };
};

type TrajectoryStep = Omit<TransitionCase, 'id' | 'existing_memories'> & {
  step_id: string;
  gold_pre_state: StateEntry[];
  gold_post_state: StateEntry[];
};

const SOURCE_DIR = 'vendor/MemOps/generated_result/2-evidence_conversation';
const SOURCE_COMMIT = '312af65e2c7b6d1b70f062ffa8b4cde32aaf6f35';
const SEED = 'memops-phase2-v1-2026-09-20';
const COUNTS: Record<GoldOperation, number> = {
  ADD: 75,
  UPDATE: 75,
  DELETE: 75,
  NOOP: 75,
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function cloneState(state: StateEntry[]): StateEntry[] {
  return state.map(item => ({ ...item }));
}

function renderCandidates(state: StateEntry[], caseKey: string): CandidateMemory[] {
  return state
    .map(item => ({
      id: item.id,
      content: `${item.target_name}: ${item.value}`,
      rank: sha256(`${SEED}:${caseKey}:${item.id}`),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .map(({ id, content }) => ({ id, content }));
}

function enabled(knobs: DifficultyKnobs, name: string): boolean {
  return knobs[name]?.enabled === true;
}

function mapGold(op: MemOpsOperation): GoldOperation | null {
  if (op.type === 'reflect') return null;
  if (op.validity !== 'confirmed') return 'NOOP';
  if (op.type === 'remember') return 'ADD';
  if (op.type === 'update') return 'UPDATE';
  if (op.type === 'forget') return 'DELETE';
  return null;
}

function findEntry(state: StateEntry[], targetId: string): StateEntry | undefined {
  return state.find(item => item.semantic_target_id === targetId);
}

function validateEvent(
  op: MemOpsOperation,
  state: StateEntry[],
): { ok: true; gold: GoldOperation } | { ok: false; reason: string } {
  const gold = mapGold(op);
  if (gold === null) return { ok: false, reason: 'reflect_excluded' };
  const active = findEntry(state, op.target.target_id);

  if (op.validity === 'confirmed' && op.type === 'remember') {
    if (op.old_value !== null) return { ok: false, reason: 'remember_old_nonnull' };
    if (active) return { ok: false, reason: 'remember_target_active' };
    if (op.new_value === null) return { ok: false, reason: 'remember_new_null' };
  } else if (op.validity === 'confirmed' && op.type === 'update') {
    if (!active) return { ok: false, reason: 'update_target_missing' };
    if (active.value !== op.old_value) {
      return { ok: false, reason: 'update_old_mismatch' };
    }
    if (op.new_value === null) return { ok: false, reason: 'update_new_null' };
  } else if (op.validity === 'confirmed' && op.type === 'forget') {
    if (!active) return { ok: false, reason: 'forget_target_missing' };
    if (active.value !== op.old_value) {
      return { ok: false, reason: 'forget_old_mismatch' };
    }
    if (op.new_value !== null) return { ok: false, reason: 'forget_new_nonnull' };
  } else if (op.type === 'update') {
    if (!active) return { ok: false, reason: 'invalid_update_target_missing' };
    if (active.value !== op.old_value) {
      return { ok: false, reason: 'invalid_update_old_mismatch' };
    }
  } else if (op.type === 'forget') {
    if (!active) return { ok: false, reason: 'invalid_forget_target_missing' };
  } else if (op.type === 'remember') {
    if (active) return { ok: false, reason: 'invalid_remember_target_active' };
    if (op.old_value !== null) {
      return { ok: false, reason: 'invalid_remember_old_nonnull' };
    }
  }
  return { ok: true, gold };
}

function applyConfirmed(
  op: MemOpsOperation,
  state: StateEntry[],
  allocateId: () => string,
): void {
  if (op.validity !== 'confirmed') return;
  const index = state.findIndex(
    item => item.semantic_target_id === op.target.target_id,
  );
  if (op.type === 'remember') {
    state.push({
      id: allocateId(),
      semantic_target_id: op.target.target_id,
      target_name: op.target.target_name,
      value: op.new_value as string,
    });
  } else if (op.type === 'update') {
    state[index] = {
      ...state[index],
      target_name: op.target.target_name,
      value: op.new_value as string,
    };
  } else if (op.type === 'forget') {
    state.splice(index, 1);
  }
}

function makeSlices(
  op: MemOpsOperation,
  gold: GoldOperation,
  state: StateEntry[],
  knobs: DifficultyKnobs,
): Record<string, boolean> {
  const targeted = gold === 'UPDATE' || gold === 'DELETE';
  return {
    ADD: gold === 'ADD',
    UPDATE: gold === 'UPDATE',
    DELETE: gold === 'DELETE',
    NOOP: gold === 'NOOP',
    tentative: op.validity === 'tentative',
    retraction: op.validity === 'retracted',
    recency_trap:
      enabled(knobs, 'recency_trap') &&
      (op.validity === 'tentative' || op.validity === 'retracted'),
    multi_target: enabled(knobs, 'multi_target') && state.length >= 2,
    candidate_disambiguation: targeted && state.length >= 3,
    update_chain:
      enabled(knobs, 'update_chain') && typeof op.chain_id === 'string',
    negative_seed: enabled(knobs, 'negative_seed'),
  };
}

function verifyQuote(source: SourceFile, op: MemOpsOperation): string | null {
  const segment = source.conversations.find(
    item => item.segment_index === op.trigger_span.segment_index,
  );
  const turn = segment?.dialogue[op.trigger_span.turn_index - 1];
  if (!turn) return 'trigger_turn_missing';
  if (turn.role !== 'user') return 'trigger_not_user';
  if (!turn.content.includes(op.trigger_span.quote)) return 'trigger_quote_not_verbatim';
  for (const span of op.evidence_spans ?? []) {
    if (
      span.segment_index > op.trigger_span.segment_index ||
      (span.segment_index === op.trigger_span.segment_index &&
        span.turn_index > op.trigger_span.turn_index)
    ) {
      return 'future_evidence_span';
    }
  }
  return null;
}

function groupOperations(operations: MemOpsOperation[]): MemOpsOperation[][] {
  const ordered = [...operations].sort(
    (a, b) =>
      a.trigger_span.segment_index - b.trigger_span.segment_index ||
      a.trigger_span.turn_index - b.trigger_span.turn_index ||
      a.operation_id.localeCompare(b.operation_id),
  );
  const groups: MemOpsOperation[][] = [];
  for (const op of ordered) {
    const previous = groups.at(-1)?.[0];
    if (
      previous &&
      previous.trigger_span.segment_index === op.trigger_span.segment_index &&
      previous.trigger_span.turn_index === op.trigger_span.turn_index
    ) {
      groups.at(-1)?.push(op);
    } else {
      groups.push([op]);
    }
  }
  return groups;
}

function buildFileTransitions(file: string, source: SourceFile) {
  const state: StateEntry[] = [];
  let nextMemory = 1;
  const transitions: Array<{
    op: MemOpsOperation;
    gold: GoldOperation;
    pre: StateEntry[];
    post: StateEntry[];
  }> = [];
  const exclusions: Array<{ operation_id: string; reason: string }> = [];
  let fileExecutable = true;

  for (const group of groupOperations(source.operations)) {
    const pre = cloneState(state);
    const accepted: MemOpsOperation[] = [];
    const seenConfirmedTargets = new Set<string>();

    for (const op of group) {
      const quoteError = verifyQuote(source, op);
      if (quoteError) {
        exclusions.push({ operation_id: op.operation_id, reason: quoteError });
        fileExecutable = false;
        continue;
      }
      if (
        op.validity === 'confirmed' &&
        seenConfirmedTargets.has(op.target.target_id)
      ) {
        exclusions.push({ operation_id: op.operation_id, reason: 'same_turn_target_conflict' });
        fileExecutable = false;
        continue;
      }
      if (op.validity === 'confirmed') seenConfirmedTargets.add(op.target.target_id);
      const verdict = validateEvent(op, pre);
      if (!verdict.ok) {
        exclusions.push({ operation_id: op.operation_id, reason: verdict.reason });
        if (verdict.reason !== 'reflect_excluded') fileExecutable = false;
        continue;
      }
      accepted.push(op);
      transitions.push({ op, gold: verdict.gold, pre, post: [] });
    }

    for (const op of accepted) {
      applyConfirmed(op, state, () => `M${nextMemory++}`);
    }
    const post = cloneState(state);
    for (const transition of transitions) {
      if (
        transition.op.trigger_span.segment_index ===
          group[0].trigger_span.segment_index &&
        transition.op.trigger_span.turn_index === group[0].trigger_span.turn_index
      ) {
        transition.post = post;
      }
    }
  }
  return { file, transitions, exclusions, fileExecutable };
}

function transitionToCase(
  file: string,
  family: string,
  knobs: DifficultyKnobs,
  transition: ReturnType<typeof buildFileTransitions>['transitions'][number],
): TransitionCase {
  const { op, gold, pre } = transition;
  const caseKey = `${file}:${op.operation_id}`;
  const active = findEntry(pre, op.target.target_id);
  return {
    id: '',
    existing_memories: renderCandidates(pre, caseKey),
    new_fact: op.trigger_span.quote,
    gold_operation: gold,
    gold_target:
      gold === 'UPDATE' || gold === 'DELETE' ? (active?.id ?? 'NONE') : 'NONE',
    slices: makeSlices(op, gold, pre, knobs),
    source: {
      file,
      family,
      operation_id: op.operation_id,
      validity: op.validity,
      trigger_span: op.trigger_span,
    },
    executor: {
      semantic_target_id: op.target.target_id,
      target_name: op.target.target_name,
      old_value: op.old_value,
      new_value: op.new_value,
    },
  };
}

function dedupeKey(item: TransitionCase): string {
  return JSON.stringify({
    state: item.existing_memories.map(memory => memory.content).sort(),
    evidence: item.new_fact,
    operation: item.gold_operation,
    targetContent:
      item.gold_target === 'NONE'
        ? 'NONE'
        : item.existing_memories.find(memory => memory.id === item.gold_target)?.content,
  });
}

function priority(item: TransitionCase): string {
  const rare = item.slices.retraction
    ? '0'
    : item.source.validity === 'tentative' && item.source.family !== 'Update'
      ? '1'
      : item.slices.candidate_disambiguation
        ? '2'
        : item.slices.multi_target
          ? '3'
          : '4';
  return `${rare}:${sha256(`${SEED}:${item.source.file}:${item.source.operation_id}`)}`;
}

function selectCases(candidates: TransitionCase[]): TransitionCase[] {
  const selected: TransitionCase[] = [];
  for (const operation of ['ADD', 'UPDATE', 'DELETE', 'NOOP'] as GoldOperation[]) {
    const seen = new Set<string>();
    const pool = candidates
      .filter(item => item.gold_operation === operation)
      .sort((a, b) => priority(a).localeCompare(priority(b)))
      .filter(item => {
        const key = dedupeKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (pool.length < COUNTS[operation]) {
      throw new Error(`Only ${pool.length} unique ${operation} cases are available.`);
    }
    selected.push(...pool.slice(0, COUNTS[operation]));
  }
  return selected
    .sort((a, b) =>
      sha256(`${SEED}:final:${a.source.file}:${a.source.operation_id}`).localeCompare(
        sha256(`${SEED}:final:${b.source.file}:${b.source.operation_id}`),
      ),
    )
    .map((item, index) => ({ ...item, id: `memops-t${String(index + 1).padStart(3, '0')}` }));
}

async function main() {
  const files = (await readdir(SOURCE_DIR)).filter(name => name.endsWith('.json')).sort();
  const sources = new Map<string, SourceFile>();
  const builds = [];
  const auditExclusions: Array<{
    file: string;
    operation_id: string;
    reason: string;
  }> = [];

  for (const file of files) {
    const source = JSON.parse(
      await readFile(path.join(SOURCE_DIR, file), 'utf8'),
    ) as SourceFile;
    sources.set(file, source);
    const build = buildFileTransitions(file, source);
    builds.push(build);
    auditExclusions.push(
      ...build.exclusions.map(item => ({ file, ...item })),
    );
  }

  const layerACandidates: TransitionCase[] = [];
  for (const build of builds) {
    const source = sources.get(build.file) as SourceFile;
    if (source.operation_type === 'Reflect' || source.operation_type === 'TrajectoryOps') {
      continue;
    }
    layerACandidates.push(
      ...build.transitions.map(transition =>
        transitionToCase(
          build.file,
          source.operation_type,
          source.difficulty_knobs,
          transition,
        ),
      ),
    );
  }
  const cases = selectCases(layerACandidates);

  const executableTrajectories = builds
    .filter(build => {
      const source = sources.get(build.file) as SourceFile;
      return (
        source.operation_type === 'TrajectoryOps' &&
        build.fileExecutable &&
        build.transitions.length >= 4
      );
    })
    .sort((a, b) =>
      sha256(`${SEED}:trajectory:${a.file}`).localeCompare(
        sha256(`${SEED}:trajectory:${b.file}`),
      ),
    );

  const withForget = executableTrajectories.filter(build =>
    build.transitions.some(item => item.gold === 'DELETE'),
  );
  const chosen = [
    ...withForget,
    ...executableTrajectories.filter(item => !withForget.includes(item)),
  ].slice(0, 25);
  if (chosen.length !== 25) throw new Error(`Only ${chosen.length} trajectories available.`);

  const trajectories = chosen.map((build, trajectoryIndex) => {
    const source = sources.get(build.file) as SourceFile;
    const steps: TrajectoryStep[] = build.transitions.map((transition, stepIndex) => {
      const base = transitionToCase(
        build.file,
        source.operation_type,
        source.difficulty_knobs,
        transition,
      );
      return {
        step_id: `s${stepIndex + 1}`,
        new_fact: base.new_fact,
        gold_operation: base.gold_operation,
        gold_target: base.gold_target,
        slices: base.slices,
        source: base.source,
        executor: base.executor,
        gold_pre_state: transition.pre,
        gold_post_state: transition.post,
      };
    });
    return {
      id: `memops-traj-${String(trajectoryIndex + 1).padStart(2, '0')}`,
      source_file: build.file,
      initial_state: steps[0]?.gold_pre_state ?? [],
      canonical_memory_ids: Object.fromEntries(
        steps
          .flatMap(step => [...step.gold_pre_state, ...step.gold_post_state])
          .map(item => [item.semantic_target_id, item.id]),
      ),
      steps,
      gold_final_state: steps.at(-1)?.gold_post_state ?? [],
    };
  });

  await mkdir('data', { recursive: true });
  await mkdir('results', { recursive: true });
  const transitionDocument = {
    schema_version: 1,
    source_commit: SOURCE_COMMIT,
    seed: SEED,
    count: cases.length,
    cases,
  };
  const trajectoryDocument = {
    schema_version: 1,
    source_commit: SOURCE_COMMIT,
    seed: SEED,
    count: trajectories.length,
    trajectories,
  };
  const transitionJson = `${JSON.stringify(transitionDocument, null, 2)}\n`;
  const trajectoryJson = `${JSON.stringify(trajectoryDocument, null, 2)}\n`;
  await writeFile('data/memops_transition_cases.json', transitionJson);
  await writeFile('data/memops_trajectories.json', trajectoryJson);
  await writeFile(
    'data/memops_adapter_exclusions.json',
    `${JSON.stringify({ source_commit: SOURCE_COMMIT, exclusions: auditExclusions }, null, 2)}\n`,
  );
  await writeFile(
    'data/memops_frozen_hashes.json',
    `${JSON.stringify(
      {
        memops_transition_cases_sha256: sha256(transitionJson),
        memops_trajectories_sha256: sha256(trajectoryJson),
      },
      null,
      2,
    )}\n`,
  );

  const counts = Object.fromEntries(
    (['ADD', 'UPDATE', 'DELETE', 'NOOP'] as GoldOperation[]).map(operation => [
      operation,
      cases.filter(item => item.gold_operation === operation).length,
    ]),
  );
  const slices = Object.fromEntries(
    Object.keys(cases[0].slices).map(name => [
      name,
      cases.filter(item => item.slices[name]).length,
    ]),
  );
  console.log(JSON.stringify({ counts, slices, trajectories: trajectories.length }, null, 2));
}

await main();
