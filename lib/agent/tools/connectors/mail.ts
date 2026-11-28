import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import { AGENT_FILE_MAX_BYTES } from '../../files';
import { defineTool, tally } from '../types';
import { app, APP, appLabel, clip, READ_CHARS } from './shared';

/* The user's connected mailbox (Outlook): find and read messages and their
   attachments, and save drafts. Nothing is ever sent: a draft waits in the
   user's Drafts folder for them to check and send. */

const ID = z.string().trim().min(1).max(400);
const EMAIL = z.string().trim().email().max(320);
const TEXT_MIMES = /^(text\/|application\/(json|xml|x-bibtex|x-research-info-systems))/;

export const mailSearch = defineTool({
  name: 'mail_search',
  description:
    'Search the user’s connected mailbox (Outlook), newest first: by words, a sender (e.g. "from:editor@journal.org"), or a subject. Without a query, the latest messages. Returns subjects, senders, dates and a short preview; read a message with mail_read.',
  input: z.object({ query: z.string().trim().max(200).optional(), limit: z.number().int().min(1).max(50).optional(), app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'mail',
  label: (i) => (i.query ? `Searching your mail for “${clip(i.query, 50)}”` : 'Looking at your latest mail'),
  done: (i) => ({ did: 'Searched your mail', ...(i.query ? { about: i.query } : {}) }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'mail', i.app);
    const messages = await api.search({ query: i.query, limit: i.limit ?? 15 });
    return { result: { messages: messages.map((m) => ({ messageId: m.id, subject: m.subject, from: m.from, received: m.receivedAt, preview: clip(m.preview, 240), hasAttachments: m.hasAttachments })) }, display: { summary: tally(messages.length, 'message') } };
  },
});

export const mailRead = defineTool({
  name: 'mail_read',
  description: `Read one message from the user’s mailbox by messageId (from mail_search): sender, recipients, date, its text (at most ${READ_CHARS.toLocaleString('en-US')} characters) and its attachments (read one with mail_attachment).`,
  input: z.object({ messageId: ID, app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'mail',
  label: () => 'Reading an email',
  done: () => ({ did: 'Read an email' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'mail', i.app);
    const m = await api.read(i.messageId, READ_CHARS);
    return {
      result: { messageId: m.id, subject: m.subject, from: m.from, to: m.to, cc: m.cc, received: m.receivedAt, text: m.text, attachments: m.attachments.map((a) => ({ attachmentId: a.id, name: a.name, mime: a.mime, sizeBytes: a.sizeBytes })), url: m.url },
      display: { ...(m.url ? { links: [{ title: m.subject, url: m.url }] } : {}), summary: m.attachments.length ? tally(m.attachments.length, 'attachment') : 'Read' },
    };
  },
});

export const mailAttachment = defineTool({
  name: 'mail_attachment',
  description: `Open an attachment of a message (messageId and attachmentId from mail_read): a PDF or text file as its text (at most ${READ_CHARS.toLocaleString('en-US')} characters); other files (Word, Excel, pictures…) are kept as a file of this chat, with a fileId for convert_file, run_python and the other file tools.`,
  input: z.object({ messageId: ID, attachmentId: ID, app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'mail',
  label: () => 'Opening an attachment',
  done: () => ({ did: 'Opened an attachment' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'mail', i.app);
    const got = await api.attachment(i.messageId, i.attachmentId, AGENT_FILE_MAX_BYTES);
    let text: string | null = null;
    if (TEXT_MIMES.test(got.mime)) text = new TextDecoder().decode(got.bytes);
    else if (got.mime === 'application/pdf' || /\.pdf$/i.test(got.name)) text = (await ctx.pdfText().read(got.bytes)).text.trim() || null;
    const file = text == null ? await ctx.files.save({ name: got.name, mime: got.mime, bytes: got.bytes }) : null;
    const cut = text != null && text.length > READ_CHARS;
    return {
      result: { name: got.name, ...(text != null ? { text: cut ? text.slice(0, READ_CHARS) : text, ...(cut ? { cut: true } : {}) } : { fileId: file!.id, note: 'Kept in this chat for the file tools.' }) },
      display: { ...(file ? { file } : {}), summary: text != null ? `${text.length.toLocaleString('en-US')} characters` : 'Kept in this chat' },
    };
  },
});

export const mailDraft = defineTool({
  name: 'mail_draft',
  description:
    'Save an email as a DRAFT in the user’s mailbox (Outlook); it is never sent: the user checks and sends it themselves. Give replyTo (a messageId) to draft a reply in that conversation. Write plain text. Asks the user first.',
  input: z.object({
    to: z.array(EMAIL).max(20),
    cc: z.array(EMAIL).max(20).optional(),
    subject: z.string().trim().max(300),
    text: z.string().trim().min(1).max(20_000),
    replyTo: ID.optional().describe('The messageId being answered (the draft goes into that conversation).'),
    app: APP,
  }),
  kind: 'write',
  step: 'make',
  needs: 'mail',
  label: () => 'Writing a draft',
  done: (i) => ({ did: 'Saved a draft', about: i.subject || 'reply' }),
  confirm: (i, ctx) => `Save a draft${i.replyTo ? ' reply' : ''}${i.to.length ? ` to ${i.to.slice(0, 3).join(', ')}${i.to.length > 3 ? '…' : ''}` : ''}${i.subject ? ` (“${clip(i.subject, 60)}”)` : ''} in your ${appLabel(ctx, 'mail', 'mailbox', i.app)}? It won’t be sent.`,
  async run(ctx, i) {
    if (!i.replyTo && !i.to.length) throw new ShelfError('bad_request', 'Say who the email is to.');
    const { api, label } = await app(ctx, 'mail', i.app);
    const d = await api.draft({ to: i.to, cc: i.cc, subject: i.subject, text: i.text, replyTo: i.replyTo ?? null });
    return { result: { draftId: d.id, url: d.url, app: label, sent: false }, display: { ...(d.url ? { links: [{ title: 'Open the draft', url: d.url }] } : {}), summary: 'Draft saved' } };
  },
});

export const MAIL_TOOLS = [mailSearch, mailRead, mailAttachment, mailDraft];
