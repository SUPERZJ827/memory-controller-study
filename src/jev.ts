import dotenv from 'dotenv';
import { OpenRouter } from '@openrouter/sdk';

dotenv.config({ path: '.env.local' });

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is missing from the environment or .env.local');
}

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const MODEL = 'typesafe/jev-1.13' as const;

export type MemoryOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';
export type Memory = { id: string; content: string };

export const OPERATION_CRITERIA = {
  ADD:
    'The new fact represents persistent information worth storing and is not already represented by an existing candidate memory.',
  UPDATE:
    'The new fact clearly changes, replaces, or updates the current value or state of an existing persistent memory about the same object or attribute.',
  DELETE:
    'The new information explicitly requires an existing memory to be removed or forgotten, without providing a new persistent replacement value.',
  NOOP:
    'No long-term memory mutation should be performed because the information is duplicate or a paraphrase, temporary, tentative, hypothetical, uncertain, irrelevant to long-term memory, or insufficient to support a state change.',
} as const;

export const OPERATION_INSTRUCTIONS =
  'Choose exactly one memory operation under the fixed policy in the criteria. Apply the policy to the supplied new fact and all candidate memories. Do not infer a definite state change from tentative, hypothetical, or uncertain language.';

export type EvaluationCall = {
  choice: string;
  probabilities: Record<string, number>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost?: number;
  };
  providerMetadata: unknown;
};

function getChoiceAnswer(
  answer: { type: string; choice?: string; probabilities?: Record<string, number> },
) {
  if (answer.type !== 'choice' || typeof answer.choice !== 'string') {
    throw new Error(`Expected a choice answer, received type: ${answer.type}`);
  }
  return {
    choice: answer.choice,
    probabilities: answer.probabilities ?? {},
  };
}

export async function predictOperation(
  existingMemories: Memory[],
  newFact: string,
): Promise<EvaluationCall & { choice: MemoryOperation }> {
  const result = await openRouter.alpha.decisions.create({
    decisionsRequest: {
      model: MODEL,
      state: { existingMemories, newFact },
      questions: {
        operation: {
          type: 'choice',
          instructions: OPERATION_INSTRUCTIONS,
          criteria: OPERATION_CRITERIA,
        },
      },
    },
  });

  const answer = getChoiceAnswer(result.answers.operation);
  return {
    choice: answer.choice as MemoryOperation,
    probabilities: answer.probabilities,
    usage: result.usage,
    providerMetadata: {
      id: result.id,
      model: result.model,
      provider: result.provider,
    },
  };
}

export async function predictTarget(
  existingMemories: Memory[],
  newFact: string,
  predictedOperation: 'UPDATE' | 'DELETE',
): Promise<EvaluationCall> {
  if (existingMemories.length === 0) {
    throw new Error('Target prediction requires at least one candidate memory.');
  }

  const criteria = Object.fromEntries(
    existingMemories.map(memory => [
      memory.id,
      `Select ${memory.id} only if it is the existing memory that the ${predictedOperation} operation must act on: ${memory.content}`,
    ]),
  );

  const result = await openRouter.alpha.decisions.create({
    decisionsRequest: {
      model: MODEL,
      state: { existingMemories, newFact, predictedOperation },
      questions: {
        target: {
          type: 'choice',
          instructions:
            'Choose exactly one existing memory ID as the target of the supplied predicted operation. Base the choice only on which candidate memory the new fact changes or explicitly asks to forget.',
          criteria,
        },
      },
    },
  });

  const answer = getChoiceAnswer(result.answers.target);
  return {
    choice: answer.choice,
    probabilities: answer.probabilities,
    usage: result.usage,
    providerMetadata: {
      id: result.id,
      model: result.model,
      provider: result.provider,
    },
  };
}

const SENSITIVE_KEY =
  /(api[-_]?key|authorization|credential|secret|token|password|cookie|set-cookie)/i;
const CREDENTIAL_VALUE = /^(bearer\s+|sk[-_]|[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,})/i;

export function sanitizeProviderMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeProviderMetadata);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeProviderMetadata(item),
      ]),
    );
  }
  if (typeof value === 'string' && CREDENTIAL_VALUE.test(value)) {
    return '[REDACTED]';
  }
  return value;
}
