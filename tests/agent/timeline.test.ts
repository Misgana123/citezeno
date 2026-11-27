import { describe, expect, it } from 'vitest';
import { aboutOf, groupLine, heading, planState, researchCounts, rows, segments, type LiveStep } from '@/components/chat/steps/timeline';
import { systemPrompt } from '@/lib/agent/prompt';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import { CLIENT_TOOLS } from '@/lib/agent/tools/client';
import { stepLook } from '@/lib/agent/tools/run';
import { STEP_KINDS } from '@/lib/agent/tools/types';

/* The chat's timeline of what the assistant did: steps in plain words, notes
   between them, runs of one kind joined, deep research under its plan. */

const step = (callId: string, over: Partial<LiveStep> = {}): LiveStep => ({ callId, name: 'search_papers', label: 'Searching papers for “x”', input: {}, status: 'done', kind: 'papers', line: { did: 'Searched papers', about: 'x' }, ...over });
const steps = (...s: LiveStep[]) => ({ kind: 'steps' as const, steps: s });
const text = (t: string) => ({ kind: 'assistant' as const, text: t });

describe('every step in plain words', () => {
  // one input with every field any tool reads, so each tool's line can be made
  const sample = {
    query: 'sleep and memory', search: 'sleep', itemIds: ['a', 'b'], inputs: [{}, {}], files: [{}, {}], details: { title: 'A paper' }, format: 'bibtex', kind: 'bar', url: 'https://www.example.org/page',
    input: '10.1000/xyz', name: 'Thesis', filename: 'report', to: 'pdf', pages: '1-3', question: 'what did they find', text: 'Sleep helps memory.', action: 'merge', note: 'n', attachment: 'photo.png', title: 'Results', paperId: 'openalex:W1', itemId: 'i1',
  };
  const internal = /openalex|tavily|e2b|europe ?pmc|pubmed|arxiv|crossref|gemini|openrouter|[a-z]+_[a-z]+|\bid\b|W\d{3,}|\{|\}/i;

  it('gives every tool a kind and a past-tense line with no tool names, services, IDs or raw input', () => {
    for (const tool of [...AGENT_TOOLS, ...CLIENT_TOOLS]) {
      expect(STEP_KINDS, tool.name).toContain(tool.step);
      const line = tool.done(sample as never);
      expect(line.did, tool.name).toMatch(/^[A-Z]/);
      expect(`${line.did} ${line.about ?? ''}`, tool.name).not.toMatch(internal);
      expect(tool.label(sample as never), tool.name).not.toMatch(internal);
    }
  });

  it('looks a step up by its tool: kind always, the line only once done', () => {
    expect(stepLook('search_papers', { query: 'sleep' }, false)).toEqual({ kind: 'papers' });
    expect(stepLook('search_papers', { query: 'sleep' }, true)).toEqual({ kind: 'papers', line: { did: 'Searched papers', about: 'sleep' } });
    expect(stepLook('no_such_tool', {}, true)).toEqual({});
  });

  it('asks the assistant for one plain sentence before it uses tools', () => {
    expect(systemPrompt(new Date('2026-11-24'))).toMatch(/Before you use tools, write one short plain sentence/);
  });
});

describe('a turn as a timeline', () => {
  it('puts words before steps on the timeline as notes and keeps the answer after them in view', () => {
    const segs = segments([text('I’ll look for studies first.'), steps(step('a')), text('Then the web.'), steps(step('b', { kind: 'web' })), text('Here is what I found.')]);
    expect(segs.map((s) => s.kind)).toEqual(['work', 'answer']);
    const work = segs[0] as Extract<(typeof segs)[number], { kind: 'work' }>;
    expect(work.items.map((i) => (i.kind === 'note' ? i.text : i.step.callId))).toEqual(['I’ll look for studies first.', 'a', 'Then the web.', 'b']);
    expect(segs[1]).toEqual({ kind: 'answer', at: 4 });
  });

  it('keeps a long reply before steps as an answer, and an answer before an offer of deep research too', () => {
    expect(segments([text('x'.repeat(400)), steps(step('a')), text('Done.')]).map((s) => s.kind)).toEqual(['answer', 'work', 'answer']);
    expect(segments([text('Short answer.'), steps(step('o', { name: 'offer_deep_research', kind: 'plan' }))]).map((s) => s.kind)).toEqual(['answer', 'work']);
  });

  it('joins steps of one kind that ran one after another, and opens each', () => {
    const r = rows([
      { kind: 'step', step: step('a', { line: { did: 'Searched papers', about: 'one' } }) },
      { kind: 'step', step: step('b', { line: { did: 'Searched papers', about: 'two' } }) },
      { kind: 'step', step: step('c', { kind: 'make', line: { did: 'Made a PDF' } }) },
      { kind: 'step', step: step('d', { kind: 'make', line: { did: 'Made a PDF' } }) },
    ]);
    expect(r.map((x) => x.kind)).toEqual(['group', 'step', 'step']); // files aren't joined: each is its own row
    const g = r[0] as Extract<(typeof r)[number], { kind: 'group' }>;
    expect(groupLine(g.stepKind, g.steps)).toEqual({ did: 'Ran 2 paper searches', about: 'one · two' });
    expect(groupLine('read', [step('x', { kind: 'read', line: { did: 'Read' } })]).did).toBe('Read 1 source');
  });

  it('heads a finished turn with what it did, in plain words', () => {
    expect(heading([step('a'), step('b', { kind: 'web' }), step('c', { kind: 'read' }), step('d', { kind: 'read' })])).toBe('Searched papers, searched the web and read 2 sources');
    expect(heading([step('a', { kind: undefined, line: undefined, label: 'Opening a paper' })])).toBe('Opening a paper'); // saved before kinds existed
    expect(heading([step('o', { name: 'offer_deep_research' })])).toBe('');
  });

  it('names what a step opened or read by its title', () => {
    const page = step('r', { name: 'web_fetch', kind: 'read', line: { did: 'Read', about: 'example.org/page' }, display: { links: [{ title: 'Sleep and teens', url: 'https://example.org/page' }] } });
    expect(aboutOf(page)).toBe('Sleep and teens');
    expect(aboutOf(step('s'))).toBe('x'); // a search keeps its query
  });
});

describe('deep research on the timeline', () => {
  const plan = step('p', { name: 'deep_research', label: 'Planning the research', kind: 'plan', display: { plan: ['Where it came from', 'How it works'] } });
  const gaps = step('g', { name: 'deep_research', label: 'Checking what’s missing', kind: 'plan', line: { did: 'Checked what’s missing' }, display: { plan: ['What it costs'] } });
  const report = step('w', { name: 'deep_research', label: 'Writing the report', kind: 'make', display: { summary: '12 sources' } });

  it('puts each question’s steps under it, in the order the questions were started, with the plan above', () => {
    const items = [plan, step('a', { part: 0 }), step('b', { part: 1 }), step('c', { part: 0, kind: 'read' }), gaps, step('d', { part: 2, kind: 'web' }), report].map((s) => ({ kind: 'step' as const, step: s }));
    const r = rows(items);
    expect(r.map((x) => (x.kind === 'part' ? `part ${x.n}: ${x.question}` : x.kind === 'step' ? x.step.callId : x.kind))).toEqual(['part 0: Where it came from', 'part 1: How it works', 'g', 'part 2: What it costs', 'w']);
    const first = r[0] as Extract<(typeof r)[number], { kind: 'part' }>;
    expect(first.rows.map((x) => (x.kind === 'step' ? x.step.callId : x.kind))).toEqual(['a', 'c']);
  });

  it('ticks questions off and counts the work for its heading', () => {
    const all = [plan, step('a', { part: 0 }), step('b', { part: 1, status: 'running' }), step('c', { part: 0, kind: 'read' }), report];
    expect([0, 1, 2].map((n) => planState(all, n))).toEqual(['done', 'now', 'todo']);
    expect(researchCounts(all)).toEqual(['1 search', '1 source read', '12 sources']);
  });
});
