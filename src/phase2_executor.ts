export type MemoryOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';

export type StateEntry = {
  id: string;
  semantic_target_id: string;
  target_name: string;
  value: string;
};

export type Prediction = {
  operation: MemoryOperation;
  target: string;
};

export type StepPayload = {
  semantic_target_id: string;
  target_name: string;
  old_value: string | null;
  new_value: string | null;
};

export type ExecutionResult = {
  state: StateEntry[];
  action: string;
  error: string | null;
};

export function cloneState(state: StateEntry[]): StateEntry[] {
  return state.map(item => ({ ...item }));
}

export function renderState(state: StateEntry[]) {
  return state
    .map(item => ({ id: item.id, content: `${item.target_name}: ${item.value}` }))
    .sort((a, b) => numericId(a.id) - numericId(b.id) || a.id.localeCompare(b.id));
}

function numericId(id: string): number {
  const match = /^M(\d+)$/.exec(id);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function statesEqual(a: StateEntry[], b: StateEntry[]): boolean {
  const canonical = (state: StateEntry[]) =>
    [...state]
      .sort((x, y) => x.id.localeCompare(y.id))
      .map(item => ({ ...item }));
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function allocateId(
  state: StateEntry[],
  canonicalId: string,
  maxCanonicalId: number,
): string {
  if (!state.some(item => item.id === canonicalId)) return canonicalId;
  const used = new Set(state.map(item => item.id));
  let next = maxCanonicalId + 1;
  while (used.has(`M${next}`)) next += 1;
  return `M${next}`;
}

export function executePrediction(args: {
  state: StateEntry[];
  prediction: Prediction;
  payload: StepPayload;
  canonicalId: string;
  maxCanonicalId: number;
}): ExecutionResult {
  const state = cloneState(args.state);
  const { operation, target } = args.prediction;

  if ((operation === 'ADD' || operation === 'NOOP') && target !== 'NONE') {
    return {
      state,
      action: 'invalid_target_no_state_change',
      error: `${operation} requires target NONE`,
    };
  }
  if (operation === 'UPDATE' || operation === 'DELETE') {
    const index = state.findIndex(item => item.id === target);
    if (target === 'NONE' || index < 0) {
      return {
        state,
        action: 'invalid_target_no_state_change',
        error: `${operation} target ${target} is not an active candidate`,
      };
    }
    if (operation === 'DELETE') {
      state.splice(index, 1);
      return { state, action: `deleted:${target}`, error: null };
    }
    state[index] = {
      ...state[index],
      target_name: args.payload.target_name,
      value: args.payload.new_value ?? '__NULL_PAYLOAD__',
    };
    return { state, action: `updated:${target}`, error: null };
  }
  if (operation === 'ADD') {
    const id = allocateId(state, args.canonicalId, args.maxCanonicalId);
    state.push({
      id,
      semantic_target_id: args.payload.semantic_target_id,
      target_name: args.payload.target_name,
      value: args.payload.new_value ?? '__NULL_PAYLOAD__',
    });
    return { state, action: `added:${id}`, error: null };
  }
  return { state, action: 'noop', error: null };
}

