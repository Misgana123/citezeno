'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient, authMessage, signOut } from '@/lib/auth-client';
import { timeAgo } from '@/lib/library';
import { Notice, PasswordField } from '../auth/bits';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { initials } from '../UserMenu';

type User = { id: string; name: string; email: string; image: string | null; emailVerified: boolean; createdAt: number };
type Sess = { token: string; userAgent: string; ipAddress: string; createdAt: number; expiresAt: number };
type Provider = 'google' | 'github';

const NAMES: Record<string, string> = { credential: 'Email and password', google: 'Google', github: 'GitHub' };

function device(ua: string) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function AccountPanels({
  user,
  currentToken,
  providers,
  available,
  sessions: initialSessions,
  stats,
}: {
  user: User;
  currentToken: string;
  providers: string[];
  available: Provider[];
  sessions: Sess[];
  stats: { traces: number; sources: number; last: number | null };
}) {
  const router = useRouter();
  const hasPassword = providers.includes('credential');

  /* ---- profile ---- */
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSavingName(false);
    if (error) return toast(authMessage(error), true);
    toast('Name updated');
    router.refresh();
  };
  const resend = async () => {
    const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: '/account' });
    toast(error ? authMessage(error) : `Confirmation link sent to ${user.email}`, !!error);
  };

  /* ---- password ---- */
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: pw, revokeOtherSessions: revokeOthers });
    setPwBusy(false);
    if (error) return setPwMsg({ kind: 'err', text: authMessage(error) });
    setCur('');
    setPw('');
    setPwMsg({ kind: 'ok', text: revokeOthers ? 'Password changed. Your other devices were signed out.' : 'Password changed.' });
    if (revokeOthers) setSessions((xs) => xs.filter((s) => s.token === currentToken));
  };

  /* ---- sessions ---- */
  const [sessions, setSessions] = useState(initialSessions);
  const revoke = async (token: string) => {
    const { error } = await authClient.revokeSession({ token });
    if (error) return toast(authMessage(error), true);
    setSessions((xs) => xs.filter((s) => s.token !== token));
    toast('Device signed out');
  };
  const revokeAll = async () => {
    const { error } = await authClient.revokeOtherSessions();
    if (error) return toast(authMessage(error), true);
    setSessions((xs) => xs.filter((s) => s.token === currentToken));
    toast('Signed out of all other devices');
  };

  /* ---- linked accounts ---- */
  const link = async (provider: Provider) => {
    const { error } = await authClient.linkSocial({ provider, callbackURL: '/account' });
    if (error) toast(authMessage(error), true);
  };

  /* ---- delete ---- */
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const del = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelBusy(true);
    setDelMsg(null);
    const { data, error } = await authClient.deleteUser({ ...(hasPassword ? { password: delPw } : {}), callbackURL: '/' });
    setDelBusy(false);
    if (error) {
      const text = error.code === 'SESSION_EXPIRED' ? 'For your security, sign out and sign in again, then delete your account.' : authMessage(error);
      return setDelMsg({ kind: 'err', text });
    }
    if (data && 'message' in data && /verif/i.test(String(data.message))) {
      return setDelMsg({ kind: 'ok', text: `We’ve emailed ${user.email} a link. Your account is deleted once you open it.` });
    }
    toast('Your account was deleted');
    router.push('/');
    router.refresh();
  };

  const out = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="acct">
      <nav className="acct-nav" aria-label="Account sections">
        <a href="#profile">Profile</a>
        <a href="#library">Library</a>
        <a href="#security">Sign-in and security</a>
        <a href="#devices">Devices</a>
        <a href="#danger">Delete account</a>
      </nav>

      <div className="acct-main">
        <section className="panel" id="profile">
          <div className="who">
            <div className="avatar">{user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : initials(user.name, user.email)}</div>
            <div>
              <b>{user.name}</b>
              <span>
                {user.email}
                {user.emailVerified ? (
                  <span className="badge ok">
                    <Icon name="check" /> Confirmed
                  </span>
                ) : (
                  <span className="badge warn">Not confirmed</span>
                )}
              </span>
              <span style={{ display: 'block', fontSize: 12.5 }}>Member since {fmtDate(user.createdAt)}</span>
            </div>
          </div>
          {!user.emailVerified && (
            <div style={{ marginBottom: 18 }}>
              <Notice kind="info">
                Your email isn’t confirmed yet.{' '}
                <button type="button" className="link" onClick={resend} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                  Send a new confirmation link
                </button>
              </Notice>
            </div>
          )}
          <form onSubmit={saveName}>
            <label className="field">
              Display name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoComplete="name" />
            </label>
            <div className="actions">
              <button className="btn btn-sm" disabled={savingName || !name.trim() || name.trim() === user.name}>
                {savingName ? 'Saving…' : 'Save name'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel" id="library">
          <h2>Library</h2>
          <p>Every trace you run while signed in is saved to your account and appears in the studio library on any device.</p>
          <div className="stats">
            <div className="stat">
              <b>{stats.traces}</b>
              <span>Saved traces</span>
            </div>
            <div className="stat">
              <b>{stats.sources}</b>
              <span>Sources cited</span>
            </div>
            <div className="stat">
              <b>{stats.last ? timeAgo(stats.last) : '—'}</b>
              <span>Last saved</span>
            </div>
          </div>
          <Link className="btn btn-thread btn-sm" href="/studio">
            Open the studio
          </Link>
        </section>

        <section className="panel" id="security">
          <h2>Sign-in and security</h2>
          <p>The ways you can sign in to Citezeno.</p>
          <ul className="rows" style={{ marginBottom: 22 }}>
            {['credential', ...available].map((p) => {
              const on = providers.includes(p);
              return (
                <li key={p}>
                  <span>
                    <b>{NAMES[p] || p}</b>
                    {on && <span className="tag">Connected</span>}
                    <small>{p === 'credential' ? (on ? user.email : 'Not set up. Use “Forgot password” on the sign-in page to add one.') : on ? 'You can sign in with this account.' : 'Not connected.'}</small>
                  </span>
                  {!on && p !== 'credential' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => link(p as Provider)}>
                      Connect
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {hasPassword && (
            <form onSubmit={changePw}>
              <h3 className="h3" style={{ fontSize: 16 }}>
                Change password
              </h3>
              {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
              <PasswordField label="Current password" name="current" value={cur} onChange={setCur} autoComplete="current-password" />
              <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" meter />
              <label className="check">
                <input type="checkbox" checked={revokeOthers} onChange={(e) => setRevokeOthers(e.target.checked)} /> Sign out my other devices
              </label>
              <div className="actions">
                <button className="btn btn-sm" disabled={pwBusy || !cur || pw.length < 8}>
                  {pwBusy ? 'Changing…' : 'Change password'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="panel" id="devices">
          <h2>Devices</h2>
          <p>Where you’re signed in now. Sign out anything you don’t recognise, then change your password.</p>
          <ul className="rows">
            {sessions.map((s) => (
              <li key={s.token}>
                <span>
                  <b>{device(s.userAgent)}</b>
                  {s.token === currentToken && <span className="tag">This device</span>}
                  <small>
                    Signed in {timeAgo(s.createdAt)}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                  </small>
                </span>
                {s.token === currentToken ? (
                  <button className="btn btn-ghost btn-sm" onClick={out}>
                    <Icon name="logout" /> Sign out
                  </button>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => revoke(s.token)}>
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={revokeAll}>
                Sign out of all other devices
              </button>
            </div>
          )}
        </section>

        <section className="panel danger" id="danger">
          <h2>Delete account</h2>
          <p>This permanently deletes your account and every trace saved to it. Traces kept in this browser stay on this device.</p>
          {!delOpen ? (
            <div className="actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setDelOpen(true)}>
                <Icon name="trash" /> Delete my account…
              </button>
            </div>
          ) : (
            <form onSubmit={del}>
              {delMsg && <Notice kind={delMsg.kind}>{delMsg.text}</Notice>}
              {hasPassword && <PasswordField label="Your password" name="delete-password" value={delPw} onChange={setDelPw} autoComplete="current-password" />}
              <label className="field">
                Type DELETE to confirm
                <input className="input" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} autoComplete="off" />
              </label>
              <div className="actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDelOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-sm" disabled={delBusy || delConfirm !== 'DELETE' || (hasPassword && !delPw)}>
                  {delBusy ? 'Deleting…' : 'Delete account permanently'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
