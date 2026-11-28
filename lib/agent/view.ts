import { excerptOf } from './attachments';
import type { Conversation } from './store';
import type { Feedback, StepView, StoredMessage, Waiting } from './types';

/* A conversation as the chat page shows it: the user's messages, the agent's
   words, and the steps it took (with what they found). Nothing internal. */
/* An attached file as the page shows it: its name, and a picture's data URL. */
export type AttachmentView = { kind: 'text' | 'image'; name: string; src?: string; excerpt?: string };

/* an answer's seq (its saved number, for feedback), when it was written, and the user's thumbs up or down */
export type ChatEntry = { kind: 'user'; text: string; attachments?: AttachmentView[]; /* lab chats: who wrote it, when not the viewer */ author?: string } | { kind: 'assistant'; text: string; seq?: number; at?: string; feedback?: Feedback; credits?: number } | { kind: 'steps'; steps: StepView[] };

export type ConversationView = {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  /* web search is on for this chat */
  webSearch: boolean;
  entries: ChatEntry[];
  /* a yes / no question, or a tool the browser should run (asking first, since reopening shouldn't spend credits silently) */
  waiting: Waiting | null;
  /* a chat inside a lab project (its lab: papers open from the lab's shelf) */
  lab?: boolean;
  labId?: string;
};

/* authors: in a lab chat, the names of the people who wrote (user ID → name), and who is looking */
export function toView(c: Conversation, messages: StoredMessage[], authors?: { names: ReadonlyMap<string, string>; viewer: string }): ConversationView {
  const entries: ChatEntry[] = [];
  for (const { message: m, ui, seq, createdAt, feedback, meta, authorId } of messages) {
    if (m.role === 'user')
      entries.push({
        kind: 'user',
        text: m.text,
        ...(authors && authorId && authorId !== authors.viewer ? { author: authors.names.get(authorId) ?? 'Someone' } : {}),
        ...(m.attachments?.length
          ? {
              attachments: m.attachments.map((a) =>
                a.kind === 'image' ? { kind: a.kind, name: a.name, src: `data:${a.mediaType};base64,${a.data}` } : { kind: a.kind, name: a.name, excerpt: excerptOf(a.text) },
              ),
            }
          : {}),
      });
    else if (m.role === 'assistant') {
      // deep research keeps its steps on the report itself
      if (ui?.length) entries.push({ kind: 'steps', steps: ui });
      if (m.text) entries.push({ kind: 'assistant', text: m.text, ...(seq != null ? { seq } : {}), ...(createdAt ? { at: createdAt } : {}), ...(feedback ? { feedback } : {}), ...(typeof meta?.credits === 'number' ? { credits: meta.credits } : {}) });
    } else if (ui?.length) entries.push({ kind: 'steps', steps: ui });
  }
  // steps already done in a turn that is waiting for the user
  if (c.pending?.steps.length) entries.push({ kind: 'steps', steps: c.pending.steps });
  return {
    id: c.id,
    title: c.title,
    model: c.model,
    pinned: c.pinned,
    webSearch: c.webSearch,
    entries,
    waiting: c.pending?.waiting ?? null,
    ...(c.labId ? { lab: true, labId: c.labId } : {}),
  };
}
