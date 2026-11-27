import { describe, expect, it } from 'vitest';
import { inlineTokens } from '@/components/chat/markdown-parse';
import { numberPapers } from '@/lib/agent/loop';
import { conversationPatchBody } from '@/lib/agent/bodies';
import type { Paper } from '@/lib/papers/types';


describe('chat changes', () => {
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
