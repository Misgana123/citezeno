import { z } from 'zod';

/* The JSON bodies the /api/agent routes accept. */
const ID = z.string().trim().min(1).max(80);

export const MESSAGE_MAX = 8000;

export const messageBody = z.object({
  conversationId: ID.nullish(),
  text: z.string().trim().min(1, 'Type a message.').max(MESSAGE_MAX, `Messages are limited to ${MESSAGE_MAX.toLocaleString('en')} characters.`),
  model: z.string().trim().max(80).nullish(),
});

export const confirmBody = z.object({ conversationId: ID, callId: z.string().trim().min(1).max(200), approve: z.boolean() });

export const renameBody = z.object({ title: z.string().trim().min(1, 'Give it a title.').max(80) });

/* A validated JSON body, or a 400. */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const raw = await req.json().catch(() => null);
  const r = schema.safeParse(raw);
  if (!r.success) throw Object.assign(new Error(r.error.issues[0]?.message || 'Check the request.'), { code: 'bad_request' });
  return r.data;
}
