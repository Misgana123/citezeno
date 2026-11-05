'use client';

import { useEffect, useState } from 'react';
import { authClient, authMessage } from '@/lib/auth-client';
import { Notice } from './bits';

export function ResendVerification({ email, next }: { email: string; next: string }) {
  const [wait, setWait] = useState(30);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (!email) return null;
  const send = async () => {
    setWait(60);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: next });
    setMsg(error ? { kind: 'err', text: authMessage(error) } : { kind: 'ok', text: 'Sent. Check your inbox.' });
  };

  return (
    <div className="auth-form" style={{ marginTop: 20 }}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button className="btn btn-ghost" onClick={send} disabled={wait > 0}>
        {wait > 0 ? `Resend the email in ${wait}s` : 'Resend the email'}
      </button>
    </div>
  );
}
