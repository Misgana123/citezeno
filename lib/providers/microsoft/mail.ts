import type { BytesBody } from '../connectors/http';
import type { MailAddress, MailBox, MailSummary } from '../connectors/types';
import { seg, type GraphCall } from './http';

/* Outlook mail through Microsoft Graph: search, read, attachments, and drafts.
   Nothing is sent: a draft waits in the user's Drafts folder. */

type Addr = { emailAddress?: { name?: string; address?: string } };
type GMessage = {
  id: string;
  subject?: string;
  from?: Addr;
  toRecipients?: Addr[];
  ccRecipients?: Addr[];
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { content?: string };
  hasAttachments?: boolean;
  webLink?: string;
};
type GAttachment = { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; '@odata.type'?: string };

const SUMMARY = 'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,webLink';
const addr = (a: Addr | undefined): MailAddress | null => (a?.emailAddress?.address ? { name: a.emailAddress.name ?? null, address: a.emailAddress.address } : null);
const addrs = (list: Addr[] | undefined) => (list ?? []).map(addr).filter((a): a is MailAddress => a != null);
const recipients = (list: string[] | undefined) => (list ?? []).map((address) => ({ emailAddress: { address } }));

const summary = (m: GMessage): MailSummary => ({
  id: m.id,
  subject: m.subject?.trim() || '(No subject)',
  from: addr(m.from),
  receivedAt: m.receivedDateTime ?? null,
  preview: (m.bodyPreview ?? '').trim(),
  hasAttachments: !!m.hasAttachments,
  url: m.webLink ?? null,
});

/* Graph's $search takes a quoted phrase; quotes inside are dropped. */
export const searchPhrase = (q: string) => `"${q.replace(/["\\]/g, ' ').trim()}"`;

export function outlookMail(call: GraphCall): MailBox {
  return {
    async search({ query, limit }) {
      const top = Math.min(50, Math.max(1, limit));
      const q = query?.trim();
      const r = await call<{ value?: GMessage[] }>({ method: 'GET', path: '/me/messages', query: q ? { $search: searchPhrase(q), $top: top, $select: SUMMARY } : { $orderby: 'receivedDateTime desc', $top: top, $select: SUMMARY } });
      return (r.value ?? []).map(summary);
    },

    async read(id, maxChars) {
      const [m, att] = await Promise.all([
        call<GMessage>({ method: 'GET', path: `/me/messages/${seg(id)}`, query: { $select: `${SUMMARY},toRecipients,ccRecipients,body` }, headers: { prefer: 'outlook.body-content-type="text"' } }),
        call<{ value?: GAttachment[] }>({ method: 'GET', path: `/me/messages/${seg(id)}/attachments`, query: { $select: 'id,name,contentType,size,isInline' } }),
      ]);
      const text = (m.body?.content ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      return {
        ...summary(m),
        to: addrs(m.toRecipients),
        cc: addrs(m.ccRecipients),
        text: text.length > maxChars ? `${text.slice(0, maxChars)}…` : text,
        attachments: (att.value ?? []).filter((a) => !a.isInline && a['@odata.type'] !== '#microsoft.graph.itemAttachment').map((a) => ({ id: a.id, name: a.name ?? 'attachment', mime: a.contentType ?? 'application/octet-stream', sizeBytes: a.size ?? null })),
      };
    },

    async attachment(messageId, attachmentId, maxBytes) {
      const base = `/me/messages/${seg(messageId)}/attachments/${seg(attachmentId)}`;
      const meta = await call<GAttachment>({ method: 'GET', path: base, query: { $select: 'id,name,contentType,size' } });
      const got = await call<BytesBody>({ method: 'GET', path: `${base}/$value`, expect: 'bytes', maxBytes });
      return { name: meta.name ?? 'attachment', mime: meta.contentType ?? got.contentType ?? 'application/octet-stream', bytes: got.bytes };
    },

    async draft(d) {
      if (d.replyTo) {
        const made = await call<GMessage>({
          method: 'POST',
          path: `/me/messages/${seg(d.replyTo)}/createReply`,
          json: { comment: d.text, ...(d.to.length || d.cc?.length ? { message: { ...(d.to.length ? { toRecipients: recipients(d.to) } : {}), ...(d.cc?.length ? { ccRecipients: recipients(d.cc) } : {}) } } : {}) },
        });
        return { id: made.id, url: made.webLink ?? null };
      }
      const made = await call<GMessage>({ method: 'POST', path: '/me/messages', json: { subject: d.subject, body: { contentType: 'Text', content: d.text }, toRecipients: recipients(d.to), ccRecipients: recipients(d.cc) } });
      return { id: made.id, url: made.webLink ?? null };
    },
  };
}
