import { z } from 'zod';
import type { ReaderDeps } from '@/lib/reader/deps';
import type { AgentContext } from '../context';
import { defineTool } from './types';

/* The reader's actions for the research assistant: the same services the
   reader's Summarize, Ask and Notes use (nothing is implemented twice). Text
   from papers comes back as data, with passage IDs like [p3-2]. */

/* The reader's server pieces, with the assistant's paper sources (loaded only when a tool runs). */
async function deps(ctx: AgentContext): Promise<ReaderDeps> {
  const { readerDeps } = await import('@/lib/reader/server');
  return { ...readerDeps(), db: ctx.db, sources: ctx.sources };
}

const paperId = z.string().min(1).max(300).describe('The paper’s ID, e.g. "openalex:W2741809807" (from search results, the shelf, or the paper the user has open).');

export const summarizePaper = defineTool({
  name: 'summarize_paper',
  description:
    'A plain-English summary of one paper: its question, method, findings, limits and key terms, each point with the passage IDs it comes from (or from the abstract when there is no full text). Made once and reused, so it is cheap to call again.',
  input: z.object({ paperId }),
  kind: 'read',
  label: () => 'Summarizing the paper',
  async run(ctx, { paperId: id }) {
    const { summarize } = await import('@/lib/reader/ai/summary');
    const { summary } = await summarize(await deps(ctx), ctx.userId, id);
    return { result: { paperId: summary.paperId, basedOn: summary.basedOn, ...summary.content } };
  },
});

export const askPaper = defineTool({
  name: 'ask_paper',
  description:
    'Ask one question about what a specific paper says, answered only from that paper’s own text (or its abstract when there is no full text), with passage IDs like [p3-2] after each claim. Says "This paper doesn’t say" when it doesn’t. Use this for questions about a paper’s content.',
  input: z.object({ paperId, question: z.string().trim().min(3).max(1000) }),
  kind: 'read',
  label: (i) => `Reading the paper for “${i.question.slice(0, 60)}”`,
  async run(ctx, { paperId: id, question }) {
    const { askOnce } = await import('@/lib/reader/ai/ask');
    const r = await askOnce(await deps(ctx), ctx.userId, id, question);
    return { result: { paperId: r.paperId, title: r.title, answer: r.text, citedPassages: r.passageIds, basedOn: r.basedOn, notInPaper: r.notInPaper } };
  },
});

export const listHighlights = defineTool({
  name: 'list_highlights',
  description: 'The user’s own highlights and notes on one paper (made in the reader), in page order, with page numbers.',
  input: z.object({ paperId }),
  kind: 'read',
  label: () => 'Reading your highlights',
  async run(ctx, { paperId: id }) {
    const [{ annotations }, { loadPaper }] = await Promise.all([import('@/lib/reader/service/annotations'), import('@/lib/reader/service/paper')]);
    const { paper } = await loadPaper({ db: ctx.db, sources: ctx.sources }, ctx.userId, id);
    const { highlights, notes } = await annotations({ db: ctx.db }, ctx.userId, paper.id);
    return {
      result: {
        paperId: paper.id,
        title: paper.title,
        highlights: highlights.map((h) => ({ page: h.page, color: h.color, quote: h.quote.slice(0, 600), note: h.note })),
        pageNotes: notes.map((n) => ({ page: n.page, text: n.text.slice(0, 600) })),
      },
    };
  },
});

export const READER_TOOLS = [summarizePaper, askPaper, listHighlights];
