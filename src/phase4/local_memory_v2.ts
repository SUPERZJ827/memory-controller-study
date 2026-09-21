import type { QueryTimeView, WriteSessionView } from "./longmemeval_adapter.js";

export const LOCAL_MEMORY_CONFIG = Object.freeze({
  chat_model: "Qwen3-8B", embedding_model: "Qwen3-Embedding-4B",
  temperature: 0, enable_thinking: false, extraction_max_tokens: 4096,
  writer_max_tokens: 768, answer_max_tokens: 768, retrieval_k: 10,
});
export const EXTRACTION_PROMPT = `Extract significant autobiographical facts explicitly supplied by the user in this CURRENT session. Assistant turns supply context only, never independent facts about the user. Include current enduring facts, dated historical events, tentative plans, and cancellations or retractions. Preserve negation, uncertainty, attribution, temporal qualifiers, and any explicitly stated replacement or round-trip value. Do not convert a tentative claim into confirmed truth. Each text must be self-contained, faithful, and concise; retain meaningful details needed to distinguish facts. Do not infer unstated personal facts. Avoid generic advice, hypotheticals, and redundant paraphrases. source_turns contains zero-based indexes of supporting USER turns. kind is current, historical, tentative, or retracted. Return all extracted facts in one JSON object {"facts":[{"text":"...","source_turns":[0],"kind":"current"}]}. If none, return an empty facts array. Do not silently omit facts to satisfy a count limit. No explanations.`;
export const WRITER_PROMPT = `Write the memory content for the supplied ADD or UPDATE decision. The decision is already fixed. Return only JSON {"content":"..."}. ADD: faithfully express the evidence as a standalone memory. UPDATE: revise only the attribute explicitly changed by the evidence, retaining ALL unrelated attributes of the target memory. Preserve negation, uncertainty, chronology, and attribution. Do not invent facts. A return to an earlier value is a real change from the current value. Do not change the operation or select another target.`;
export const ANSWER_PROMPT = `Answer the user's question using only the retrieved memory records and dated evidence events. Events report what was said at their timestamp: tentative, historical, retracted, and superseded information is not automatically current truth. Reconcile dates and explicit changes. If the supplied records do not support an answer, say "I don't know". Give a concise direct answer without an explanation. Return only JSON {"answer":"..."}.`;

export interface LocalChatRequest {
  stage: "extraction" | "rewrite" | "answer";
  model: string;
  messages: {role: "system" | "user"; content: string}[];
  temperature: number;
  max_tokens: number;
  chat_template_kwargs: {enable_thinking: false};
  response_format: {type: "json_schema"; json_schema: {name: string; strict: true; schema: Record<string, unknown>}};
}
export interface LocalDependencies {
  /** Caller owns raw-response, token, timing, and failure logging. No retry here. */
  chat(request: LocalChatRequest): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}
export type FactKind = "current" | "historical" | "tentative" | "retracted";
export interface ExtractedFact {text: string; source_turns: number[]; kind: FactKind}
export interface Provenance {session_index: number; fact_index: number; source_turns: number[]; timestamp: string}
export interface MemoryRecord {
  id: string; content: string; created_at: string; updated_at: string;
  status: "active"; provenance: Provenance[]; embedding: number[];
}
export interface EvidenceEvent {
  id: string; text: string; kind: FactKind; timestamp: string;
  provenance: Provenance; embedding: number[];
}
export interface MemoryState {next_memory_id: number; active: MemoryRecord[]; events: EvidenceEvent[]}
export interface MemoryDecision {operation: "ADD" | "UPDATE" | "DELETE" | "NOOP"; target: string}
export interface FactContext {session_index: number; fact_index: number; timestamp: string}
export interface RetrievedRecord {
  id: string; text: string; status: string; timestamp: string; provenance: Provenance[]; score: number;
}

const FACT_SCHEMA = {type: "object", additionalProperties: false, required: ["facts"], properties: {facts: {type: "array", items: {type: "object", additionalProperties: false, required: ["text", "source_turns", "kind"], properties: {text: {type: "string"}, source_turns: {type: "array", items: {type: "integer", minimum: 0}}, kind: {type: "string", enum: ["current", "historical", "tentative", "retracted"]}}}}}};
function stringSchema(key: string): Record<string, unknown> {return {type: "object", additionalProperties: false, required: [key], properties: {[key]: {type: "string"}}};}
function request(stage: LocalChatRequest["stage"], system: string, payload: unknown, budget: number, schema: Record<string, unknown>): LocalChatRequest {
  return {stage, model: LOCAL_MEMORY_CONFIG.chat_model, temperature: 0, max_tokens: budget, chat_template_kwargs: {enable_thinking: false}, messages: [{role: "system", content: system}, {role: "user", content: JSON.stringify(payload)}], response_format: {type: "json_schema", json_schema: {name: `phase4_${stage}`, strict: true, schema}}};
}
function invariant(value: unknown, message: string): asserts value {if (!value) throw new Error(`Local memory rejected: ${message}`);}
function parseObject(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  invariant(value && typeof value === "object" && !Array.isArray(value), "expected JSON object");
  return value as Record<string, unknown>;
}
function singleString(raw: string, key: string): string {
  const obj = parseObject(raw); invariant(Object.keys(obj).length === 1 && typeof obj[key] === "string" && obj[key].trim(), `expected nonempty ${key}`); return obj[key].trim();
}
function provenance(fact: ExtractedFact, context: FactContext): Provenance {return {...context, source_turns: [...fact.source_turns]};}
function validateEmbedding(v: number[]): void {invariant(Array.isArray(v) && v.length > 0 && v.every(Number.isFinite) && v.some(x => x !== 0), "invalid embedding");}
async function embedOne(text: string, deps: LocalDependencies): Promise<number[]> {
  const embeddings = await deps.embed([text]); invariant(embeddings.length === 1, "embedding count mismatch"); validateEmbedding(embeddings[0]); return [...embeddings[0]];
}
function cosine(a: number[], b: number[]): number {
  invariant(a.length === b.length, "embedding dimensions differ");
  return a.reduce((s, x, i) => s + x * b[i], 0) / Math.sqrt(a.reduce((s, x) => s + x*x, 0) * b.reduce((s, x) => s + x*x, 0));
}
export function createMemoryState(): MemoryState {return {next_memory_id: 1, active: [], events: []};}

export async function extractSession(session: WriteSessionView, deps: LocalDependencies): Promise<ExtractedFact[]> {
  // Rebuild allowlisted payload: accidental extra query/gold fields never reach extraction.
  const payload = {timestamp: session.timestamp, turns: session.turns.map((t, index) => ({index, role: t.role, content: t.content}))};
  const parsed = parseObject(await deps.chat(request("extraction", EXTRACTION_PROMPT, payload, LOCAL_MEMORY_CONFIG.extraction_max_tokens, FACT_SCHEMA)));
  invariant(Object.keys(parsed).length === 1 && Array.isArray(parsed.facts), "expected facts array");
  return parsed.facts.map((item: unknown) => {
    invariant(item && typeof item === "object" && !Array.isArray(item), "invalid fact");
    const f = item as Record<string, unknown>;
    invariant(Object.keys(f).sort().join(",") === "kind,source_turns,text", "unexpected fact fields");
    invariant(typeof f.text === "string" && f.text.trim(), "empty fact");
    invariant(["current", "historical", "tentative", "retracted"].includes(String(f.kind)), "invalid kind");
    invariant(Array.isArray(f.source_turns) && f.source_turns.length > 0 && f.source_turns.every(i => Number.isInteger(i) && i >= 0 && i < session.turns.length && session.turns[i].role === "user"), "invalid source turns");
    return {text: f.text.trim(), kind: f.kind as FactKind, source_turns: [...new Set(f.source_turns as number[])]};
  });
}

/** Archive the observed extracted evidence once before applying each arm's decision. */
export async function ingestFact(state: MemoryState, fact: ExtractedFact, context: FactContext, deps: LocalDependencies): Promise<MemoryState> {
  const id = `E${context.session_index}_${context.fact_index}`;
  invariant(!state.events.some(e => e.id === id), "duplicate evidence event");
  const next = structuredClone(state);
  next.events.push({id, text: fact.text, kind: fact.kind, timestamp: context.timestamp, provenance: provenance(fact, context), embedding: await embedOne(fact.text, deps)});
  return next;
}

export async function candidates(state: MemoryState, evidence: string, deps: LocalDependencies): Promise<MemoryRecord[]> {
  if (!state.active.length) return [];
  const query = await embedOne(evidence, deps);
  return state.active.map(m => ({m, score: cosine(query, m.embedding)})).sort((a,b) => b.score-a.score || a.m.id.localeCompare(b.m.id)).slice(0, LOCAL_MEMORY_CONFIG.retrieval_k).map(x => structuredClone(x.m));
}

/** Invalid prediction is a recorded no-mutation state; never repaired or retried here. */
export async function applyDecision(state: MemoryState, fact: ExtractedFact, decision: MemoryDecision, context: FactContext, deps: LocalDependencies): Promise<MemoryState> {
  const next = structuredClone(state);
  if (decision.operation === "NOOP") return next;
  const index = next.active.findIndex(m => m.id === decision.target);
  if (!["ADD", "UPDATE", "DELETE"].includes(decision.operation)) return next;
  if (decision.operation === "ADD" ? decision.target !== "NONE" : index < 0) return next;
  if (decision.operation === "DELETE") {next.active.splice(index, 1); return next;}
  const target = decision.operation === "UPDATE" ? next.active[index] : undefined;
  const payload = {operation: decision.operation, timestamp: context.timestamp, evidence: fact.text, target: target ? {id: target.id, content: target.content, updated_at: target.updated_at} : null};
  const content = singleString(await deps.chat(request("rewrite", WRITER_PROMPT, payload, LOCAL_MEMORY_CONFIG.writer_max_tokens, stringSchema("content"))), "content");
  const embedding = await embedOne(content, deps);
  const prov = provenance(fact, context);
  if (target) next.active[index] = {...target, content, embedding, updated_at: context.timestamp, provenance: [...target.provenance, prov]};
  else next.active.push({id: `M${next.next_memory_id++}`, content, embedding, created_at: context.timestamp, updated_at: context.timestamp, status: "active", provenance: [prov]});
  return next;
}

export async function answerFromState(state: MemoryState, query: QueryTimeView, deps: LocalDependencies): Promise<{answer: string; retrieved: RetrievedRecord[]}> {
  const vector = await embedOne(query.question, deps);
  const records: RetrievedRecord[] = [
    ...state.active.map(m => ({id: m.id, text: m.content, status: m.status, timestamp: m.updated_at, provenance: structuredClone(m.provenance), score: cosine(vector, m.embedding)})),
    ...state.events.map(e => ({id: e.id, text: e.text, status: e.kind, timestamp: e.timestamp, provenance: [structuredClone(e.provenance)], score: cosine(vector, e.embedding)})),
  ];
  const retrieved = records.sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0, LOCAL_MEMORY_CONFIG.retrieval_k);
  const payload = {question: query.question, question_date: query.question_date, memories: retrieved.map(({score, ...r}) => r)};
  const answer = singleString(await deps.chat(request("answer", ANSWER_PROMPT, payload, LOCAL_MEMORY_CONFIG.answer_max_tokens, stringSchema("answer"))), "answer");
  return {answer, retrieved};
}
