import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { compareDrafts, repeatedPhrases, sentencesOf, syllables, textStats } from '@/lib/agent/tools/text';
import { runTool } from '@/lib/agent/tools/run';
import { shelfConfig } from '@/lib/shelf/config';

const DRAFT = `Sleep plays a central role in memory consolidation. Studies in rats show that sleep spindles predict recall, e.g. in maze tasks (Smith et al. 2020). The role of sleep spindles is still debated.

In humans, the role of sleep spindles has been measured with EEG. This is a very long sentence that keeps going and going with many clauses and extra words so that it is clearly longer than thirty five words when anyone counts them one by one carefully today.`;

function ctx(files: Record<string, string> = {}): AgentContext {
  return {
    userId: 'u1',
    db: null as never,
    sources: () => null as never,
    papersConfig: { maxQueryChars: 1500, dailySearchesPerUser: 100 },
    shelfConfig: shelfConfig({}),
    reserveSearches: async () => {},
    webSearch: () => null,
    webFiles: () => null as never,
    pdfText: () => null as never,
    chatAttachments: async () => Object.entries(files).map(([name, text]) => ({ kind: 'text' as const, name, text })),
    code: () => null,
    files: { save: async () => null as never, read: async () => null, readShelfPdf: async () => null },
  };
}

describe('text_stats', () => {
  it('splits sentences without breaking on abbreviations', () => {
    expect(sentencesOf(DRAFT)).toHaveLength(5);
    expect(sentencesOf(DRAFT)[1]).toBe('Studies in rats show that sleep spindles predict recall, e.g. in maze tasks (Smith et al. 2020).');
  });

  it('counts syllables well enough for a readability score', () => {
    expect([syllables('cat'), syllables('memory'), syllables('consolidation'), syllables('made')]).toEqual([1, 3, 5, 1]);
  });

  it('counts words, sentences, long sentences, top words and repeated phrases', () => {
    const s = textStats(DRAFT);
    expect(s).toMatchObject({ sentences: 5, paragraphs: 2, readingMinutes: 1, longSentences: { count: 1 } });
    expect(s.words).toBe(DRAFT.split(/\s+/).filter((w) => /\w/.test(w)).length);
    expect(s.topWords[0]).toEqual({ word: 'sleep', count: 4 });
    expect(s.readability?.fleschReadingEase).toEqual(expect.any(Number));
    expect(s.repeatedPhrases[0]).toEqual({ phrase: 'the role of sleep spindles', count: 2 });
    // a phrase inside a longer repeated one isn't listed twice
    expect(s.repeatedPhrases.map((p) => p.phrase)).not.toContain('role of sleep spindles');
    expect(repeatedPhrases(['and it is not in the', 'and it is not in the'])).toEqual([]);
  });

  it('gives no English readability score for other languages', () => {
    const fr = 'Le sommeil joue un rôle central dans la consolidation de la mémoire. '.repeat(6);
    expect(textStats(fr).readability).toBeNull();
  });

  it('lists the sentences added and removed between drafts', () => {
    const c = compareDrafts('One idea here. Two ideas there. Three ideas everywhere.', 'One idea here. Two ideas, revised. Three ideas everywhere. A new closing line.');
    expect(c).toMatchObject({ sentencesUnchanged: 2, removed: ['Two ideas there.'], added: ['Two ideas, revised.', 'A new closing line.'], changedPercent: 50 });
  });

  it('runs on an attached draft and an earlier one', async () => {
    const r = await runTool(ctx({ 'v2.md': DRAFT, 'v1.md': 'Sleep plays a central role in memory consolidation.' }), 'text_stats', { source: { attachment: 'v2.md' }, compareTo: { attachment: 'v1.md' } });
    expect(r.outcome).toMatchObject({ status: 'done', output: { result: { sentences: 5, changes: { sentencesAdded: 4 } }, display: { summary: '80% changed' } } });
    expect((await runTool(ctx(), 'text_stats', { source: { attachment: 'nope.md' } })).outcome).toMatchObject({ status: 'error', message: expect.stringContaining('nope.md') });
  });
});
