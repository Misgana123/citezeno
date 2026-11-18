import 'server-only';
import { sendEmail } from '@/lib/email';
import type { SpendAlert } from './budget';

/* Tell the admins (ADMIN_EMAILS) when Find Papers' OpenAlex spending passes
   the daily alert level or hits the hard cap. Always logged; emailed when set up. */
export async function sendSpendAlert(a: SpendAlert) {
  const what = a.kind === 'cap' ? 'reached the daily cap — searches are paused until midnight UTC' : 'passed the daily alert level';
  const line = `Find Papers OpenAlex spending ${what}: $${a.spentUsd.toFixed(4)} of $${a.limitUsd} on ${a.day}.`;
  console.warn(`[citezeno] papers: ${line}`);
  const to = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) return;
  try {
    await sendEmail({
      to,
      subject: a.kind === 'cap' ? 'Citezeno: Find Papers paused (daily OpenAlex cap reached)' : 'Citezeno: Find Papers spending alert',
      text: `${line}\n\nChange the limits with PAPERS_DAILY_ALERT_USD and PAPERS_DAILY_CAP_USD.`,
      html: `<p>${line}</p><p>Change the limits with PAPERS_DAILY_ALERT_USD and PAPERS_DAILY_CAP_USD.</p>`,
    });
  } catch (e) {
    console.error('[citezeno] papers: spending alert email failed', e);
  }
}
