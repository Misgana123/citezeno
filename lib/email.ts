import { Resend } from 'resend';

/* Outgoing mail goes through Resend. Without RESEND_API_KEY (local development)
   messages are printed to the server console instead, links included, so the
   sign-up and password-reset flows can still be tested end to end. */

const key = process.env.RESEND_API_KEY;
const resend = key ? new Resend(key) : null;

export const emailEnabled = Boolean(resend);
export const FROM = process.env.EMAIL_FROM || 'Citezeno <onboarding@resend.dev>';

type Mail = { to: string | string[]; subject: string; html: string; text: string; replyTo?: string };

export async function sendEmail(m: Mail) {
  if (!resend) {
    console.info(`\n[citezeno] email (not sent, RESEND_API_KEY is unset)\n  to: ${m.to}\n  subject: ${m.subject}\n\n${m.text}\n`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo });
  if (error) throw new Error(`Email could not be sent: ${error.message}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* A plain, widely compatible layout: one column, inline styles, a single button. */
function layout(heading: string, paras: string[], action?: { label: string; url: string }, foot?: string) {
  const p = paras.map((x) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#44526a">${x}</p>`).join('');
  const btn = action
    ? `<p style="margin:24px 0"><a href="${esc(action.url)}" style="display:inline-block;background:#e2a01b;color:#2b1d02;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#75819a">Or paste this link into your browser:<br><a href="${esc(action.url)}" style="color:#133a63;word-break:break-all">${esc(action.url)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#e8ece9;padding:32px 12px;font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:520px;background:#fafbf8;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
  <p style="margin:0 0 24px;font-weight:800;font-size:18px;color:#13213a;letter-spacing:-0.02em">Citezeno</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#13213a">${esc(heading)}</h1>
  ${p}${btn}
  ${foot ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #dbe1e1;font-size:12.5px;line-height:1.5;color:#75819a">${foot}</p>` : ''}
  </td></tr></table></td></tr></table></body></html>`;
}

const ignore = "If you didn't ask for this, you can ignore this email. Nothing will change.";

export function verifyEmail(name: string, url: string) {
  return {
    subject: 'Confirm your email for Citezeno',
    html: layout(`Welcome, ${name || 'there'}`, ['Confirm your email address to finish setting up your Citezeno account. The link works for one hour.'], { label: 'Confirm my email', url }, esc(ignore)),
    text: `Welcome to Citezeno.\n\nConfirm your email address (the link works for one hour):\n${url}\n\n${ignore}`,
  };
}

export function resetEmail(url: string) {
  return {
    subject: 'Reset your Citezeno password',
    html: layout('Reset your password', ['Someone asked to reset the password for this Citezeno account. Choose a new one with the button below. The link works for one hour.'], { label: 'Choose a new password', url }, esc(ignore)),
    text: `Reset your Citezeno password (the link works for one hour):\n${url}\n\n${ignore}`,
  };
}

export function deleteEmail(url: string) {
  return {
    subject: 'Confirm deleting your Citezeno account',
    html: layout('Delete your account?', ['Confirm below to permanently delete your Citezeno account and every trace saved to it. This cannot be undone. The link works for one day.'], { label: 'Delete my account', url }, esc(ignore)),
    text: `Confirm deleting your Citezeno account and all its saved traces (cannot be undone, link works for one day):\n${url}\n\n${ignore}`,
  };
}

export function contactNotice(m: { name: string; email: string; topic: string; message: string }) {
  const body = esc(m.message).replace(/\n/g, '<br>');
  return {
    subject: `[Citezeno contact] ${m.topic}: ${m.name}`,
    html: layout(`New message: ${m.topic}`, [`<b style="color:#13213a">${esc(m.name)}</b> &lt;${esc(m.email)}&gt;`, body], undefined, 'Reply to this email to answer the sender directly.'),
    text: `From: ${m.name} <${m.email}>\nTopic: ${m.topic}\n\n${m.message}`,
  };
}

