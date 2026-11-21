import { z } from 'zod';
import { ATTACH_IMAGE_MAX, ATTACH_MAX, ATTACH_TEXT_MAX, ATTACH_TOTAL_MAX } from './attachments';
import { citedSourceSchema } from './tools/client';

/* The JSON bodies the /api/agent routes accept. */
const ID = z.string().trim().min(1).max(80);

export const MESSAGE_MAX = 8000;

/* Files added to a message, read in the browser (limits in attachments.ts). */
const attachmentName = z.string().trim().min(1).max(200);
export const attachmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), name: attachmentName, text: z.string().max(ATTACH_TEXT_MAX, 'An attached file is too long.') }),
  z.object({
    kind: z.literal('image'),
    name: attachmentName,
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    data: z.string().min(1).max(ATTACH_IMAGE_MAX, 'An attached image is too large.').regex(/^[A-Za-z0-9+/]+=*$/, 'An attached image could not be read.'),
  }),
]);

export const messageBody = z
  .object({
    conversationId: ID.nullish(),
    text: z.string().trim().max(MESSAGE_MAX, `Messages are limited to ${MESSAGE_MAX.toLocaleString('en')} characters.`),
    model: z.string().trim().max(80).nullish(),
    /* sent from the reader: the paper the user has open (its details become context) */
    paperId: z.string().trim().max(300).nullish(),
    attachments: z.array(attachmentSchema).max(ATTACH_MAX, `Add at most ${ATTACH_MAX} files to a message.`).optional(),
  })
  .refine((b) => b.text || b.attachments?.length, 'Type a message.')
  .refine((b) => (b.attachments ?? []).reduce((n, a) => n + (a.kind === 'text' ? a.text.length : a.data.length), 0) <= ATTACH_TOTAL_MAX, 'The attached files are too large together.');

export const confirmBody = z.object({ conversationId: ID, callId: z.string().trim().min(1).max(200), approve: z.boolean() });

/* What the browser sends back for a tool it ran. Kept small: it becomes data the model reads. */
export const clientResultBody = z.object({
  conversationId: ID,
  callId: z.string().trim().min(1).max(200),
  outcome: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), sources: z.array(citedSourceSchema).max(10), note: z.string().max(500).optional() }),
    z.object({ ok: z.literal(false), error: z.string().trim().min(1).max(500) }),
  ]),
});

/* PATCH a conversation: rename it and / or pin it. */
export const conversationPatchBody = z
  .object({ title: z.string().trim().min(1, 'Give it a title.').max(80).optional(), pinned: z.boolean().optional() })
  .refine((v) => v.title !== undefined || v.pinned !== undefined, 'Nothing to change.');

/* A validated JSON body, or a 400. */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const raw = await req.json().catch(() => null);
  const r = schema.safeParse(raw);
  if (!r.success) throw Object.assign(new Error(r.error.issues[0]?.message || 'Check the request.'), { code: 'bad_request' });
  return r.data;
}
