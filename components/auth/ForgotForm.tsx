'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient, authMessage } from '@/lib/auth-client';
import { Notice } from './bits';

export function ForgotForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: '/reset-password' });
    setBusy(false);
    if (error) return setErr(authMessage(error));
    setSent(true);
  };

  if (sent)
    return (
      <>
        <Notice kind="ok">
          If an account uses <b>{email.trim()}</b>, a reset link is on its way. It works for one hour. Check your spam folder
          if it hasn’t arrived in a few minutes.
        </Notice>
        <p className="auth-alt">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </>
    );

  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        {err && <Notice kind="err">{err}</Notice>}
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <button className="btn btn-thread" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="auth-alt">
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </>
  );
}
