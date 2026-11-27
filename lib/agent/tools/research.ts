import { z } from 'zod';
import { defineTool } from './types';

/* Deep research is the user's choice (the + menu): it takes minutes and many
   searches. For a question that deserves it, the assistant answers briefly as
   usual and offers it: the chat shows a "Run deep research" button under the
   answer, and nothing runs until the user presses it. */

export const OFFER_DEEP_RESEARCH = 'offer_deep_research';

export const offerDeepResearch = defineTool({
  name: OFFER_DEEP_RESEARCH,
  description:
    'Offer the user a deep research report on a broad question: a literature review, "what does research say about X", the state of the art, or a comparison of approaches across many studies. The chat shows a button under your answer; the research runs only if the user presses it. Still answer the question briefly yourself. Don’t offer it for quick lookups, a single paper, library or file tasks, or more than once for the same topic.',
  input: z.object({ question: z.string().min(3).max(500).describe('The research question, written out clearly and complete on its own (the report answers exactly this).') }),
  kind: 'read',
  step: 'plan',
  label: () => 'Offering deep research',
  done: () => ({ did: 'Offered deep research' }),
  async run(_ctx, { question }) {
    return {
      result: { offered: true, note: 'The user sees a "Run deep research" button. Don’t start the research yourself and don’t mention the button again.' },
      display: { research: { question }, summary: 'Offered' },
    };
  },
});

export const RESEARCH_TOOLS = [offerDeepResearch];
