import { z } from 'zod';
import { citedSourceSchema } from './tools/client';

/* The JSON bodies the /api/agent routes accept. */
const ID = z.string().trim().min(1).max(80);

export const MESSAGE_MAX = 8000;

export const messageBody = z.object({
  conversationId: ID.nullish(),
  text: z.string().trim().min(1, 'Type a message.').max(MESSAGE_MAX, `Messages are limited to ${MESSAGE_MAX.toLocaleString('en')} characters.`),
  model: z.string().trim().max(80).nullish(),
});

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
