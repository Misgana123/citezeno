'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient, authMessage } from '@/lib/auth-client';
import { Notice, PasswordField } from '../../auth/bits';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import { initials } from '../../UserMenu';
import type { AccountState } from '../useAccount';
import { longDate } from './shared';

/* Account: who you are (name, email), and deleting the account. */
export function AccountSection({ account }: { account: AccountState }) {
  const a = account.data!;
  const u = a.user;
  const router = useRouter();
  const hasPassword = a.providers.includes('credential');

  const [name, setName] = useState(u.name);
  const [saving, setSaving] = useState(false);
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (error) return toast(authMessage(error), true);
    toast('Name updated');
    account.set({ ...a, user: { ...u, name: name.trim() } });
    router.refresh();
  };
  const resend = async () => {
    const { error } = await authClient.sendVerificationEmail({ email: u.email, callbackURL: '/app/chat?settings=account' });
    toast(error ? authMessage(error) : `Confirmation link sent to ${u.email}`, !!error);
  };

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
    if (error) return setDelMsg({ kind: 'err', text: error.code === 'SESSION_EXPIRED' ? 'For your security, sign out and sign in again, then delete your account.' : authMessage(error) });
    if (data && 'message' in data && /verif/i.test(String(data.message))) return setDelMsg({ kind: 'ok', text: `We’ve emailed ${u.email} a link. Your account is deleted once you open it.` });
    toast('Your account was deleted');
    router.push('/');
    router.refresh();
  };

  return (
    <section>
      <h3>Account</h3>
      <p className="st-lead">Your profile, and how people see you in chats you share.</p>
      {a.admin && (
        <div className="st-group">
          <Link className="st-btn" href="/admin">
            <Icon name="chart" /> Admin dashboard
          </Link>
        </div>
      )}
      <div className="st-who">
        <span className="st-av">{u.image ? <img src={u.image} alt="" referrerPolicy="no-referrer" /> : initials(u.name, u.email)}</span>
        <div>
          <b>{u.name || u.email}</b>
          <span>
            {u.email}{' '}
            {u.emailVerified ? (
              <span className="st-tag is-ok">
                <Icon name="check" />
                Confirmed
              </span>
            ) : (
              <span className="st-tag is-bad">Not confirmed</span>
            )}
          </span>
          <br />
          <span>Member since {longDate(u.createdAt)}</span>
        </div>
      </div>
      {!u.emailVerified && (
        <div className="st-group">
          <Notice kind="info">
            Your email isn’t confirmed yet.{' '}
            <button type="button" className="link" onClick={resend} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
              Send a new confirmation link
            </button>
          </Notice>
        </div>
      )}
      <form className="st-group" onSubmit={saveName}>
        <label className="st-field">
          Display name
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoComplete="name" />
        </label>
        <label className="st-field">
          Email
          <input className="st-input" value={u.email} disabled />
        </label>
        <button className="st-btn is-dark" disabled={saving || !name.trim() || name.trim() === u.name}>
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </form>
      <div className="st-group">
        <h4>Delete account</h4>
        <div className="st-box is-danger">
          <div className="st-line st-wrap">
            <div className="st-txt">
              <b>Delete your account</b>
              <small>Deletes your account, your shelf, your chats and every saved trace. A lab you own is deleted too: hand it over first in Settings → Lab. This can’t be undone.</small>
            </div>
            {!delOpen && (
              <button type="button" className="st-btn is-danger" onClick={() => setDelOpen(true)}>
                Delete account…
              </button>
            )}
            {delOpen && (
              <form onSubmit={del}>
                {delMsg && <Notice kind={delMsg.kind}>{delMsg.text}</Notice>}
                {hasPassword && <PasswordField label="Your password" name="delete-password" value={delPw} onChange={setDelPw} autoComplete="current-password" />}
                <label className="st-field">
                  Type DELETE to confirm
                  <input className="st-input" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} autoComplete="off" />
                </label>
                <div className="st-acts">
                  <button type="button" className="st-btn" onClick={() => setDelOpen(false)}>
                    Cancel
                  </button>
                  <button className="st-btn is-danger" disabled={delBusy || delConfirm !== 'DELETE' || (hasPassword && !delPw)}>
                    {delBusy ? 'Deleting…' : 'Delete account permanently'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
