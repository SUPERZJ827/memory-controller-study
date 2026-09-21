import type {WriteSessionView} from "./longmemeval_adapter.js";
import type {ExtractedFact, MemoryDecision, RetrievedRecord} from "./local_memory_v2.js";

/** These are review prompts, not automated faithfulness judgments or gold labels. */
export const OFFLINE_AUDIT_NOTICE = "Lexical flags are conservative screening heuristics, not validated error labels. Review exact source text and target/evidence/output side by side. No model or API calls.";
const CUES = {
  uncertainty: /\b(may|might|maybe|perhaps|consider(?:ing)?|tentative(?:ly)?|thinking about|possibly|if)\b/gi,
  negation_or_retraction: /\b(not|never|no longer|cancel(?:led|ed|lation)?|retract(?:ed)?|don't|doesn't|didn't|won't|isn't|wasn't)\b/gi,
  temporal: /\b(yesterday|today|tomorrow|last|next|previously|formerly|currently|used to|now|since|until|again|back)\b/gi,
};
function matches(text: string, pattern: RegExp): string[] {return [...new Set([...text.matchAll(pattern)].map(m => m[0].toLowerCase()))];}
function numbers(text: string): string[] {return matches(text, /\b\d+(?:[.:/-]\d+)*\b/g);}
function lexicalFlags(source: string, result: string): string[] {
  const flags: string[] = [];
  for (const [name, regex] of Object.entries(CUES)) if (matches(source, regex).length && !matches(result, regex).length) flags.push(`source_${name}_cue_absent_in_output`);
  if (numbers(result).some(n => !numbers(source).includes(n))) flags.push("output_numeric_literal_absent_in_source");
  return flags;
}
export function auditExtraction(session: WriteSessionView, facts: ExtractedFact[]) {
  const cited = new Set(facts.flatMap(f => f.source_turns));
  return {
    notice: OFFLINE_AUDIT_NOTICE,
    timestamp: session.timestamp,
    fact_count: facts.length,
    all_source_turns: session.turns.map((t, index) => ({index, role: t.role, content: t.content})),
    // Uncovered turns often contain greetings; absence is not automatically omission.
    uncited_user_turn_indexes: session.turns.flatMap((t,i) => t.role === "user" && !cited.has(i) ? [i] : []),
    facts: facts.map((fact, fact_index) => {
      const source = fact.source_turns.map(index => ({index, role: session.turns[index]?.role ?? "MISSING", content: session.turns[index]?.content ?? ""}));
      const text = source.map(t => t.content).join("\n");
      const flags = lexicalFlags(text, fact.text);
      if (!source.length || source.some(t => t.role !== "user")) flags.push("invalid_user_provenance");
      if (fact.kind === "current" && matches(fact.text, CUES.uncertainty).length) flags.push("current_kind_with_uncertainty_cue");
      return {fact_index, fact: structuredClone(fact), exact_supporting_turns: source, lexical_review_flags: flags};
    }),
  };
}
export function auditWriter(target: string | null, evidence: string, decision: MemoryDecision, output: string) {
  const evidenceWords = new Set(evidence.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const outputWords = new Set(output.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  // Expose potential discarded attributes for manual checking, without asserting
  // all target clauses should persist: the evidence may replace a whole clause.
  const targetClauses = target?.split(/(?<=[.;])\s+|\s+and\s+/i).filter(Boolean) ?? [];
  const clausesWithAbsentWords = targetClauses.map(clause => ({clause, target_only_words_absent_in_output: [...new Set(clause.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].filter(w => !evidenceWords.has(w) && !outputWords.has(w))})).filter(c => c.target_only_words_absent_in_output.length > 0);
  return {notice: OFFLINE_AUDIT_NOTICE, decision: {...decision}, original_target: target, current_evidence: evidence, writer_output: output,
    lexical_review_flags: lexicalFlags([target, evidence].filter(Boolean).join("\n"), output),
    target_clauses_to_check_for_unrelated_attribute_loss: clausesWithAbsentWords};
}
export function auditRetrieval(records: RetrievedRecord[]) {
  return {notice: "Retrieved sources show availability, not causal answer reliance.", total: records.length,
    active_count: records.filter(r => r.status === "active").length,
    archive_count: records.filter(r => r.status !== "active").length,
    records: records.map(r => ({id:r.id,status:r.status,timestamp:r.timestamp,provenance:r.provenance}))};
}
