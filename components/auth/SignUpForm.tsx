'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authMessage, signUp } from '@/lib/auth-client';
import { Notice, OAuthButtons, PasswordField } from './bits';

export function SignUpForm({ providers, next }: { providers: ('google' | 'github')[]; next: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return setErr('Please accept the terms and privacy policy to continue.');
    setBusy(true);
    setErr(null);
    const { data, error } = await signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: next });
    if (error) {
      setBusy(false);
      return setErr(authMessage(error));
    }
    if (data?.token) {
      // signed in straight away (email confirmation is off)
      router.push(next);
      router.refresh();
    } else {
      router.push(`/verify-email?email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(next)}`);
    }
  };

  const q = next !== '/studio' ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <>
      <OAuthButtons providers={providers} next={next} verb="Sign up" />
      <form className="auth-form" onSubmit={submit}>
        {err && <Notice kind="err">{err}</Notice>}
        <label className="field">
          Name
          <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus />
        </label>
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <PasswordField value={password} onChange={setPassword} autoComplete="new-password" meter />
        <label className="check" style={{ fontWeight: 500, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            I agree to the{' '}
            <Link className="link" href="/terms" target="_blank">
              terms
            </Link>{' '}
            and the{' '}
            <Link className="link" href="/privacy" target="_blank">
              privacy policy
            </Link>
            .
          </span>
        </label>
        <button className="btn btn-thread" disabled={busy}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-alt">
        Already have an account? <Link href={`/sign-in${q}`}>Sign in</Link>
      </p>
    </>
  );
}
