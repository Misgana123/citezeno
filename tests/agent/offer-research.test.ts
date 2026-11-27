import { describe, expect, it } from 'vitest';
import { systemPrompt } from '@/lib/agent/prompt';
import { findTool, offeredTools, toolSpecs } from '@/lib/agent/tools';
import { offerDeepResearch } from '@/lib/agent/tools/research';

/* Deep research stays the user's choice; for a broad question the assistant
   offers it, and the chat shows a button that starts it. */
describe('offering deep research', () => {
  it('is a tool the assistant always has, with or without web search', () => {
    expect(findTool('offer_deep_research')).toBe(offerDeepResearch);
    for (const web of [true, false]) expect(offeredTools({ web }).map((t) => t.name)).toContain('offer_deep_research');
    const spec = toolSpecs([offerDeepResearch])[0];
    expect(spec.parameters).toMatchObject({ type: 'object', required: ['question'] });
  });

  it('runs nothing: it hands the question to the chat for its button, and tells the model not to start it', async () => {
    const out = await offerDeepResearch.run({} as never, { question: 'What does research say about sleep and memory in teenagers?' });
    expect(out.display).toEqual({ research: { question: 'What does research say about sleep and memory in teenagers?' }, summary: 'Offered' });
    expect(out.result).toMatchObject({ offered: true });
    expect(offerDeepResearch.input.safeParse({ question: 'x' }).success).toBe(false);
  });

  it('is explained in the instructions: for broad questions only, once per topic, after a brief answer', () => {
    const p = systemPrompt(new Date('2026-11-24'));
    expect(p).toContain('offer_deep_research');
    expect(p).toMatch(/answer briefly as usual/);
    expect(p).toMatch(/Don't offer it for quick lookups/);
  });
});
