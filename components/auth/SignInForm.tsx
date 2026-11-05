'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authMessage, signIn } from '@/lib/auth-client';
import { Notice, OAuthButtons, PasswordField } from './bits';

export function SignInForm({ providers, next, error }: { providers: ('google' | 'github')[]; next: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string } | null>(
    error ? { kind: 'err', text: error === 'oauth' ? 'That sign-in was cancelled or failed. Try again.' : 'Sign in failed. Try again.' } : null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await signIn.email({ email: email.trim(), password, rememberMe: remember, callbackURL: next });
    if (error) {
      setBusy(false);
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        setMsg({ kind: 'info', text: `Confirm your email first. We’ve sent a new link to ${email.trim()}.` });
      } else setMsg({ kind: 'err', text: authMessage(error) });
      return;
    }
    router.push(next);
    router.refresh();
  };

  const q = next !== '/studio' ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <>
      <OAuthButtons providers={providers} next={next} verb="Continue" />
      <form className="auth-form" onSubmit={submit}>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="auth-row">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in
          </label>
          <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>Forgot password?</Link>
        </div>
        <button className="btn btn-thread" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-alt">
        New to Citezeno? <Link href={`/sign-up${q}`}>Create an account</Link>
      </p>
    </>
  );
}
