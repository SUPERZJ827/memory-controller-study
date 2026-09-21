import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { BudgetGuard, type BudgetPool } from './budget_guard_v2.js';
import { Phase4Ledger } from './ledger.js';
import { makeCallKey, hashJson } from './hash.js';
import { boundedChatRequest, boundedDecisionRequest, type Context, type RawCall } from './pilot_transport_v2.js';

dotenv.config({path: '.env.local', quiet: true});

const safe = (s: string) => s.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
const usage = (raw: any) => ({
  input_tokens: raw.usage?.input_tokens ?? raw.usage?.prompt_tokens ?? 0,
  output_tokens: raw.usage?.output_tokens ?? raw.usage?.completion_tokens ?? 0,
  reasoning_tokens: raw.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  cached_input_tokens: raw.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  cost_usd: typeof raw.usage?.cost === 'number' ? raw.usage.cost : null,
});

export class FormalTransportV16 {
  readonly guard: BudgetGuard;
  readonly ledger: Phase4Ledger;
  readonly calls: RawCall[] = [];
  private readonly localKey: string;

  constructor(readonly dir: string, readonly manifest: any) {
    fs.mkdirSync(path.join(dir, 'calls'), {recursive: true});
    const config = JSON.parse(fs.readFileSync('phase4/budget_config_v2.json', 'utf8'));
    this.guard = new BudgetGuard('results/phase4_low_budget_v2/campaign_budget.sqlite', config);
    this.ledger = new Phase4Ledger(path.join(dir, 'ledger.sqlite'), 'formal-24-v17', manifest);
    this.localKey = process.env.PHASE4_LOCAL_API_KEY ??
      fs.readFileSync('src/phase2_controllers.ts', 'utf8').match(/process\.env\.OPENROUTER_API_KEY\s*:\s*'([^']+)'/)?.[1] ?? '';
    if (!this.localKey) throw new Error('Local service credential missing');
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing');
  }

  private persist(call: RawCall, attemptNo: number, success: boolean): void {
    const target = success
      ? path.join(this.dir, 'calls', call.id + '.json')
      : path.join(this.dir, 'failed_attempts', `${call.id}.attempt${attemptNo}.json`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target + '.tmp', JSON.stringify(call, null, 2) + '\n');
    fs.renameSync(target + '.tmp', target);
    this.calls.push(call);
  }

  private async request(
    ctx: Context,
    body: any,
    url: string,
    paid: boolean,
    pool: BudgetPool | null,
    upperMicroUsd = 0,
  ): Promise<any> {
    const requestHash = hashJson(body);
    const identity = {manifestHash: this.ledger.manifestHash, stage: ctx.stage, scope: ctx.arm,
      trajectoryId: ctx.history, stepIndex: ctx.step, logicalCallId: ctx.name, request: body};
    const key = makeCallKey(identity);
    const durable = path.join(this.dir, 'calls', key + '.json');
    const previous = this.ledger.getSuccessfulAttempt(key);
    if (previous) {
      if (!fs.existsSync(durable)) throw new Error('Successful ledger call missing durable raw output: ' + key);
      const saved = JSON.parse(fs.readFileSync(durable, 'utf8')) as RawCall;
      this.calls.push({...saved, cache_hit: true});
      return saved.response;
    }
    if (paid && !pool) throw new Error('Paid request has no budget pool');
    if (!paid && this.ledger.countDispatchedAttempts(key) >= 4) {
      throw new Error('Local transport retry limit exceeded for ' + key);
    }
    let reservationId = key;
    let effectivePool = pool;
    if (paid) {
      const priorReservation = this.guard.getReservation(key);
      if (priorReservation) {
        const priorAttempts = this.ledger.countDispatchedAttempts(key);
        const priorRawPath = path.join(this.dir, 'failed_attempts', `${key}.attempt1.json`);
        if (priorAttempts !== 1 || !fs.existsSync(priorRawPath)) {
          throw new Error('Paid infrastructure retry prerequisites not met: ' + key);
        }
        const priorRaw = JSON.parse(fs.readFileSync(priorRawPath, 'utf8')) as RawCall;
        const retryableHttp = typeof priorRaw.http_status === 'number' && priorRaw.http_status >= 500;
        const retryableTransport = priorRaw.response === null && typeof priorRaw.error === 'string';
        if (!priorRaw.paid || hashJson(priorRaw.request as any) !== requestHash ||
            (!retryableHttp && !retryableTransport)) {
          throw new Error('Prior paid failure is not eligible for infrastructure retry: ' + key);
        }
        reservationId = `${key}.infra-retry1`;
        effectivePool = 'formal_aux';
        if (this.guard.getReservation(reservationId)) {
          throw new Error('Paid infrastructure retry already reserved or dispatched: ' + key);
        }
      }
      this.guard.reserve({id: reservationId, pool: effectivePool!, upperMicroUsd, requestHash});
    }
    const handle = this.ledger.beginAttempt({callKey: key, stage: ctx.stage, scope: ctx.arm,
      trajectoryId: ctx.history, stepIndex: ctx.step, logicalCallId: ctx.name,
      requestHash, request: body, model: body.model, provider: paid ? 'OpenRouter' : 'local-vLLM'});
    if (paid) this.guard.markDispatched(reservationId);
    const started = performance.now();
    let response: Response;
    let raw: any;
    try {
      response = await fetch(url, {method: 'POST', headers: {
        Authorization: 'Bearer ' + (paid ? process.env.OPENROUTER_API_KEY : this.localKey),
        'Content-Type': 'application/json',
        ...(paid ? {'X-Title': 'Jev Memory Phase4 frozen formal B-C'} : {}),
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(paid ? 90_000 : 360_000)});
      const content = await response.text();
      try { raw = JSON.parse(content); } catch { raw = {unparsed_body: content}; }
    } catch (error) {
      const message = safe(String(error));
      if (paid) this.guard.markUnknown(reservationId);
      const latency = performance.now() - started;
      this.ledger.failAttempt({...handle, latencyMs: latency,
        errorKind: 'transport_unknown_billing', errorMessage: message});
      this.persist({id: key, context: ctx, model: body.model, request: body, response: null,
        usage: {input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cached_input_tokens: 0,
          cost_usd: paid ? null : 0}, latency_ms: latency, paid, error: message,
        reservation_micro_usd: upperMicroUsd}, handle.attemptNo, false);
      throw new Error(message);
    }
    const measured = usage(raw);
    if (!paid) measured.cost_usd = 0;
    const latency = performance.now() - started;
    const record: RawCall = {id: key, context: ctx, model: body.model, request: body, response: raw,
      usage: measured, latency_ms: latency, paid, http_status: response.status,
      reservation_micro_usd: upperMicroUsd};
    if (paid) {
      if (measured.cost_usd === null) this.guard.markUnknown(reservationId);
      else this.guard.settle(reservationId, Math.ceil(measured.cost_usd * 1e6 - 1e-9));
    }
    const attributions = (ctx.arm === 'shared' ? ['B', 'C'] : [ctx.arm]).map((armId) => ({
      armId, standaloneCostUsd: measured.cost_usd ?? 0, inputTokens: measured.input_tokens,
      outputTokens: measured.output_tokens, reasoningTokens: measured.reasoning_tokens,
      cachedInputTokens: measured.cached_input_tokens,
      note: paid ? `Provider invoice; ${effectivePool} pool` : 'Local work; hardware cost unmonetized',
    }));
    if (!response.ok) {
      this.persist(record, handle.attemptNo, false);
      this.ledger.failAttempt({...handle, latencyMs: latency, errorKind: 'http_error',
        errorMessage: 'HTTP ' + response.status,
        usage: {inputTokens: measured.input_tokens, outputTokens: measured.output_tokens,
          reasoningTokens: measured.reasoning_tokens, cachedInputTokens: measured.cached_input_tokens},
        actualPhysicalCostUsd: measured.cost_usd ?? 0, providerMetadata: raw, attributions});
      throw new Error(`HTTP ${response.status}; retry requires a fresh resumed run; see ${record.id}`);
    }
    this.persist(record, handle.attemptNo, true);
    this.ledger.completeAttempt({...handle, latencyMs: latency,
      usage: {inputTokens: measured.input_tokens, outputTokens: measured.output_tokens,
        reasoningTokens: measured.reasoning_tokens, cachedInputTokens: measured.cached_input_tokens},
      actualPhysicalCostUsd: measured.cost_usd ?? 0, response: raw,
      providerMetadata: {id: raw.id ?? null, provider: raw.provider ?? null,
        billing_known: measured.cost_usd !== null}, attributions});
    return raw;
  }

  async localChat(ctx: Context, body: any): Promise<string> {
    const raw = await this.request(ctx, body, 'http://127.0.0.1:9910/v1/chat/completions', false, null);
    if (raw.choices?.[0]?.finish_reason === 'length') throw new Error('Truncated');
    const content = raw.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Missing local chat content');
    return content;
  }

  async embed(ctx: Context, texts: string[]): Promise<number[][]> {
    const raw = await this.request(ctx, {model: 'Qwen3-Embedding-4B', input: texts},
      'http://127.0.0.1:9010/v1/embeddings', false, null);
    if (!Array.isArray(raw.data) || raw.data.length !== texts.length) throw new Error('Embedding shape mismatch');
    return raw.data.sort((a: any, b: any) => a.index - b.index).map((x: any) => x.embedding);
  }

  async paidControllerChat(ctx: Context, body: any): Promise<any> {
    const bounded = boundedChatRequest(body);
    return this.request(ctx, bounded.request, 'https://openrouter.ai/api/v1/chat/completions', true,
      'formal_controllers', bounded.upperMicroUsd);
  }

  async paidControllerDecision(ctx: Context, body: any): Promise<any> {
    const bounded = boundedDecisionRequest(body);
    return this.request(ctx, bounded.request, 'https://openrouter.ai/api/alpha/decisions', true,
      'formal_controllers', bounded.upperMicroUsd);
  }

  async paidJudge(ctx: Context, body: any): Promise<any> {
    const bounded = boundedChatRequest(body);
    return this.request(ctx, bounded.request, 'https://openrouter.ai/api/v1/chat/completions', true,
      'formal_qa', bounded.upperMicroUsd);
  }

  summary(): any { return {budget: this.guard.snapshot(), ledger: this.ledger.summarizeCosts(), calls: this.calls.length}; }
  close(): void { this.ledger.close(); this.guard.close(); }
}
