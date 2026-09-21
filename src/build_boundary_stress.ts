import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

type Operation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';
type Memory = { id: string; content: string };

type Topic = {
  label: string;
  oldValue: string;
  newValue: string;
  thirdValue: string;
  stableLabel: string;
  stableValue: string;
};

const SEED = 'boundary-stress-v1-2026-09-20';
const FAMILIES = [
  'tentative_plan',
  'explicit_retraction',
  'recency_trap',
  'round_trip_update',
  'partial_update',
  'persistence_ambiguity',
] as const;

const TOPICS: Topic[] = [
  { label: 'current city of residence', oldValue: 'Shanghai', newValue: 'Beijing', thirdValue: 'Shenzhen', stableLabel: 'remote-work day', stableValue: 'Friday' },
  { label: 'current employer', oldValue: 'Northstar Labs', newValue: 'Harbor Analytics', thirdValue: 'Pinecone Systems', stableLabel: 'job function', stableValue: 'data analyst' },
  { label: 'current job title', oldValue: 'Data Analyst', newValue: 'Senior Data Analyst', thirdValue: 'Analytics Lead', stableLabel: 'manager', stableValue: 'Priya Nair' },
  { label: 'primary phone', oldValue: 'Pixel 8', newValue: 'iPhone 17', thirdValue: 'Galaxy S26', stableLabel: 'mobile carrier', stableValue: 'StarHub' },
  { label: 'primary phone number', oldValue: '+65 8123 4401', newValue: '+65 8330 9921', thirdValue: '+65 9004 1872', stableLabel: 'preferred contact time', stableValue: 'after 6 PM' },
  { label: 'primary email address', oldValue: 'maya.chen@example.com', newValue: 'maya.c@example.org', thirdValue: 'mchen@example.net', stableLabel: 'email format preference', stableValue: 'plain text' },
  { label: 'current gym', oldValue: 'Ironworks Fitness', newValue: 'Riverfront Gym', thirdValue: 'Central Strength Club', stableLabel: 'usual workout day', stableValue: 'Saturday' },
  { label: 'regular work schedule', oldValue: 'Monday–Friday', newValue: 'Tuesday–Saturday', thirdValue: 'four-day week', stableLabel: 'start time', stableValue: '9 AM' },
  { label: 'usual commute route', oldValue: 'Route 12', newValue: 'Route 18', thirdValue: 'Green Line', stableLabel: 'usual departure time', stableValue: '7:30 AM' },
  { label: 'daily vitamin D dose', oldValue: '2,000 IU', newValue: '4,000 IU', thirdValue: '6,000 IU', stableLabel: 'time taken', stableValue: 'with breakfast' },
  { label: 'current dietary pattern', oldValue: 'vegetarian', newValue: 'vegan', thirdValue: 'pescatarian', stableLabel: 'nut allergy', stableValue: 'none' },
  { label: 'dog food brand', oldValue: 'Royal Canin', newValue: 'Hill’s Science Diet', thirdValue: 'Purina Pro Plan', stableLabel: 'feeding time', stableValue: '6 PM' },
  { label: 'regular veterinary clinic', oldValue: 'Greenfield Vet', newValue: 'Harbor Animal Clinic', thirdValue: 'Northside Vets', stableLabel: 'pet name', stableValue: 'Mochi' },
  { label: 'primary bank', oldValue: 'DBS', newValue: 'OCBC', thirdValue: 'UOB', stableLabel: 'savings transfer day', stableValue: 'Monday' },
  { label: 'default payment card', oldValue: 'Citi Cashback', newValue: 'Chase Sapphire', thirdValue: 'Amex Gold', stableLabel: 'statement day', stableValue: '18th' },
  { label: 'health insurance policy number', oldValue: 'HX-440812', newValue: 'HX-441090', thirdValue: 'HX-442700', stableLabel: 'insurer', stableValue: 'Evergreen Health' },
  { label: 'Kyoto hotel booking', oldValue: 'Sowaka Kyoto', newValue: 'Tawaraya', thirdValue: 'Hoshinoya Kyoto', stableLabel: 'travel month', stableValue: 'June' },
  { label: 'professional exam date', oldValue: 'May 10', newValue: 'May 24', thirdValue: 'June 7', stableLabel: 'exam section', stableValue: 'C11' },
  { label: 'weekly team meeting day', oldValue: 'Tuesday', newValue: 'Thursday', thirdValue: 'Wednesday', stableLabel: 'meeting time', stableValue: '10 AM' },
  { label: 'monthly rent due date', oldValue: '1st', newValue: '5th', thirdValue: '10th', stableLabel: 'payment method', stableValue: 'bank transfer' },
  { label: 'primary emergency contact', oldValue: 'Elaine Park', newValue: 'Tom Brennan', thirdValue: 'Priya Rao', stableLabel: 'contact relationship', stableValue: 'partner' },
  { label: 'preferred professional name', oldValue: 'Rebecca Thornton', newValue: 'Rebecca Lee', thirdValue: 'Rebecca Thornton-Lee', stableLabel: 'pronouns', stableValue: 'she/her' },
  { label: 'current academic major', oldValue: 'Economics', newValue: 'Computer Science', thirdValue: 'Statistics', stableLabel: 'university', stableValue: 'Eastbridge University' },
  { label: 'primary keyboard language', oldValue: 'English', newValue: 'Japanese', thirdValue: 'Korean', stableLabel: 'keyboard app', stableValue: 'Gboard' },
  { label: 'primary client assignment', oldValue: 'MedVantage', newValue: 'Northwind Health', thirdValue: 'Aster Retail', stableLabel: 'manager', stableValue: 'Diane Kowalski' },
  { label: 'primary car', oldValue: 'Honda Civic', newValue: 'Toyota Corolla', thirdValue: 'Mazda 3', stableLabel: 'parking location', stableValue: 'garage B2' },
  { label: 'home address', oldValue: '18 River Road, unit 2A', newValue: '44 Pine Street, unit 7C', thirdValue: '9 Lake Avenue, unit 3B', stableLabel: 'mailing preference', stableValue: 'no paper statements' },
  { label: 'regular therapist', oldValue: 'Dr. Kim', newValue: 'Dr. Alvarez', thirdValue: 'Dr. Chen', stableLabel: 'usual session day', stableValue: 'Wednesday' },
  { label: 'music subscription', oldValue: 'Spotify', newValue: 'Apple Music', thirdValue: 'YouTube Music', stableLabel: 'family-plan status', stableValue: 'individual plan' },
  { label: 'weekly running-distance goal', oldValue: '20 km', newValue: '30 km', thirdValue: '25 km', stableLabel: 'rest day', stableValue: 'Monday' }
];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildMemories(index: number, family: string, targetContent?: string) {
  const topic = TOPICS[index];
  const distractor1 = TOPICS[(index + 7) % TOPICS.length];
  const distractor2 = TOPICS[(index + 17) % TOPICS.length];
  const entries = [
    ...(targetContent ? [{ key: 'target', content: targetContent }] : []),
    { key: 'd1', content: `${distractor1.label}: ${distractor1.oldValue}` },
    { key: 'd2', content: `${distractor2.label}: ${distractor2.oldValue}` },
  ].sort((a, b) =>
    sha256(`${SEED}:${family}:${index}:id:${a.key}`).localeCompare(
      sha256(`${SEED}:${family}:${index}:id:${b.key}`),
    ),
  );
  const withIds = entries.map((item, position) => ({ ...item, id: `M${position + 1}` }));
  const target = withIds.find(item => item.key === 'target')?.id ?? 'NONE';
  const memories: Memory[] = withIds
    .sort((a, b) =>
      sha256(`${SEED}:${family}:${index}:order:${a.key}`).localeCompare(
        sha256(`${SEED}:${family}:${index}:order:${b.key}`),
      ),
    )
    .map(({ id, content }) => ({ id, content }));
  return { memories, target };
}

const tentativeFrames = [
  (t: Topic) => `I may switch my ${t.label} to ${t.newValue} next year, but I have not decided.`,
  (t: Topic) => `I'm only considering ${t.newValue} for my ${t.label}; nothing has changed yet.`,
  (t: Topic) => `${t.newValue} is a possibility for my ${t.label}, pending a final decision.`,
  (t: Topic) => `If everything works out, my ${t.label} could become ${t.newValue}, but it is not confirmed.`,
  (t: Topic) => `Someone suggested ${t.newValue} for my ${t.label}; for now I am keeping ${t.oldValue}.`,
];

const recencyFrames = [
  (t: Topic) => `A recent draft shows ${t.newValue} for my ${t.label}, but it has not been approved and ${t.oldValue} remains current.`,
  (t: Topic) => `I heard today that my ${t.label} might change to ${t.newValue}; that is still tentative.`,
  (t: Topic) => `The newest form prefilled ${t.newValue} for my ${t.label}, though it is provisional and not in effect.`,
  (t: Topic) => `They mentioned ${t.newValue} most recently, but only as a pending option for my ${t.label}.`,
  (t: Topic) => `There is a fresh proposal to use ${t.newValue} as my ${t.label}; no change has been finalized.`,
];

const roundTripFrames = [
  (t: Topic) => `I have now definitively changed my ${t.label} back to ${t.oldValue}; ${t.newValue} is no longer current.`,
  (t: Topic) => `The switch to ${t.newValue} has been reversed. My ${t.label} is officially ${t.oldValue} again.`,
  (t: Topic) => `I went from ${t.oldValue} to ${t.newValue}, but today I confirmed the return to ${t.oldValue} for my ${t.label}.`,
  (t: Topic) => `Please use ${t.oldValue} again as my current ${t.label}; the ${t.newValue} period has ended.`,
  (t: Topic) => `The final decision restores my ${t.label} to ${t.oldValue}, replacing ${t.newValue}.`,
];

function caseBase(
  id: number,
  family: typeof FAMILIES[number],
  index: number,
  evidence: string,
  memories: Memory[],
  operation: Operation,
  target: string,
  rationale: string,
) {
  return {
    id: `boundary-v1-${String(id).padStart(3, '0')}`,
    construction_family: family,
    construction_source: 'deterministic_template',
    initial_state: memories,
    evidence,
    candidate_memories: memories,
    gold_operation: operation,
    gold_target: target,
    rationale,
  };
}

async function main() {
  const cases: ReturnType<typeof caseBase>[] = [];
  let id = 1;
  for (let index = 0; index < TOPICS.length; index += 1) {
    const topic = TOPICS[index];
    const state = buildMemories(
      index,
      'tentative_plan',
      `${topic.label}: ${topic.oldValue}`,
    );
    cases.push(
      caseBase(
        id++,
        'tentative_plan',
        index,
        tentativeFrames[index % tentativeFrames.length](topic),
        state.memories,
        'NOOP',
        'NONE',
        'A tentative or conditional plan does not establish a current persistent state change.',
      ),
    );
  }

  for (let index = 0; index < TOPICS.length; index += 1) {
    const topic = TOPICS[index];
    const mode = index % 3;
    if (mode === 0) {
      const state = buildMemories(
        index,
        'explicit_retraction',
        `confirmed plan for ${topic.label}: change to ${topic.newValue}`,
      );
      cases.push(
        caseBase(
          id++,
          'explicit_retraction',
          index,
          `The confirmed plan to change my ${topic.label} to ${topic.newValue} is cancelled with no replacement.`,
          state.memories,
          'DELETE',
          state.target,
          'The active memory is a plan that has been explicitly cancelled without a replacement.',
        ),
      );
    } else if (mode === 1) {
      const state = buildMemories(
        index,
        'explicit_retraction',
        `${topic.label}: ${topic.newValue}`,
      );
      cases.push(
        caseBase(
          id++,
          'explicit_retraction',
          index,
          `I cancelled ${topic.newValue} and have definitively set my ${topic.label} to ${topic.thirdValue} instead.`,
          state.memories,
          'UPDATE',
          state.target,
          'The prior value is cancelled and a definite persistent replacement is supplied.',
        ),
      );
    } else {
      const state = buildMemories(
        index,
        'explicit_retraction',
        `${topic.label}: ${topic.oldValue}`,
      );
      cases.push(
        caseBase(
          id++,
          'explicit_retraction',
          index,
          `I once considered changing my ${topic.label} to ${topic.newValue}, but I cancelled that idea before it ever took effect.`,
          state.memories,
          'NOOP',
          'NONE',
          'The cancelled idea was never active and the current persistent value is unchanged.',
        ),
      );
    }
  }

  for (let index = 0; index < TOPICS.length; index += 1) {
    const topic = TOPICS[index];
    const state = buildMemories(
      index,
      'recency_trap',
      `${topic.label}: ${topic.oldValue}`,
    );
    cases.push(
      caseBase(
        id++,
        'recency_trap',
        index,
        recencyFrames[index % recencyFrames.length](topic),
        state.memories,
        'NOOP',
        'NONE',
        'A newer mention is explicitly provisional and must not replace the confirmed current value.',
      ),
    );
  }

  for (let index = 0; index < TOPICS.length; index += 1) {
    const topic = TOPICS[index];
    const state = buildMemories(
      index,
      'round_trip_update',
      `${topic.label}: ${topic.newValue}`,
    );
    cases.push(
      caseBase(
        id++,
        'round_trip_update',
        index,
        roundTripFrames[index % roundTripFrames.length](topic),
        state.memories,
        'UPDATE',
        state.target,
        'The evidence explicitly restores an older value, which replaces the currently active value.',
      ),
    );
  }

  for (let index = 0; index < TOPICS.length; index += 1) {
    const topic = TOPICS[index];
    const state = buildMemories(
      index,
      'partial_update',
      `${topic.label}: ${topic.oldValue}; ${topic.stableLabel}: ${topic.stableValue}`,
    );
    const frames = [
      `My ${topic.label} has changed to ${topic.newValue}. My ${topic.stableLabel} is still ${topic.stableValue}.`,
      `Update only my ${topic.label} to ${topic.newValue}; keep the ${topic.stableLabel} at ${topic.stableValue}.`,
      `${topic.newValue} is now the confirmed ${topic.label}, while ${topic.stableLabel} remains unchanged.`,
    ];
    cases.push(
      caseBase(
        id++,
        'partial_update',
        index,
        frames[index % frames.length],
        state.memories,
        'UPDATE',
        state.target,
        'One field in a compound memory changes while the other field is explicitly preserved; the compound candidate is the target.',
      ),
    );
  }

  for (let index = 0; index < TOPICS.length; index += 1) {
    const topic = TOPICS[index];
    const mode = index % 3;
    if (mode === 0) {
      const state = buildMemories(index, 'persistence_ambiguity');
      cases.push(
        caseBase(
          id++,
          'persistence_ambiguity',
          index,
          `I am using ${topic.newValue} for my ${topic.label} only this afternoon; afterward I will go back to the usual setup.`,
          state.memories,
          'NOOP',
          'NONE',
          'The evidence explicitly describes a temporary one-afternoon condition, not persistent state.',
        ),
      );
    } else if (mode === 1) {
      const state = buildMemories(index, 'persistence_ambiguity');
      cases.push(
        caseBase(
          id++,
          'persistence_ambiguity',
          index,
          `I have permanently adopted ${topic.newValue} as my ${topic.label} starting today.`,
          state.memories,
          'ADD',
          'NONE',
          'The evidence explicitly establishes a new permanent fact not represented in current memory.',
        ),
      );
    } else {
      const state = buildMemories(
        index,
        'persistence_ambiguity',
        `${topic.label}: ${topic.oldValue}`,
      );
      cases.push(
        caseBase(
          id++,
          'persistence_ambiguity',
          index,
          `${topic.newValue} has permanently replaced ${topic.oldValue} as my ${topic.label}, effective now.`,
          state.memories,
          'UPDATE',
          state.target,
          'The evidence explicitly establishes a permanent replacement for an active memory.',
        ),
      );
    }
  }

  if (cases.length !== 180) throw new Error(`Expected 180 cases, got ${cases.length}`);
  const document = {
    schema_version: 1,
    seed: SEED,
    construction_note:
      'Unused MemOps artifacts were screened first, but they did not provide balanced, unambiguous coverage of all six policy-defined families without inheriting the Phase-2 construct mismatch. All v1 gold labels therefore come from deterministic rules and no controller generated labels.',
    family_counts: Object.fromEntries(
      FAMILIES.map(family => [
        family,
        cases.filter(item => item.construction_family === family).length,
      ]),
    ),
    cases,
  };
  const output = `${JSON.stringify(document, null, 2)}\n`;
  await mkdir('data', { recursive: true });
  await writeFile('data/boundary_stress_v1.json', output);
  await writeFile(
    'data/boundary_stress_v1.sha256',
    `${sha256(output)}  boundary_stress_v1.json\n`,
  );
  console.log(JSON.stringify({ count: cases.length, family_counts: document.family_counts, sha256: sha256(output) }, null, 2));
}

await main();

