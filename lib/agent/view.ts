import { excerptOf } from './attachments';
import type { Conversation } from './store';
import type { StepView, StoredMessage } from './types';

/* A conversation as the chat page shows it: the user's messages, the agent's
   words, and the steps it took (with what they found). Nothing internal. */
/* An attached file as the page shows it: its name, and a picture's data URL. */
export type AttachmentView = { kind: 'text' | 'image'; name: string; src?: string; excerpt?: string };

export type ChatEntry = { kind: 'user'; text: string; attachments?: AttachmentView[] } | { kind: 'assistant'; text: string } | { kind: 'steps'; steps: StepView[] };

export type ConversationView = {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  entries: ChatEntry[];
  /* a yes / no question, or a tool the browser should run (asking first, since reopening shouldn't spend credits silently) */
  waiting: { callId: string; kind: 'confirm'; question: string } | { callId: string; kind: 'client'; name: string; input: unknown; label: string } | null;
};

export function toView(c: Conversation, messages: StoredMessage[]): ConversationView {
  const entries: ChatEntry[] = [];
  for (const { message: m, ui } of messages) {
    if (m.role === 'user')
      entries.push({
        kind: 'user',
        text: m.text,
        ...(m.attachments?.length
          ? {
              attachments: m.attachments.map((a) =>
                a.kind === 'image' ? { kind: a.kind, name: a.name, src: `data:${a.mediaType};base64,${a.data}` } : { kind: a.kind, name: a.name, excerpt: excerptOf(a.text) },
              ),
            }
          : {}),
      });
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
    pinned: c.pinned,
    entries,
    waiting: c.pending?.waiting ?? null,
  };
}
