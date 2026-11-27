import { TITLE_MAX } from './store';

/* A new chat's title, written by the model in its first reply: no separate
   call. The reply starts with <title>…</title>, which is taken out before the
   reply is saved or shown. Deep research's plan returns it in its JSON instead.
   Without one, the chat keeps the title made from the user's first words. */

export const TITLE_ASK = `

This is the first message of a new chat. Begin your reply with a title for the chat on its own line, like <title>Sleep and memory in teenagers</title>: 3 to 6 words, in the user's language, plain text, no quotes or ending period. The title is taken out before the user sees your reply.`;

const TAG = /<title>([\s\S]{0,300}?)<\/title>\s*/i;

/* A title as the chat list shows it: one line, no markdown marks, quotes or ending period, at most TITLE_MAX characters. */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/[*_`#]/g, '')
    .replace(/^[\s"'“”‘’*#]+|[\s"'“”‘’*.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length >= 2 ? t.slice(0, TITLE_MAX) : null;
}

/* The title tag in a reply, if any, and the reply without it. */
export function takeTitle(text: string): { title: string | null; text: string } {
  const m = TAG.exec(text);
  if (!m) return { title: null, text };
  return { title: cleanTitle(m[1]), text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() };
}
