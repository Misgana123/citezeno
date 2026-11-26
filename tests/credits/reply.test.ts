import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { BUDGET_TEXT, NO_CREDITS_TEXT, replyCredits, replyEstimate } from '@/lib/agent/credits';
import { answer, type LoopDeps } from '@/lib/agent/loop';
import type { AgentEvent, StoredMessage } from '@/lib/agent/types';
import { BudgetReached, InsufficientCredits } from '@/lib/credits/errors';
import { createWallet, type Wallet } from '@/lib/credits/wallet';
import { limitsFor, NO_PLAN } from '@/lib/plans';
import type { ChatProvider, ChatResponse } from '@/lib/providers/chat/types';
import { newMeter, withMeter } from '@/lib/providers/gateway/meter';
import { shelfConfig } from '@/lib/shelf/config';
import { openTestDb, TEST_DB_URL, type TestDb } from '../shelf/testdb';

const MODEL = { id: 'm', provider: 'fakechat', label: 'M', vendorModel: 'm', inputUsdPerM: 0.3, outputUsdPerM: 2.5 };

describe('the gateway charges each call that reaches a provider', () => {
  const policy = { provider: 'tavily', label: 'Tavily', describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }), estimateUsd: () => 0.008 };

  it('reserves the estimate first and records the real cost after', async () => {
    const log: string[] = [];
    const meter = newMeter({ before: async (p, usd) => void log.push(`before ${p} ${usd}`), after: async (c) => void log.push(`after ${c.provider} ${c.costUsd} ${c.ok} ${c.reservedUsd}`) });
    const t = withMeter(meter, policy)({ call: async () => ({ body: 'ok' as never, costUsd: 0.008, status: 200 }) });
    await t.call({});
    expect(log).toEqual(['before tavily 0.008', 'after tavily 0.008 true 0.008']);
  });

  it('never calls the provider when the reserve is refused, and records a failed call as free', async () => {
    const inner = vi.fn(async () => ({ body: 'ok' as never, costUsd: 0.008, status: 200 }));
    const refused = withMeter(newMeter({ before: async () => { throw new BudgetReached(10); }, after: async () => {} }), policy)({ call: inner });
    await expect(refused.call({})).rejects.toBeInstanceOf(BudgetReached);
    expect(inner).not.toHaveBeenCalled();
    const after = vi.fn(async () => {});
    const failing = withMeter(newMeter({ before: async () => {}, after }), policy)({ call: async () => { throw new Error('down'); } });
    await expect(failing.call({})).rejects.toThrow('down');
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ ok: false, costUsd: 0 }));
  });
});

describe('estimates before a reply', () => {
  it('shows a range within the plan cap, and none for research without a plan', () => {
    expect(replyEstimate('assistant', MODEL, limitsFor('starter'))).toMatchObject({ low: expect.any(Number), high: expect.any(Number) });
    expect(replyEstimate('research', MODEL, NO_PLAN)).toBeNull();
    const r = replyEstimate('research', { ...MODEL, inputUsdPerM: 100, outputUsdPerM: 400 }, limitsFor('starter'))!;
    expect(r.high).toBeLessThanOrEqual(80);
  });
});

/* a model that runs through the credit hooks like the gateway would */
function metered(chat: (n: number) => Partial<ChatResponse>, hooks: { before(p: string, usd: number): Promise<void>; after(c: { provider: string; label: string; costUsd: number; ok: boolean; reservedUsd: number }): Promise<void> }): ChatProvider {
  let n = 0;
  return {
    name: 'fakechat',
    async complete() {
      await hooks.before('fakechat', 0.004);
      const r = { text: '', toolCalls: [], stop: 'end' as const, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.004, native: { provider: 'fakechat', content: null }, ...chat(n++) };
      await hooks.after({ provider: 'fakechat', label: 'M', costUsd: r.costUsd, ok: true, reservedUsd: 0.004 });
      return r;
    },
  };
}

describe.skipIf(!TEST_DB_URL)('one assistant reply, one bill', { timeout: 120_000 }, () => {
  let db: TestDb;
  let w: Wallet;
  beforeAll(async () => {
    db = await openTestDb();
    w = createWallet(db.pool);
  });
  afterAll(async () => db?.close());

  const funded = async (n: number) => {
    const u = await db.addUser();
    if (n) await w.grant({ userId: u, source: 'plan', amount: n, expiresAt: new Date(Date.now() + 86_400_000), ref: `r:${u}` });
    return u;
  };

  function loop(chat: ChatProvider, userId: string, over: Partial<AgentContext> = {}) {
    const events: AgentEvent[] = [];
    const saved: StoredMessage[] = [];
    const ctx = {
      userId, db: db.pool, sources: () => { throw new Error('no papers'); }, papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 }, shelfConfig: shelfConfig({}),
      reserveSearches: async () => {}, files: {} as AgentContext['files'], webSearch: () => null, webFiles: () => { throw new Error('no web'); }, pdfText: () => { throw new Error('no'); },
      chatAttachments: async () => [], code: () => null, ...over,
    } as AgentContext;
    const deps: LoopDeps = { ctx, chat, model: MODEL, emit: (e) => events.push(e), save: async (m) => void saved.push(...m), setPending: async () => {}, maxTurns: 5, deadline: Date.now() + 60_000 };
    return { deps, events, saved };
  }

  it('holds a budget, charges the real cost of every call, and releases the rest', async () => {
    const u = await funded(50);
    const reply = replyCredits(w, { userId: u, kind: 'assistant', model: MODEL, limits: limitsFor('starter'), ttlMs: 60_000 });
    expect(await reply.start()).toBeGreaterThanOrEqual(3);
    const chat = metered((n) => (n === 0 ? { toolCalls: [{ id: 'c1', name: 'nope', input: {} }], stop: 'tool_use' } : { text: 'Done.' }), reply.calls);
    const l = loop(chat, u, { credits: reply.meter, limits: limitsFor('starter') });
    await answer(l.deps, [], 'Hi');
    // two model calls, $0.008 → 3 credits
    expect(await reply.finish({ outcome: 'answered', useful: true })).toEqual({ charged: 3 });
    expect((await w.balance(u))).toMatchObject({ total: 47, held: 0 });
  });

  it('refuses to start without enough credits for one model call', async () => {
    const u = await funded(0);
    await expect(replyCredits(w, { userId: u, kind: 'assistant', model: MODEL, limits: NO_PLAN, ttlMs: 60_000 }).start()).rejects.toBeInstanceOf(InsufficientCredits);
  });

  it('stops with a message when the reply reaches its budget, keeping room for the answer', async () => {
    const u = await funded(100);
    const pricey = { ...MODEL, inputUsdPerM: 5, outputUsdPerM: 20 };
    const reply = replyCredits(w, { userId: u, kind: 'assistant', model: pricey, limits: NO_PLAN, ttlMs: 60_000 });
    await reply.start();
    // each call reserves and costs $0.02 (7 credits): the 10-credit cap allows one
    let n = 0;
    const chat: ChatProvider = {
      name: 'fakechat',
      async complete() {
        await reply.calls.before('fakechat', 0.02);
        await reply.calls.after({ provider: 'fakechat', label: 'M', costUsd: 0.02, ok: true, reservedUsd: 0.02 });
        return { text: '', toolCalls: [{ id: `c${n++}`, name: 'nope', input: {} }], stop: 'tool_use', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.02, native: { provider: 'fakechat', content: null } };
      },
    };
    const l = loop(chat, u, { credits: reply.meter, limits: NO_PLAN });
    await answer(l.deps, [], 'Go');
    expect(l.events.at(-1)).toEqual({ type: 'done', reason: 'credits' });
    expect(l.events.some((e) => e.type === 'text' && e.text === BUDGET_TEXT)).toBe(true);
    // tool steps can't use the room kept for the final answer
    await expect(reply.calls.before('tavily', 0.02)).rejects.toBeInstanceOf(BudgetReached);
    expect((await reply.finish({ outcome: 'credits', useful: true }))!.charged).toBeLessThanOrEqual(10);
  });

  it('a failed reply that gave nothing is free', async () => {
    const u = await funded(20);
    const reply = replyCredits(w, { userId: u, kind: 'assistant', model: MODEL, limits: limitsFor('scholar'), ttlMs: 60_000 });
    await reply.start();
    await reply.calls.before('fakechat', 0.004);
    await reply.calls.after({ provider: 'fakechat', label: 'M', costUsd: 0.004, ok: true, reservedUsd: 0.004 });
    expect(await reply.finish({ outcome: 'failed', useful: false })).toEqual({ charged: 0 });
    expect((await w.balance(u)).total).toBe(20);
  });

  it('caps web searches per reply at the plan limit', async () => {
    const u = await funded(50);
    const search = vi.fn(async () => []);
    const calls = [1, 2, 3].map((i) => ({ id: `w${i}`, name: 'web_search', input: { query: `q${i}` } }));
    let n = 0;
    const chat: ChatProvider = {
      name: 'fakechat',
      async complete() {
        const r = n++ === 0 ? { toolCalls: calls, stop: 'tool_use' as const, text: '' } : { toolCalls: [], stop: 'end' as const, text: 'ok' };
        return { ...r, usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, native: { provider: 'fakechat', content: null } };
      },
    };
    const l = loop(chat, u, { limits: NO_PLAN, webSearch: () => ({ name: 'fake', search }) as never });
    await answer(l.deps, [], 'Search');
    const steps = l.events.filter((e): e is Extract<AgentEvent, { type: 'step_done' }> => e.type === 'step_done');
    expect(steps.map((s) => s.step.status)).toEqual(['done', 'done', 'error']);
    expect(steps[2].step.error).toContain('2 web searches');
  });

  it('says so when the user runs out of credits mid-reply', () => {
    expect(NO_CREDITS_TEXT).toContain('out of credits');
  });
});
