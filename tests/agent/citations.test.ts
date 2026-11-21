import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { clientResultBody } from '@/lib/agent/bodies';
import { answer, resume, resumeWithClientResult, type LoopDeps } from '@/lib/agent/loop';
import { findTool, toolSpecs } from '@/lib/agent/tools';
import { runTool } from '@/lib/agent/tools/run';
import type { AgentEvent, Pending, StoredMessage } from '@/lib/agent/types';
import type { ChatMessage, ChatProvider, ChatRequest, ChatResponse } from '@/lib/providers/chat/types';
import { shelfConfig } from '@/lib/shelf/config';
import type { Source } from '@/lib/types';

/* The Studio's citation search and the credits API, as the browser would call them. */
const trace = vi.hoisted(() => vi.fn());
const credits = vi.hoisted(() => ({ spend: vi.fn(), refund: vi.fn() }));
vi.mock('@/lib/engine', () => ({ traceClaim: trace }));
vi.mock('@/components/useCredits', () => {
  class OutOfCredits extends Error {
    constructor(
      public needed: number,
      public have: number,
    ) {
      super('out');
    }
  }
  return { OutOfCredits, spendCredits: credits.spend, refundCredits: credits.refund };
});

const { runFindCitations, studioPrefs, toCited } = await import('@/components/chat/citations');
const { OutOfCredits } = await import('@/components/useCredits');

const SOURCE: Source = {
  id: 's1',
  provider: 'Crossref',
  type: 'article',
  title: 'Sleep and memory consolidation',
  authors: [{ family: 'Walker', given: 'Matthew' }, { family: 'Stickgold', given: 'Robert' }],
  year: 2004,
  container: 'Neuron',
  volume: '44',
  pages: '121-133',
  doi: '10.1016/j.neuron.2004.08.031',
} as Source;

/* localStorage as the Studio leaves it. */
function storage(values: Record<string, unknown>) {
  const data = new Map(Object.entries(values).map(([k, v]) => [`cz:${k}`, JSON.stringify(v)]));
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: () => {}, removeItem: () => {} });
}

beforeEach(() => {
  trace.mockReset();
  credits.spend.mockReset().mockResolvedValue('spend_1');
  credits.refund.mockReset().mockResolvedValue(true);
  storage({});
});

describe('the citation search in the browser', () => {
  it('uses the Studio’s saved settings and charges one credit', async () => {
    storage({ prefs: { style: 'mla', yearFrom: '2000', providers: { wikipedia: false } }, settings: { email: 'me@example.org' } });
    trace.mockResolvedValue({ db: new Map([['s1', SOURCE]]), cands: [], ids: ['s1'] });
    const r = await runFindCitations({ text: 'Sleep helps consolidate memories.', count: 2 });

    expect(credits.spend).toHaveBeenCalledWith(1, 'cite');
    const [text, prefs, settings, n] = trace.mock.calls[0];
    expect([text, n]).toEqual(['Sleep helps consolidate memories.', 2]);
    expect(prefs).toMatchObject({ style: 'mla', yearFrom: '2000', providers: { wikipedia: false, openalex: true } });
    expect(settings).toEqual({ email: 'me@example.org' });
    expect(r).toMatchObject({ ok: true, sources: [{ title: 'Sleep and memory consolidation', year: 2004, link: 'https://doi.org/10.1016/j.neuron.2004.08.031', authors: 'Matthew Walker, Robert Stickgold' }] });
    expect(credits.refund).not.toHaveBeenCalled();
  });

  it('formats the reference in the asked style', () => {
    expect(toCited(SOURCE, 'apa').reference).toMatch(/^Walker, M\., & Stickgold, R\. \(2004\)\. Sleep and memory consolidation\. .*Neuron/);
    expect(toCited(SOURCE, 'mla').reference).toMatch(/^Walker, Matthew, and Robert Stickgold\./);
    expect(toCited(SOURCE, 'nope').reference).toBe(toCited(SOURCE, 'apa').reference);
  });

  it('refunds the credit when nothing is found or the search fails', async () => {
    trace.mockResolvedValueOnce({ db: new Map(), cands: [], ids: [] });
    expect(await runFindCitations({ text: 'An obscure claim' })).toMatchObject({ ok: true, sources: [], note: expect.stringContaining('no credit') });
    expect(credits.refund).toHaveBeenCalledWith('spend_1');

    trace.mockRejectedValueOnce(new Error('The databases could not be reached.'));
    expect(await runFindCitations({ text: 'Another claim' })).toEqual({ ok: false, error: 'The databases could not be reached.' });
    expect(credits.refund).toHaveBeenCalledTimes(2);
  });

  it('says so when the user is out of credits, without searching', async () => {
    credits.spend.mockRejectedValueOnce(new OutOfCredits(1, 0));
    expect(await runFindCitations({ text: 'A claim' })).toMatchObject({ ok: false, error: expect.stringContaining('out of credits') });
    expect(trace).not.toHaveBeenCalled();
  });

  it('falls back to the Studio defaults with nothing saved', () => {
    expect(studioPrefs()).toMatchObject({ style: 'apa' });
  });
});

/* ---- the server side ---- */

function scripted(...turns: Partial<ChatResponse>[]) {
  const requests: ChatRequest[] = [];
  const chat: ChatProvider = {
    name: 'fake',
    async complete(req) {
      requests.push(req);
      return { text: '', toolCalls: [], stop: 'end', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, native: { provider: 'fake', content: null }, ...turns.shift()! };
    },
  };
  return { chat, requests };
}

function harness(chat: ChatProvider) {
  const events: AgentEvent[] = [];
  const saved: StoredMessage[] = [];
  let pending: Pending | null = null;
  const deps: LoopDeps = {
    ctx: { userId: 'u1', db: null as never, sources: () => null as never, papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 }, shelfConfig: shelfConfig({}), reserveSearches: async () => {}, files: { save: async () => { throw new Error('no files'); } } } as AgentContext,
    chat,
    model: { id: 'm', provider: 'fake', label: 'M', vendorModel: 'm', inputUsdPerM: 0, outputUsdPerM: 0 },
    emit: (e) => events.push(e),
    save: async (m) => void saved.push(...m),
    setPending: async (p) => void (pending = p),
    maxTurns: 5,
    deadline: Date.now() + 60_000,
  };
  return { deps, events, pending: () => pending, history: () => saved.map((s) => s.message) };
}

const citeCall = { id: 'k1', name: 'find_citations', input: { text: 'Sleep helps memory.' } };

describe('the agent asks the browser', () => {
  it('offers find_citations as a tool that runs in the browser', async () => {
    expect(toolSpecs().map((t) => t.name)).toContain('find_citations');
    expect(findTool('find_citations')).toMatchObject({ kind: 'client' });
    expect((await runTool(null as never, 'find_citations', { text: 'Sleep helps memory.' })).outcome).toEqual({ status: 'client' });
    expect((await runTool(null as never, 'find_citations', { text: '' })).outcome).toMatchObject({ status: 'error' });
  });

  it('pauses for the browser, then carries on with what it found', async () => {
    const { chat, requests } = scripted({ toolCalls: [citeCall] }, { text: 'Walker & Stickgold (2004) support this.' });
    const h = harness(chat);
    await answer(h.deps, [], 'Find a citation for: sleep helps memory');
    expect(h.events.slice(-3)).toEqual([
      { type: 'step', callId: 'k1', name: 'find_citations', label: 'Finding sources for “Sleep helps memory.”', input: { text: 'Sleep helps memory.' } },
      { type: 'client_tool', callId: 'k1', name: 'find_citations', input: { text: 'Sleep helps memory.' }, label: 'Finding sources for “Sleep helps memory.”' },
      { type: 'done', reason: 'waiting' },
    ]);
    const pending = h.pending()!;
    expect(pending.waiting).toMatchObject({ kind: 'client', callId: 'k1' });

    const sources = [toCited(SOURCE, 'apa')];
    await resumeWithClientResult(h.deps, h.history(), pending, { ok: true, result: { found: 1, sources }, display: { sources } });
    expect(h.events.find((e) => e.type === 'step_done')).toMatchObject({ step: { status: 'done', display: { sources: [{ title: 'Sleep and memory consolidation' }] } } });
    const results = (requests[1].messages.at(-1) as Extract<ChatMessage, { role: 'tool' }>).results;
    expect(results[0].content).toMatch(/^<data tool="find_citations">/);
    expect(h.events.at(-1)).toEqual({ type: 'done', reason: 'answered' });
  });

  it('passes on a failure, and a skip, to the model', async () => {
    const a = scripted({ toolCalls: [citeCall] }, { text: 'You are out of credits.' });
    const h = harness(a.chat);
    await answer(h.deps, [], 'cite');
    await resumeWithClientResult(h.deps, h.history(), h.pending()!, { ok: false, error: 'The user is out of credits.' });
    expect((a.requests[1].messages.at(-1) as Extract<ChatMessage, { role: 'tool' }>).results[0]).toMatchObject({ isError: true, content: 'The user is out of credits.' });

    const b = scripted({ toolCalls: [citeCall] }, { text: 'Okay.' });
    const s = harness(b.chat);
    await answer(s.deps, [], 'cite');
    await resume(s.deps, s.history(), s.pending()!, false);
    expect(s.events.find((e) => e.type === 'step_done')).toMatchObject({ step: { status: 'declined' } });
  });

  it('accepts only small, well-formed results from the browser', () => {
    const src = toCited(SOURCE, 'apa');
    expect(clientResultBody.safeParse({ conversationId: 'c', callId: 'k', outcome: { ok: true, sources: [src] } }).success).toBe(true);
    expect(clientResultBody.safeParse({ conversationId: 'c', callId: 'k', outcome: { ok: true, sources: Array(11).fill(src) } }).success).toBe(false);
    expect(clientResultBody.safeParse({ conversationId: 'c', callId: 'k', outcome: { ok: true, sources: [{ ...src, reference: 'x'.repeat(5000) }] } }).success).toBe(false);
    expect(clientResultBody.safeParse({ conversationId: 'c', callId: 'k', outcome: { ok: false, error: 'nope' } }).success).toBe(true);
  });
});
