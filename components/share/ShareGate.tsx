'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '../Icon';

/* Shown instead of a shared trace whose link has passed its expiry date. */
export function ShareExpired() {
  return (
    <div className="shg">
      <span className="shg-ico">
        <Icon name="clock" />
      </span>
      <h1>This link has expired</h1>
      <p>The person who shared this trace set the link to stop working after a while. Ask them for a new link if you still need it.</p>
      <div className="shg-row">
        <Link className="btn btn-thread" href="/">
          What is Citezeno?
        </Link>
      </div>
    </div>
  );
}

/* A password-protected shared trace asks for its password first. */
export function SharePasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      // the cookie is set: load the page again, now unlocked
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="shg" onSubmit={submit}>
      <span className="shg-ico">
        <Icon name="lock" />
      </span>
      <h1>This trace is password protected</h1>
      <p>Enter the password you were given to read it.</p>
      <label className="field shg-field">
        <span className="sr-only">Password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'shg-err' : undefined}
          maxLength={128}
        />
      </label>
      {error && (
        <p className="shg-err" id="shg-err" role="alert">
          <Icon name="alert" /> {error}
        </p>
      )}
      <button className="btn btn-thread" type="submit" disabled={busy || !password}>
        {busy ? 'Checking…' : 'Open the trace'}
      </button>
    </form>
  );
}
