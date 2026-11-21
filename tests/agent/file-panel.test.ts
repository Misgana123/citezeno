import { describe, expect, it } from 'vitest';
import { toSource, splitName } from '@/components/chat/file/citation';
import { readPaper } from '@/components/chat/file/read-paper';
import { clampWidth } from '@/components/chat/file/useResizable';
import type { Entry } from '@/components/chat/events';
import { inlineTokens } from '@/components/chat/markdown-parse';

describe('passage links in answers', () => {
  it('reads [p3-2] and lists of passages, and keeps [2] as a paper number', () => {
    expect(inlineTokens('Nurses slept less [p3-2].')).toEqual([{ kind: 'text', text: 'Nurses slept less ' }, { kind: 'passage', ids: ['p3-2'] }, { kind: 'text', text: '.' }]);
    const t = inlineTokens('Shorter shifts helped [p3-2, p4-1] as in [2].');
    expect(t.filter((x) => x.kind === 'passage')).toEqual([{ kind: 'passage', ids: ['p3-2', 'p4-1'] }]);
    expect(t.filter((x) => x.kind === 'cite')).toEqual([{ kind: 'cite', n: 2 }]);
  });

  it('leaves look-alikes as text', () => {
    expect(inlineTokens('see [page 3] and [p3]').every((x) => x.kind === 'text')).toBe(true);
  });
});

describe('the paper a turn read', () => {
  const steps = (...s: { name: string; input: unknown }[]): Entry => ({ kind: 'steps', steps: s.map((x, i) => ({ callId: String(i), label: x.name, status: 'done', ...x })) }) as Entry;

  it('is the last paper asked or summarized', () => {
    expect(readPaper([steps({ name: 'search_papers', input: { query: 'x' } }, { name: 'ask_paper', input: { paperId: 'openalex:W1', question: 'q' } }), steps({ name: 'summarize_paper', input: { paperId: 'openalex:W2' } })])).toBe('openalex:W2');
  });

  it('is none when the turn read no paper', () => {
    expect(readPaper([steps({ name: 'list_library', input: {} }), { kind: 'assistant', text: 'Hi' } as Entry])).toBeNull();
  });
});

describe('copying a citation', () => {
  it('splits names into family and given, keeping single names whole', () => {
    expect(splitName('Ada M. Lovelace')).toEqual({ family: 'Lovelace', given: 'Ada M.' });
    expect(splitName('Plato')).toEqual({ family: 'Plato', literal: true });
  });

  it('turns a paper into a source for the style engine', () => {
    const s = toSource({ title: 'Sleep and memory', authors: [{ name: 'Jan Born', orcid: null }], year: 2019, source: 'Nature Neuroscience', type: 'article', doi: '10.1/x', landingUrl: 'https://x.org', isRetracted: false });
    expect(s).toMatchObject({ type: 'article', title: 'Sleep and memory', authors: [{ family: 'Born', given: 'Jan' }], year: 2019, container: 'Nature Neuroscience', doi: '10.1/x', url: undefined });
  });
});

describe('the panel width', () => {
  it('stays between its minimum and the room the chat leaves', () => {
    expect(clampWidth(100, 1400)).toBe(380);
    expect(clampWidth(5000, 1400)).toBe(1008); // 72% of 1400
    expect(clampWidth(900, 1000)).toBe(660); // the chat keeps 340
    expect(clampWidth(600, 1400)).toBe(600);
  });
});
