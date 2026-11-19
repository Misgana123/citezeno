import type { Conversation } from './store';
import type { StepView, StoredMessage } from './types';

/* A conversation as the chat page shows it: the user's messages, the agent's
   words, and the steps it took (with what they found). Nothing internal. */
export type ChatEntry = { kind: 'user'; text: string } | { kind: 'assistant'; text: string } | { kind: 'steps'; steps: StepView[] };

export type ConversationView = {
  id: string;
  title: string;
  model: string;
  entries: ChatEntry[];
  waiting: { callId: string; question: string } | null;
};

export function toView(c: Conversation, messages: StoredMessage[]): ConversationView {
  const entries: ChatEntry[] = [];
  for (const { message: m, ui } of messages) {
    if (m.role === 'user') entries.push({ kind: 'user', text: m.text });
    else if (m.role === 'assistant') {
      if (m.text) entries.push({ kind: 'assistant', text: m.text });
    } else if (ui?.length) entries.push({ kind: 'steps', steps: ui });
  }
  // steps already done in a turn that is waiting for the user
  if (c.pending?.steps.length) entries.push({ kind: 'steps', steps: c.pending.steps });
  return {
    id: c.id,
    title: c.title,
    model: c.model,
    entries,
    waiting: c.pending ? { callId: c.pending.waiting.callId, question: c.pending.waiting.question } : null,
  };
}
