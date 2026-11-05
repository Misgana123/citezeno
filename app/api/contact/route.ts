import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { TOPICS, type Topic } from '@/lib/contact';
import { logActivity } from '@/lib/activity';
import { pool } from '@/lib/db';
import { contactNotice, sendEmail } from '@/lib/email';
import { clientIp, json, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PER_HOUR = 5;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Bad origin.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send the form as JSON.' }, 400);
  }

  // Honeypot: a hidden field people never fill in. Pretend it worked.
  if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true });

  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const topic = TOPICS.includes(body.topic as Topic) ? (body.topic as string) : 'Other';
  const message = String(body.message ?? '').trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Tell us your name.';
  if (!EMAIL.test(email)) errors.email = 'Enter an email address we can reply to.';
  if (message.length < 10) errors.message = 'Write at least a sentence (10 characters).';
  if (message.length > 5000) errors.message = 'Keep it under 5,000 characters.';
  if (Object.keys(errors).length) return json({ error: 'Check the highlighted fields.', fields: errors }, 422);

  const ip = clientIp(req);
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

  try {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) as n from contact_message where ip = $1 and "createdAt" > now() - interval '1 hour'`,
      [ip],
    );
    if (Number(rows[0].n) >= PER_HOUR) return json({ error: 'You’ve sent several messages in the last hour. Try again later.' }, 429);

    const ins = await pool.query<{ id: string }>(
      `insert into contact_message (name, email, topic, message, "userId", ip) values ($1,$2,$3,$4,$5,$6) returning id`,
      [name, email, topic, message, session?.user.id ?? null, ip],
    );

    const to = process.env.CONTACT_TO;
    if (!to) {
      console.warn('[citezeno] CONTACT_TO is not set; contact message stored but not emailed.');
    } else {
      await sendEmail({ to, replyTo: email, ...contactNotice({ name, email, topic, message }) });
      await pool.query(`update contact_message set delivered = true where id = $1`, [ins.rows[0].id]);
    }
    if (session) await logActivity(session.user.id, 'contact.sent', { title: topic });
    return json({ ok: true });
  } catch (e) {
    console.error('[citezeno] contact failed', e);
    return json({ error: 'We couldn’t send your message just now. Please try again in a few minutes.' }, 500);
  }
}
