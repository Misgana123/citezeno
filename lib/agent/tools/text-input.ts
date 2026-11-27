import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';

/* Text a tool works on: pasted into the call, a file the user attached (its
   text, as their browser read it), or a text file made in this chat. */

export const TEXT_MAX = 400_000;
const TEXT_FILE = /\.(txt|md|markdown|csv|tsv|json|tex|bib|bibtex|ris|xml|html?)$/i;

export const textSource = z
  .object({
    text: z.string().min(1).max(TEXT_MAX).optional().describe('The text itself, when the user pasted it into the message.'),
    attachment: z.string().min(1).max(200).optional().describe('A file the user attached to this chat, by its name.'),
    fileId: z.string().min(1).max(80).optional().describe('A text file made in this chat.'),
  })
  .refine((s) => [s.text, s.attachment, s.fileId].filter(Boolean).length === 1, 'Give one of text, attachment or fileId.');
export type TextSource = z.infer<typeof textSource>;

/* The text and a name for it ("pasted text" when it came in the call). */
export async function readText(ctx: AgentContext, s: TextSource): Promise<{ name: string; text: string }> {
  if (s.text != null) return { name: 'pasted text', text: s.text };
  if (s.fileId) {
    const got = await ctx.files.read(s.fileId);
    if (!got) throw new ShelfError('not_found', `There is no file with fileId "${s.fileId}" in this chat.`);
    if (!TEXT_FILE.test(got.file.name) && !got.file.mime.startsWith('text/')) throw new ShelfError('bad_request', `"${got.file.name}" isn’t a text file.`);
    return { name: got.file.name, text: new TextDecoder().decode(got.bytes).slice(0, TEXT_MAX) };
  }
  const attached = await ctx.chatAttachments();
  // the latest one with that name, if the user attached it more than once
  const hit = attached.findLast((a) => a.name === s.attachment);
  if (!hit) throw new ShelfError('not_found', `No file called "${s.attachment}" was attached to this chat.${attached.length ? ` Attached files: ${attached.map((a) => a.name).join(', ')}.` : ''}`);
  if (hit.kind === 'image') throw new ShelfError('bad_request', `"${hit.name}" is a picture, not text.`);
  return { name: hit.name, text: hit.text.slice(0, TEXT_MAX) };
}
