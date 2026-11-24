import { describe, expect, it, vi } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import type { LoopDeps } from '@/lib/agent/loop';
import { jsonIn, research, sourcesSection } from '@/lib/agent/research';
import type { AgentEvent, StoredMessage } from '@/lib/agent/types';
import { toView } from '@/lib/agent/view';
import type { ChatProvider, ChatRequest, ChatResponse } from '@/lib/providers/chat/types';
import { shelfConfig } from '@/lib/shelf/config';
import { sourcesOver } from '../papers/fake-openalex';

const MODEL = { id: 'test', provider: 'fake', label: 'Test', vendorModel: 't', inputUsdPerM: 1, outputUsdPerM: 1 };

function scripted(...turns: Partial<ChatResponse>[]) {
  const requests: ChatRequest[] = [];
  const chat: ChatProvider = {
    name: 'fake',
    async complete(req) {
      requests.push(req);
      const t = turns.shift();
      if (!t) throw new Error('script ran out');
      return { text: '', toolCalls: [], stop: 'end', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.01, native: { provider: 'fake', content: null }, ...t };
    },
  };
  return { chat, requests };
}

const openAlex = vi.fn(async () => ({
  body: { meta: { count: 1 }, results: [{ id: 'https://openalex.org/W1', display_name: 'Sleep and memory', publication_year: 2020, abstract_inverted_index: { Sleep: [0], helps: [1] } }] },
  costUsd: 0,
  status: 200,
}));

function harness(chat: ChatProvider, opts: { web?: boolean; deadline?: number } = {}) {
  const events: AgentEvent[] = [];
  const saved: StoredMessage[] = [];
  const search = vi.fn(async (q: string) => [{ title: `Page about ${q}`, url: `https://news.example/${encodeURIComponent(q)}`, snippet: 'A snippet.', published: '2025-01-02' }]);
  const ctx: AgentContext = {
    userId: 'u1',
    db: null as never,
    sources: () => sourcesOver(openAlex as never),
    papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
    shelfConfig: shelfConfig({}),
    reserveSearches: vi.fn(async () => {}),
    webSearch: () => (opts.web === false ? null : { name: 'fake', search }),
    webFiles: () => ({ name: 'fake', fetchPdf: vi.fn(), fetchPage: vi.fn(async (url: string) => ({ title: 'Read page', text: `Full text of ${url}. `.repeat(30), finalUrl: url })) }),
    pdfText: () => null as never,
    chatAttachments: async () => [], code: () => null,
    files: { save: vi.fn(), read: vi.fn(async () => null), readShelfPdf: vi.fn(async () => null) },
  };
  const deps: LoopDeps = {
    ctx,
    chat,
    model: MODEL,
    emit: (e) => events.push(e),
    save: async (m) => void saved.push(...m),
    setPending: async () => {},
    maxTurns: 10,
    deadline: opts.deadline ?? Date.now() + 240_000,
  };
  return { deps, events, saved, search };
}

describe('deep research helpers', () => {
  it('finds the JSON in a model’s reply', () => {
    expect(jsonIn('Sure!\n```json\n{"subQuestions": ["a"]}\n```')).toEqual({ subQuestions: ['a'] });
    expect(jsonIn('no json here')).toBeNull();
    expect(jsonIn('{broken')).toBeNull();
  });

  it('lists numbered sources, flagging retracted papers', () => {
    const text = sourcesSection([
      { n: 1, key: 'u', kind: 'web', title: 'WHO page', url: 'https://who.int/x', date: '2025-01-02', text: '' },
      { n: 2, key: 'p', kind: 'paper', title: 'Old study', url: 'https://doi.org/10.1/x', date: '2001', authors: 'Lee', retracted: true, text: '' },
    ]);
    expect(text).toContain('## Sources');
    expect(text).toContain('1. [1] WHO page. https://who.int/x (2025-01-02)');
    expect(text).toContain('2. [2] Lee (2001). Old study (retracted). https://doi.org/10.1/x');
  });
});

describe('deep research', () => {
  it('plans, searches the web and papers, reads pages, checks for gaps, and writes a cited report', async () => {
    const { chat, requests } = scripted(
      { text: '{"subQuestions": ["sleep and memory", "sleep in teens"]}' },
      { text: '{"followUps": ["sleep and grades"]}' },
      { text: '# Sleep and learning\n\nSleep helps memory [1].' },
    );
    const h = harness(chat);
    await research(h.deps, 'How does sleep affect learning?');

    const names = h.events.filter((e) => e.type === 'step').map((e) => (e as { name: string }).name);
    expect(names[0]).toBe('deep_research');
    expect(names).toEqual(expect.arrayContaining(['web_search', 'web_fetch', 'search_papers']));
    expect(h.search).toHaveBeenCalledTimes(3); // two planned questions and one follow-up

    // the writer gets numbered sources as data, and nothing else to call
    const write = requests[2];
    expect(write.tools).toEqual([]);
    expect(write.messages[0]).toMatchObject({ role: 'user' });
    expect((write.messages[0] as { text: string }).text).toMatch(/<data tool="sources">/);

    const report = h.events.find((e) => e.type === 'text') as { text: string };
    expect(report.text).toMatch(/^# Sleep and learning/);
    expect(report.text).toContain('## Sources');
    expect(report.text).toContain('Sleep and memory');
    expect(h.events.at(-1)).toEqual({ type: 'done', reason: 'answered' });

    // saved as the question and the report, with the steps on the report and the cost of every model call
    expect(h.saved.map((s) => s.message.role)).toEqual(['user', 'assistant']);
    const last = h.saved[1];
    expect(last.costUsd).toBeCloseTo(0.03);
    const writing = last.ui!.find((s) => s.label === 'Writing the report')!;
    expect(writing.display?.refs).toBeTruthy();
    expect(Object.values(writing.display!.refs!)).not.toHaveLength(0);
    // the plan is on its step, and every search and read sits under the plan question it looked into
    expect(last.ui!.find((s) => s.label === 'Planning the research')?.display?.plan).toEqual(['sleep and memory', 'sleep in teens']);
    expect(last.ui!.filter((s) => s.name !== 'deep_research').every((s) => typeof s.part === 'number' && !!s.kind && !!s.line?.did)).toBe(true);
    expect(new Set(last.ui!.filter((s) => s.name === 'search_papers').map((s) => s.part))).toEqual(new Set([0, 1, 2]));
    expect(writing.line?.did).toBe('Wrote the report');
    // paper searches don't list their papers; the report's sources do
    expect(last.ui!.filter((s) => s.name === 'search_papers').every((s) => !s.display?.papers)).toBe(true);

    const view = toView({ id: 'c', title: 't', model: 'test', pinned: false, webSearch: false, pending: null, costUsd: 0, createdAt: '', updatedAt: '' }, h.saved);
    expect(view.entries.map((e) => e.kind)).toEqual(['user', 'steps', 'assistant']);
  });

  it('researches papers only when web search isn’t set up', async () => {
    const { chat } = scripted({ text: '{"subQuestions": ["a question"]}' }, { text: '{"followUps": []}' }, { text: '# Report\n\nText [1].' });
    const h = harness(chat, { web: false });
    await research(h.deps, 'A question?');
    const names = h.events.filter((e) => e.type === 'step').map((e) => (e as { name: string }).name);
    expect(names).not.toContain('web_search');
    expect(names).toContain('search_papers');
  });

  it('skips the searches when time is short, and says when nothing was found', async () => {
    const { chat } = scripted({ text: '{"subQuestions": ["a"]}' });
    const h = harness(chat, { deadline: Date.now() + 1000 });
    await research(h.deps, 'Anything?');
    expect((h.events.find((e) => e.type === 'text') as { text: string }).text).toMatch(/couldn’t find sources/);
  });

  it('keeps what it did when a step fails, and says it stopped', async () => {
    const { chat } = scripted();
    const h = harness(chat);
    await research(h.deps, 'Anything?');
    expect((h.events.find((e) => e.type === 'text') as { text: string }).text).toMatch(/stopped early/);
    expect(h.saved.at(-1)?.ui?.[0]).toMatchObject({ name: 'deep_research', status: 'error' });
  });
});
