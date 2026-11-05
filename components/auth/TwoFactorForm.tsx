'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient, authMessage } from '@/lib/auth-client';
import { Notice } from './bits';

export function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const clean = useBackup ? code.trim() : code.replace(/\D/g, '');
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: clean, trustDevice: trust });
    if (error) {
      setBusy(false);
      setErr(error.status === 401 ? 'Your sign-in expired. Start again.' : authMessage(error));
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        {err && <Notice kind="err">{err}</Notice>}
        <label className="field">
          {useBackup ? 'Backup code' : 'Authentication code'}
          <input
            className="input otp-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={useBackup ? 32 : 7}
            placeholder={useBackup ? 'xxxxx-xxxxx' : '123 456'}
            required
            autoFocus
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} /> Trust this device for 30 days
        </label>
        <button className="btn btn-thread" disabled={busy}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
      </form>
      <p className="auth-alt">
        <button
          type="button"
          className="link"
          style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => {
            setUseBackup((b) => !b);
            setCode('');
            setErr(null);
          }}
        >
          {useBackup ? 'Use your authenticator app instead' : 'Lost your phone? Use a backup code'}
        </button>
        <br />
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </>
  );
}
