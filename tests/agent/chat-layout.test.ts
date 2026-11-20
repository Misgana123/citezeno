import { describe, expect, it } from 'vitest';
import { groupChats } from '@/components/chat/groups';
import { inlineTokens } from '@/components/chat/markdown-parse';
import { numberPapers } from '@/lib/agent/loop';
import { conversationPatchBody } from '@/lib/agent/bodies';
import type { Paper } from '@/lib/papers/types';

const NOW = new Date(2026, 10, 20, 15, 0).getTime();
const at = (daysAgo: number, hour = 10) => new Date(2026, 10, 20 - daysAgo, hour).toISOString();
const chat = (id: string, title: string, updatedAt: string, pinned = false) => ({ id, title, model: 'm', pinned, updatedAt });

describe('the chat list', () => {
  const list = [
    chat('a', 'Sleep and memory', at(0, 14)),
    chat('b', 'Climate essay sources', at(1), true),
    chat('c', 'Retractions on my shelf', at(1)),
    chat('d', 'ML in healthcare', at(3)),
    chat('e', 'Old thesis notes', at(30)),
    chat('f', 'Morning question', at(0, 8)),
  ];

  it('puts pinned chats first, then today, yesterday, the last week and older', () => {
    expect(groupChats(list, '', NOW).map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ['Pinned', ['b']],
      ['Today', ['a', 'f']],
      ['Yesterday', ['c']],
      ['Previous 7 days', ['d']],
      ['Older', ['e']],
    ]);
  });

  it('searches titles by every word, in any order', () => {
    expect(groupChats(list, 'memory sleep', NOW).flatMap((g) => g.items.map((c) => c.id))).toEqual(['a']);
    expect(groupChats(list, 'nothing here', NOW)).toEqual([]);
  });

  it('accepts a rename, a pin, or both, but not an empty change', () => {
    expect(conversationPatchBody.safeParse({ pinned: true }).success).toBe(true);
    expect(conversationPatchBody.safeParse({ title: 'New name' }).success).toBe(true);
    expect(conversationPatchBody.safeParse({}).success).toBe(false);
  });
});

describe('numbering papers in a reply', () => {
  const paper = (id: string) => ({ id, title: id }) as Paper;

  it('gives each paper the next number the first time it shows, the same number after that', () => {
    const refs = new Map<string, number>();
    const first = numberPapers({ result: { papers: [{ paperId: 'p1' }, { paperId: 'p2' }] }, display: { papers: [paper('p1'), paper('p2')] } }, refs);
    expect(first.result).toEqual({ papers: [{ ref: 1, paperId: 'p1' }, { ref: 2, paperId: 'p2' }] });
    expect(first.display?.refs).toEqual({ p1: 1, p2: 2 });

    const second = numberPapers({ result: { saved: { paperId: 'p2' } }, display: { items: [{ paper: paper('p2') } as never, { paper: paper('p3') } as never] } }, refs);
    expect(second.display?.refs).toEqual({ p2: 2, p3: 3 });
    expect(second.result).toEqual({ saved: { ref: 2, paperId: 'p2' } });
  });

  it('leaves results without papers as they are', () => {
    const out = { result: { ok: true } };
    expect(numberPapers(out, new Map())).toBe(out);
  });
});

describe('citations in replies', () => {
  it('reads [n] as a citation, but not a markdown link', () => {
    expect(inlineTokens('Klinzing [1] and Hu [2].')).toEqual([
      { kind: 'text', text: 'Klinzing ' },
      { kind: 'cite', n: 1 },
      { kind: 'text', text: ' and Hu ' },
      { kind: 'cite', n: 2 },
      { kind: 'text', text: '.' },
    ]);
    expect(inlineTokens('[2](https://doi.org/10.1/x)')).toEqual([{ kind: 'link', href: 'https://doi.org/10.1/x', text: '2' }]);
  });
});
