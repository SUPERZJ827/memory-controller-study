import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FormalTransportV16 } from './formal_transport_v16.js';
import { formalPredictV16 } from './formal_predict_v16.js';
import { extractSessionV14 } from './local_extractor_v14.js';
import { LongMemEvalTrajectory, LONGMEMEVAL_RELATIVE_PATH, verifyPinnedLongMemEval,
  type WriteSessionView } from './longmemeval_adapter.js';
import { createMemoryState, ingestFact, candidates, applyDecision, answerFromState,
  type ExtractedFact, type LocalDependencies, type MemoryState } from './local_memory_v2.js';
import type { Context } from './pilot_transport_v2.js';

const ROOT = 'results/phase4_formal_v17';
const AUTH = 'phase4/formal_run_authorization_v17.json';
const AMENDMENT = 'phase4/formal_runtime_amendment_v25.json';
const FREEZE = 'phase4/formal_freeze_v15.json';
const FREEZE_HASH = '43035baddce5a2d73c658e4c8431c953d2412a4e1f7a3ade60729d4402406a1a';
const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const atomic = (p: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(p + '.tmp', p);
};
const freezeWrite = (p: string, value: unknown): void => {
  const serialized = JSON.stringify(value, null, 2) + '\n';
  if (fs.existsSync(p)) {
    if (fs.readFileSync(p, 'utf8') !== serialized) throw new Error('Deterministic replay mismatch: ' + p);
    return;
  }
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, serialized, {flag: 'wx'});
};
const project = (state: MemoryState) => ({next_memory_id: state.next_memory_id,
  active: state.active.map(({embedding, ...record}) => record),
  events: state.events.map(({embedding, ...event}) => event)});
const budgetBrief = (snapshot: any) => ({halted: snapshot.halted, total: snapshot.total,
  pools: Object.fromEntries(Object.entries(snapshot.pools).map(([key, value]: [string, any]) =>
    [key, {limitMicroUsd: value.limitMicroUsd, settledMicroUsd: value.settledMicroUsd,
      heldMicroUsd: value.heldMicroUsd, unknownMicroUsd: value.unknownMicroUsd,
      availableMicroUsd: value.availableMicroUsd}]))});

function officialJudgePrompt(source: any, response: string): string {
  if (source.question_id.includes('_abs')) return `I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: ${source.question}\n\nExplanation: ${source.answer}\n\nModel Response: ${response}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.`;
  return `I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: ${source.question}\n\nCorrect Answer: ${source.answer}\n\nModel Response: ${response}\n\nIs the model response correct? Answer yes or no only.`;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--run-authorized-frozen-formal')) throw new Error('Explicit formal execution flag required');
  if (fs.existsSync(path.join(ROOT, 'outcome.json'))) throw new Error('Formal run already terminal');
  if (!fs.existsSync(AUTH)) throw new Error('Formal authorization artifact missing');
  if (!fs.existsSync(AMENDMENT)) throw new Error('Formal runtime amendment missing');
  if (sha(FREEZE) !== FREEZE_HASH) throw new Error('Frozen membership/protocol hash changed');
  const authorization = JSON.parse(fs.readFileSync(AUTH, 'utf8'));
  const amendment = JSON.parse(fs.readFileSync(AMENDMENT, 'utf8'));
  const frozen = JSON.parse(fs.readFileSync(FREEZE, 'utf8'));
  if (!authorization.authorized || authorization.freeze_sha256 !== FREEZE_HASH ||
      frozen.n !== 24 || frozen.ids.length !== 24) throw new Error('Authorization/freeze gate failed');
  if (amendment.base_authorization_sha256 !== sha(AUTH) ||
      amendment.revised_source_hashes?.['src/phase4/run_formal_v16.ts'] !== sha('src/phase4/run_formal_v16.ts')) {
    throw new Error('Runtime amendment hash gate failed');
  }
  for (const [source, expected] of Object.entries(authorization.source_hashes)) {
    if (Object.prototype.hasOwnProperty.call(amendment.revised_source_hashes ?? {}, source)) {
      if (sha(source) !== amendment.revised_source_hashes[source]) throw new Error('Amended source changed: ' + source);
      continue;
    }
    if (sha(source) !== expected) throw new Error('Authorized source changed: ' + source);
  }
  await verifyPinnedLongMemEval();
  const rows = JSON.parse(fs.readFileSync(LONGMEMEVAL_RELATIVE_PATH, 'utf8')) as any[];
  const byId = new Map(rows.map((row, index) => [row.question_id, {row, index}]));
  const transport = new FormalTransportV16(ROOT, authorization);
  let localTail: Promise<unknown> = Promise.resolve();
  const deps = (arm: Context['arm'], history: string, step: number): LocalDependencies => {
    let chat = 0;
    let embed = 0;
    return {
      chat: async (request) => {
        const {stage, ...body} = request;
        const mapped = stage === 'rewrite' ? 'rewrite_joint_update' :
          stage === 'answer' ? 'answer_generation' : 'extraction';
        const call = localTail.then(() => transport.localChat({arm, history, step,
          stage: mapped, name: `${stage}-${chat++}`}, {...body, model: 'Qwen3-8B'}));
        localTail = call.catch(() => undefined);
        return call;
      },
      embed: (texts) => transport.embed({arm, history, step, stage: 'embedding',
        name: `embedding-${embed++}`}, texts),
    };
  };
  let completed = 0;
  try {
    for (const frozenItem of frozen.ids) {
      const history = String(frozenItem.question_id);
      const order = Number(frozenItem.order);
      const dir = path.join(ROOT, 'histories', `${String(order).padStart(2, '0')}-${history}`);
      const historyOutcome = path.join(dir, 'outcome.json');
      if (fs.existsSync(historyOutcome)) {
        const prior = JSON.parse(fs.readFileSync(historyOutcome, 'utf8'));
        if (prior.status !== 'COMPLETE') throw new Error('Nonterminal history outcome exists: ' + history);
        completed += 1;
        continue;
      }
      const located = byId.get(history);
      if (!located) throw new Error('Frozen history missing from pinned data: ' + history);
      const source = located.row;
      const trajectory = LongMemEvalTrajectory.fromRaw(source, located.index);
      const sessions: WriteSessionView[] = [];
      while (!trajectory.ingestionComplete) sessions.push(trajectory.nextWriteSession()!);
      if (sessions.length !== frozenItem.chronological_sessions) throw new Error('Session count changed: ' + history);

      const extracted: Array<{session_index: number; session: WriteSessionView;
        result: Awaited<ReturnType<typeof extractSessionV14>>}> = new Array(sessions.length);
      let nextSession = 0;
      let extractionFailure: unknown = null;
      const extractWorker = async (): Promise<void> => {
        while (!extractionFailure) {
          const sessionIndex = nextSession++;
          if (sessionIndex >= sessions.length) return;
          const target = path.join(dir, 'extraction', `${String(sessionIndex).padStart(3, '0')}.json`);
          try {
            let record: any;
            if (fs.existsSync(target)) {
              record = JSON.parse(fs.readFileSync(target, 'utf8'));
              if (JSON.stringify(record.session) !== JSON.stringify(sessions[sessionIndex])) {
                throw new Error('Extraction/source replay mismatch: ' + target);
              }
            } else {
              let chat = 0;
              const extractionDeps: LocalDependencies = {
                chat: async (request) => {
                  const {stage: _stage, ...body} = request;
                  delete (body as any).response_format;
                  const name = `extraction-${chat++}`;
                  try {
                    return await transport.localChat({arm: 'shared', history, step: sessionIndex,
                      stage: 'extraction', name}, {...body, model: 'Qwen3-8B'});
                  } catch (error) {
                    let singleton = false;
                    try {
                      const payload = JSON.parse(request.messages[1]?.content ?? '{}');
                      singleton = Array.isArray(payload.items) && payload.items.length === 1;
                    } catch { /* malformed payload remains fatal */ }
                    if (!singleton || !String(error).includes('Truncated')) throw error;
                    try {
                      return await transport.localChat({arm: 'shared', history, step: sessionIndex,
                        stage: 'extraction', name: `${name}-singleton-retry1`},
                      {...body, model: 'Qwen3-8B'});
                    } catch (retryError) {
                      if (!String(retryError).includes('Truncated')) throw retryError;
                      return transport.localChat({arm: 'shared', history, step: sessionIndex,
                        stage: 'extraction', name: `${name}-singleton-retry2-extended`},
                      {...body, model: 'Qwen3-8B', max_tokens: 16_384});
                    }
                  }
                },
                embed: async () => { throw new Error('Extraction must not embed'); },
              };
              const result = await extractSessionV14(sessions[sessionIndex], extractionDeps);
              record = {session_index: sessionIndex, session: sessions[sessionIndex], result};
              freezeWrite(target, record);
            }
            for (const fact of record.result.facts as ExtractedFact[]) {
              if (!fact.source_turns.length || !fact.source_turns.every((i) =>
                  record.session.turns[i]?.role === 'user') || !fact.source_turns.some((i) =>
                  record.session.turns[i].content.includes(fact.text))) {
                throw new Error('Non-verbatim/non-user formal extraction: ' + target);
              }
            }
            extracted[sessionIndex] = record;
          } catch (error) { extractionFailure = error; }
        }
      };
      await Promise.all([extractWorker(), extractWorker()]);
      if (extractionFailure) throw extractionFailure;

      const states: {B: MemoryState; C: MemoryState} = {B: createMemoryState(), C: createMemoryState()};
      const decisionIndex: any[] = [];
      let step = 0;
      for (const session of extracted) {
        for (let factIndex = 0; factIndex < session.result.facts.length; factIndex += 1, step += 1) {
          const fact = session.result.facts[factIndex];
          const context = {session_index: session.session_index, fact_index: factIndex,
            timestamp: session.session.timestamp};
          const settled = await Promise.allSettled((['B', 'C'] as const).map(async (arm) => {
            const local = deps(arm, history, step);
            const before = project(states[arm]);
            states[arm] = await ingestFact(states[arm], fact, context, local);
            const selected = await candidates(states[arm], fact.text, local);
            const prediction = await formalPredictV16(arm, selected, fact.text, transport,
              {arm, history, step, stage: 'decision', name: 'decision'});
            let execution_error: string | null = null;
            if (prediction.valid) {
              try {
                states[arm] = await applyDecision(states[arm], fact,
                  prediction.decision, context, local);
              } catch (error) {
                execution_error = String(error);
              }
            }
            const row = {arm, step, context, evidence: fact,
              candidates: selected.map(({embedding, ...candidate}) => candidate),
              prediction, ...(execution_error ? {execution_error} : {}),
              before, after: project(states[arm])};
            freezeWrite(path.join(dir, 'steps', `${String(step).padStart(4, '0')}-${arm}.json`), row);
            decisionIndex.push({arm, step, prediction: prediction.decision,
              valid: prediction.valid, ...(execution_error ? {execution_error} : {}),
              active: states[arm].active.length});
            return {arm, operation: prediction.decision.operation, target: prediction.decision.target,
              valid: prediction.valid, execution_error, active: states[arm].active.length};
          }));
          const failed = settled.find((item) => item.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          if ((step + 1) % 50 === 0) {
            console.log(JSON.stringify({stage: 'controllers', history, history_order: order,
              step: step + 1, facts: extracted.reduce((sum, item) => sum + item.result.facts.length, 0),
              budget: budgetBrief(transport.guard.snapshot())}));
          }
        }
      }
      const query = trajectory.queryView();
      const answers: any = {};
      const grades: any = {};
      for (const arm of ['B', 'C'] as const) {
        answers[arm] = await answerFromState(states[arm], query, deps(arm, history, step));
        const body = {model: 'openai/gpt-4o-2024-08-06', max_completion_tokens: 10,
          temperature: 0, messages: [{role: 'user', content: officialJudgePrompt(source, answers[arm].answer)}]};
        const raw = await transport.paidJudge({arm, history, step, stage: 'evaluator',
          name: 'official-qa-judge'}, body);
        const content = raw.choices?.[0]?.message?.content ?? '';
        grades[arm] = {raw: content,
          correct: /^yes\.?$/i.test(content.trim()) ? true : /^no\.?$/i.test(content.trim()) ? false : null};
      }
      freezeWrite(path.join(dir, 'qa.json'), {question_id: history, question_type: source.question_type,
        query, reference_answer: source.answer, answers, grades,
        rubric: history.includes('_abs') ? 'official abstention' : 'official knowledge-update'});
      freezeWrite(path.join(dir, 'decision_index.json'), decisionIndex);
      freezeWrite(path.join(dir, 'final_states.json'), {B: project(states.B), C: project(states.C)});
      freezeWrite(historyOutcome, {status: 'COMPLETE', order, question_id: history,
        sessions: sessions.length, extracted_facts: step, finished_at: new Date().toISOString(),
        grades: {B: grades.B.correct, C: grades.C.correct},
        active_final: {B: states.B.active.length, C: states.C.active.length},
        budget: budgetBrief(transport.guard.snapshot())});
      completed += 1;
      console.log(JSON.stringify({stage: 'history-complete', completed, total: 24, history,
        facts: step, grades: {B: grades.B.correct, C: grades.C.correct},
        active: {B: states.B.active.length, C: states.C.active.length},
        budget: budgetBrief(transport.guard.snapshot())}));
    }
    freezeWrite(path.join(ROOT, 'outcome.json'), {status: 'COMPLETE', histories: completed,
      finished_at: new Date().toISOString(), summary: transport.summary()});
    atomic(path.join(ROOT, 'status.json'), {status: 'COMPLETE', histories: completed,
      finished_at: new Date().toISOString(), budget: budgetBrief(transport.guard.snapshot())});
  } catch (error) {
    const failure = {status: 'STOPPED', histories_completed: completed, error: String(error),
      time: new Date().toISOString(), budget: budgetBrief(transport.guard.snapshot())};
    atomic(path.join(ROOT, 'status.json'), failure);
    freezeWrite(path.join(ROOT, 'failures', `${Date.now()}.json`), failure);
    console.error(String(error));
    process.exitCode = 2;
  } finally { transport.close(); }
}
main().catch((error) => { console.error(String(error)); process.exitCode = 1; });
