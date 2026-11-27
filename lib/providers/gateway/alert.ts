import 'server-only';
import { sendEmail } from '@/lib/email';
import type { SpendAlert } from './budget';

/* Tell the admins (ADMIN_EMAILS) when a provider's spending passes its daily
   alert level or hits its hard cap. Always logged; emailed when set up. */
export async function sendSpendAlert(a: SpendAlert) {
  const what = a.kind === 'cap' ? 'reached the daily cap — calls are paused until midnight UTC' : 'passed the daily alert level';
  const line = `${a.label} spending ${what}: $${a.spentUsd.toFixed(4)} of $${a.limitUsd} on ${a.day}.`;
  console.warn(`[citezeno] ${a.provider}: ${line}`);
  const to = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) return;
  try {
    await sendEmail({
      to,
      subject: a.kind === 'cap' ? `Citezeno: ${a.label} calls paused (daily cap reached)` : `Citezeno: ${a.label} spending alert`,
      text: `${line}\n\nChange the limits with ${a.configHint}.`,
      html: `<p>${line}</p><p>Change the limits with ${a.configHint}.</p>`,
    });
  } catch (e) {
    console.error(`[citezeno] ${a.provider}: spending alert email failed`, e);
  }
}
