'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { Icon } from '../Icon';

export function Notice({ kind, children }: { kind: 'err' | 'ok' | 'info'; children: React.ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      <Icon name={kind === 'err' ? 'alert' : kind === 'ok' ? 'check' : 'mail'} />
      <span>{children}</span>
    </div>
  );
}

/* Rough strength: length plus character variety. Only a hint; the server enforces 8–128. */
export function strength(pw: string) {
  if (!pw) return 0;
  let s = pw.length >= 8 ? 1 : 0;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.max(1, Math.min(4, s));
}
const LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export function PasswordField({
  label = 'Password',
  value,
  onChange,
  autoComplete,
  meter = false,
  name = 'password',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  meter?: boolean;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  const s = strength(value);
  return (
    <label className="field">
      {label}
      <span className="pw">
        <input
          className="input"
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={autoComplete === 'new-password' ? 8 : undefined}
          maxLength={128}
          required
        />
        <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
      {meter && (
        <>
          <span className="meter" data-s={s} aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span className="hint">{value ? `${LABEL[s]}. ` : ''}At least 8 characters. A longer phrase is stronger.</span>
        </>
      )}
    </label>
  );
}

const GOOGLE = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8Z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4Z" />
  </svg>
);
const GITHUB = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 1.5a10.5 10.5 0 0 0-3.3 20.5c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.2-1.5-1.2-1.5-1-.7 0-.7 0-.7 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2.1 1.1-2.8-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.9 1.1a10 10 0 0 1 5.2 0c2-1.4 2.9-1.1 2.9-1.1.6 1.4.2 2.5.1 2.8.7.7 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7 1 .7 1.9v2.9c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5Z" />
  </svg>
);

export function OAuthButtons({ providers, next, verb }: { providers: ('google' | 'github')[]; next: string; verb: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!providers.length) return null;
  const go = async (provider: 'google' | 'github') => {
    setBusy(provider);
    const { error } = await signIn.social({ provider, callbackURL: next, errorCallbackURL: '/sign-in?error=oauth' });
    if (error) setBusy(null);
  };
  return (
    <>
      <div className="oauth">
        {providers.includes('google') && (
          <button type="button" className="btn btn-ghost" onClick={() => go('google')} disabled={!!busy}>
            {GOOGLE} {busy === 'google' ? 'Opening Google…' : `${verb} with Google`}
          </button>
        )}
        {providers.includes('github') && (
          <button type="button" className="btn btn-ghost" onClick={() => go('github')} disabled={!!busy}>
            {GITHUB} {busy === 'github' ? 'Opening GitHub…' : `${verb} with GitHub`}
          </button>
        )}
      </div>
      <div className="auth-or">or with email</div>
    </>
  );
}
