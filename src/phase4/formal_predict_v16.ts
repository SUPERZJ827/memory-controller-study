import fs from 'node:fs';
import { OPERATION_CRITERIA, OPERATION_INSTRUCTIONS, MODEL } from '../jev.js';
import { FormalTransportV16 } from './formal_transport_v16.js';
import type { Context } from './pilot_transport_v2.js';
import type { MemoryDecision, MemoryRecord } from './local_memory_v2.js';

const protocol = JSON.parse(fs.readFileSync('phase3/gpt56sol_protocol.json', 'utf8'));
export interface FormalPredictionV16 {
  decision: MemoryDecision;
  valid: boolean;
  error: string | null;
  probabilities: unknown;
  call_ids: string[];
}

export async function formalPredictV16(
  arm: 'B' | 'C', memories: MemoryRecord[], evidence: string,
  transport: FormalTransportV16, ctx: Context,
): Promise<FormalPredictionV16> {
  const existingMemories = memories.map(({id, content}) => ({id, content}));
  const start = transport.calls.length;
  let operation = 'INVALID';
  let target = 'NONE';
  let probabilities: unknown = null;
  let error: string | null = null;
  if (arm === 'B') {
    const responseFormat = structuredClone(protocol.response_format);
    delete responseFormat.json_schema.schema.properties.target.enum_template;
    responseFormat.json_schema.schema.properties.target.enum = ['NONE', ...existingMemories.map((m) => m.id)];
    const raw = await transport.paidControllerChat({...ctx, name: 'gpt-decision'}, {
      model: protocol.model, reasoning: protocol.reasoning,
      max_completion_tokens: protocol.max_completion_tokens,
      messages: [
        {role: 'system', content: protocol.system_prompt},
        {role: 'user', content: JSON.stringify({current_valid_memory_state: existingMemories,
          current_evidence: evidence, candidate_memory_ids: existingMemories.map((m) => m.id)})},
      ], response_format: responseFormat,
    });
    try {
      const object = JSON.parse(raw.choices?.[0]?.message?.content ?? '');
      if (Object.keys(object).sort().join(',') !== 'operation,target') throw new Error('Unexpected JSON fields');
      operation = object.operation;
      target = object.target;
      if (raw.choices?.[0]?.finish_reason === 'length') throw new Error('Truncated controller output');
    } catch (caught) { error = String(caught); }
  } else {
    const raw = await transport.paidControllerDecision({...ctx, name: 'jev-operation'}, {
      model: MODEL, state: {existingMemories, newFact: evidence},
      questions: {operation: {type: 'choice', instructions: OPERATION_INSTRUCTIONS,
        criteria: OPERATION_CRITERIA}},
    });
    operation = raw.answers?.operation?.choice ?? 'INVALID';
    probabilities = {operation: raw.answers?.operation?.probabilities ?? null};
    if ((operation === 'UPDATE' || operation === 'DELETE') && existingMemories.length) {
      const targetRaw = await transport.paidControllerDecision({...ctx, name: 'jev-target'}, {
        model: MODEL, state: {existingMemories, newFact: evidence, predictedOperation: operation},
        questions: {target: {type: 'choice',
          instructions: 'Choose exactly one existing memory ID as the target of the supplied predicted operation. Base the choice only on which candidate memory the new fact changes or explicitly asks to forget.',
          criteria: Object.fromEntries(existingMemories.map((memory) => [memory.id,
            `Select ${memory.id} only if it is the existing memory that the ${operation} operation must act on: ${memory.content}`]))}},
      });
      target = targetRaw.answers?.target?.choice ?? 'INVALID';
      probabilities = {...(probabilities as object), target: targetRaw.answers?.target?.probabilities ?? null};
    }
  }
  const valid = !error && ['ADD', 'UPDATE', 'DELETE', 'NOOP'].includes(operation) &&
    (['ADD', 'NOOP'].includes(operation) ? target === 'NONE' : existingMemories.some((m) => m.id === target));
  if (!valid && !error) error = 'Invalid operation/target contract; preserve state, no repair';
  return {decision: {operation: operation as MemoryDecision['operation'], target}, valid, error,
    probabilities, call_ids: transport.calls.slice(start)
      .filter((call) => call.context.arm === arm && call.context.step === ctx.step && call.paid)
      .map((call) => call.id)};
}
