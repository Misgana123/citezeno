'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient, authMessage } from '@/lib/auth-client';
import { toast } from '../toast';
import { Notice, PasswordField } from './bits';

export function ResetForm({ token, linkError }: { token?: string; linkError?: string }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!token || linkError)
    return (
      <>
        <Notice kind="err">This reset link has expired or was already used. Ask for a new one.</Notice>
        <p className="auth-alt">
          <Link href="/forgot-password">Send a new link</Link>
        </p>
      </>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setErr('The two passwords don’t match.');
    setBusy(true);
    setErr(null);
    const { error } = await authClient.resetPassword({ newPassword: pw, token });
    if (error) {
      setBusy(false);
      return setErr(authMessage(error));
    }
    toast('Password changed. Sign in with your new password.');
    router.push('/sign-in');
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      {err && <Notice kind="err">{err}</Notice>}
      <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" meter />
      <PasswordField label="Repeat the new password" name="password2" value={pw2} onChange={setPw2} autoComplete="new-password" />
      <button className="btn btn-thread" disabled={busy}>
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}
