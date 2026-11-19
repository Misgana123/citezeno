import { describe, expect, it } from 'vitest';
import { applyEvent, type Entry } from '@/components/chat/events';
import { blocks, inlineTokens, type Inline } from '@/components/chat/markdown-parse';
import { AFTER_SIGN_IN, safeNext } from '@/lib/safe-next';

/* Every link the tokens hold. */
const links = (tokens: Inline[]): string[] => tokens.flatMap((t) => (t.kind === 'link' ? [t.href] : t.kind === 'strong' || t.kind === 'em' ? links(t.children) : []));

describe('rendering replies', () => {
  it('splits paragraphs, bullet and numbered lists', () => {
    expect(blocks('Found three:\n- One\n- Two\n\n1. First\n2. Second\nDone.').map((b) => b.kind)).toEqual(['p', 'ul', 'ol', 'p']);
  });

  it('links only http(s) addresses, never javascript:', () => {
    expect(links(inlineTokens('See [the paper](https://doi.org/10.1/x) and https://openalex.org/W1.'))).toEqual(['https://doi.org/10.1/x', 'https://openalex.org/W1']);
    expect(links(inlineTokens('[click](javascript:alert(1))'))).toEqual([]);
    expect(inlineTokens('<script>alert(1)</script>')).toEqual([{ kind: 'text', text: '<script>alert(1)</script>' }]); // stays text
    expect(inlineTokens('**bold** and `x`').map((t) => t.kind)).toEqual(['strong', 'text', 'code']);
  });
});

describe('following a reply as it streams', () => {
  it('groups steps, marks them done, and adds the answer', () => {
    let e: Entry[] = [{ kind: 'user', text: 'find' }];
    e = applyEvent(e, { type: 'step', callId: 'a', name: 'search_papers', label: 'Searching', input: {} });
    e = applyEvent(e, { type: 'step', callId: 'b', name: 'save_paper', label: 'Saving', input: {} });
    expect(e).toMatchObject([{ kind: 'user' }, { kind: 'steps', steps: [{ callId: 'a', status: 'running' }, { callId: 'b', status: 'running' }] }]);
    e = applyEvent(e, { type: 'step_done', step: { callId: 'a', name: 'search_papers', label: 'Searching', input: {}, status: 'done' } });
    e = applyEvent(e, { type: 'text', text: 'Saved.' });
    expect(e).toMatchObject([{}, { steps: [{ callId: 'a', status: 'done' }, { callId: 'b', status: 'running' }] }, { kind: 'assistant', text: 'Saved.' }]);
  });
});

describe('after signing in', () => {
  it('lands on the assistant unless the user was going somewhere', () => {
    expect(AFTER_SIGN_IN).toBe('/chat');
    expect(safeNext(undefined)).toBe('/chat');
    expect(safeNext('/shelf')).toBe('/shelf');
  });
});
