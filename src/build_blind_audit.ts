import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { OPERATION_CRITERIA, OPERATION_INSTRUCTIONS } from './jev.js';

type Result = {
  id: string;
  joint_correct: boolean;
  gold_operation: string;
  gold_target: string;
  pred_operation: string;
  pred_target: string;
  input: {
    existing_memories: Array<{ id: string; content: string }>;
    new_fact: string;
  };
};

const SEED = 'phase3-blind-audit-v1-2026-09-20';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function jsonl(file: string): Promise<Result[]> {
  return (await readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Result);
}

async function main() {
  const jev = new Map(
    (await jsonl('results/raw/transitions_jev.jsonl')).map(item => [item.id, item]),
  );
  const claude = new Map(
    (await jsonl('results/raw/transitions_strong.jsonl')).map(item => [item.id, item]),
  );
  const gpt = new Map(
    (await jsonl('results/phase3/raw/transitions_gpt56sol.jsonl')).map(item => [
      item.id,
      item,
    ]),
  );
  const selected = new Set<string>();
  const reasons = new Map<string, string[]>();
  const add = (id: string, reason: string) => {
    selected.add(id);
    reasons.set(id, [...(reasons.get(id) ?? []), reason]);
  };
  for (const [id, item] of jev) {
    const c = claude.get(id) as Result;
    const g = gpt.get(id) as Result;
    if (!item.joint_correct) add(id, 'jev_wrong');
    if (item.joint_correct && !c.joint_correct) add(id, 'jev_only_vs_claude');
    if (!item.joint_correct && c.joint_correct) add(id, 'claude_only_vs_jev');
    if (item.joint_correct && !g.joint_correct) add(id, 'jev_only_vs_gpt');
    if (!item.joint_correct && g.joint_correct) add(id, 'gpt_only_vs_jev');
  }
  const controls = [...jev.keys()]
    .filter(
      id =>
        !selected.has(id) &&
        (jev.get(id) as Result).joint_correct &&
        (claude.get(id) as Result).joint_correct &&
        (gpt.get(id) as Result).joint_correct,
    )
    .sort((a, b) =>
      sha256(`${SEED}:control:${a}`).localeCompare(
        sha256(`${SEED}:control:${b}`),
      ),
    )
    .slice(0, 30);
  for (const id of controls) add(id, 'triple_correct_control');

  const ordered = [...selected].sort((a, b) =>
    sha256(`${SEED}:packet:${a}`).localeCompare(sha256(`${SEED}:packet:${b}`)),
  );
  const packets = ordered.map((id, index) => {
    const source = jev.get(id) as Result;
    return {
      blind_id: `BA-${String(index + 1).padStart(3, '0')}`,
      current_memory_state: source.input.existing_memories,
      current_evidence: source.input.new_fact,
      candidate_memories: source.input.existing_memories,
    };
  });
  const packetDocument = {
    frozen_memory_policy: {
      instructions: OPERATION_INSTRUCTIONS,
      criteria: OPERATION_CRITERIA,
    },
    packets,
  };
  const mapping = ordered.map((id, index) => {
    const j = jev.get(id) as Result;
    const c = claude.get(id) as Result;
    const g = gpt.get(id) as Result;
    return {
      blind_id: `BA-${String(index + 1).padStart(3, '0')}`,
      original_case_id: id,
      selection_reasons: reasons.get(id),
      benchmark_gold: { operation: j.gold_operation, target: j.gold_target },
      phase2_predictions: {
        jev: { operation: j.pred_operation, target: j.pred_target },
        claude: { operation: c.pred_operation, target: c.pred_target },
        gpt56sol: { operation: g.pred_operation, target: g.pred_target },
      },
    };
  });
  const packetJson = `${JSON.stringify(packetDocument, null, 2)}\n`;
  await mkdir('audit', { recursive: true });
  await writeFile('audit/blind_packets.json', packetJson);
  await writeFile(
    'audit/blind_mapping_private.json',
    `${JSON.stringify({ seed: SEED, mapping }, null, 2)}\n`,
  );
  await writeFile('audit/blind_packets.sha256', `${sha256(packetJson)}  blind_packets.json\n`);
  console.log(
    JSON.stringify(
      {
        union_cases: ordered.length - controls.length,
        controls: controls.length,
        total: ordered.length,
        packet_sha256: sha256(packetJson),
      },
      null,
      2,
    ),
  );
}

await main();

