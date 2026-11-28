'use client';

import { useState } from 'react';
import { authClient, authMessage, signOut } from '@/lib/auth-client';
import { timeAgo } from '@/lib/library';
import { useRouter } from 'next/navigation';
import { Notice, PasswordField } from '../../auth/bits';
import { TwoFactorPanel } from '../../account/TwoFactorPanel';
import { AppLogo } from '../../connectors/AppLogo';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import type { AccountState } from '../useAccount';
import { deviceName, PROVIDER_NAMES } from './shared';

type Provider = 'google' | 'github';

/* Security: the ways you sign in, your password, two-step sign-in, and where you're signed in. */
export function SecuritySection({ account }: { account: AccountState }) {
  const a = account.data!;
  const router = useRouter();
  const hasPassword = a.providers.includes('credential');
  const sessions = a.sessions;
  const setSessions = (keep: (s: (typeof sessions)[number]) => boolean) => account.set({ ...a, sessions: sessions.filter(keep) });

  const link = async (provider: Provider) => {
    const { error } = await authClient.linkSocial({ provider, callbackURL: '/app/chat?settings=security' });
    if (error) toast(authMessage(error), true);
  };

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
    if (revokeOthers) setSessions((s) => s.token === a.currentToken);
  };

  const revoke = async (token: string) => {
    const { error } = await authClient.revokeSession({ token });
    if (error) return toast(authMessage(error), true);
    setSessions((s) => s.token !== token);
    toast('Device signed out');
  };
  const revokeAll = async () => {
    const { error } = await authClient.revokeOtherSessions();
    if (error) return toast(authMessage(error), true);
    setSessions((s) => s.token === a.currentToken);
    toast('Signed out of all other devices');
  };
  const out = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <section>
      <h3>Security</h3>
      <p className="st-lead">How you sign in, and where you’re signed in now.</p>

      <div className="st-group">
        <h4>Sign-in methods</h4>
        <div className="st-box">
          {['credential', ...a.available].map((p) => {
            const on = a.providers.includes(p);
            return (
              <div className="st-line" key={p}>
                {p === 'credential' ? (
                  <span className="st-logo is-plain">
                    <Icon name="key" />
                  </span>
                ) : (
                  <AppLogo app={p} />
                )}
                <div className="st-txt">
                  <b>
                    {PROVIDER_NAMES[p] || p}
                    {on && <span className="st-tag is-ok">{p === 'credential' ? 'On' : 'Connected'}</span>}
                  </b>
                  <small>{p === 'credential' ? (on ? a.user.email : 'Not set up. Use “Forgot password” on the sign-in page to add one.') : on ? 'You can sign in with this account.' : 'Not connected.'}</small>
                </div>
                {!on && p !== 'credential' && (
                  <button type="button" className="st-btn" onClick={() => link(p as Provider)}>
                    Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {hasPassword && (
        <form className="st-group" onSubmit={changePw}>
          <h4>Change password</h4>
          {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
          <div className="st-row2">
            <PasswordField label="Current password" name="current" value={cur} onChange={setCur} autoComplete="current-password" />
            <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" meter />
          </div>
          <label className="st-check">
            <input type="checkbox" checked={revokeOthers} onChange={(e) => setRevokeOthers(e.target.checked)} /> Sign out my other devices
          </label>
          <button className="st-btn is-dark" disabled={pwBusy || !cur || pw.length < 8}>
            {pwBusy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      )}

      <div className="st-group">
        <h4>Two-step sign-in</h4>
        <div className="st-box">
          <TwoFactorPanel enabled={a.user.twoFactorEnabled} hasPassword={hasPassword} />
        </div>
      </div>

      <div className="st-group">
        <h4>Devices</h4>
        <p className="st-hint">Sign out anything you don’t recognise, then change your password.</p>
        <div className="st-box">
          {sessions.map((s) => (
            <div className="st-line" key={s.token}>
              <div className="st-txt">
                <b>
                  {deviceName(s.userAgent)}
                  {s.token === a.currentToken && <span className="st-tag">This device</span>}
                </b>
                <small>
                  Signed in {timeAgo(s.createdAt)}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                </small>
              </div>
              {s.token === a.currentToken ? (
                <button type="button" className="st-btn is-ghost" onClick={out}>
                  <Icon name="logout" /> Sign out
                </button>
              ) : (
                <button type="button" className="st-btn is-ghost" onClick={() => revoke(s.token)}>
                  Sign out
                </button>
              )}
            </div>
          ))}
        </div>
        {sessions.length > 1 && (
          <div className="st-acts" style={{ marginTop: 12 }}>
            <button type="button" className="st-btn" onClick={revokeAll}>
              Sign out of all other devices
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
