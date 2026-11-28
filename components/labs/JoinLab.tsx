'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { openSettings } from '../settings/open';
import { inviteInfo, joinLab } from './api';
import { reloadLab } from './useLab';

/* Opened by an invitation link (?lab-invite=…): who invited you to which lab, and Join. */
export function JoinLab({ token, onClose }: { token: string; onClose(): void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof inviteInfo>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    inviteInfo(token)
      .then(setInfo)
      .catch((e) => setError((e as Error).message));
  }, [token]);
  const join = async () => {
    setBusy(true);
    try {
      const { lab } = await joinLab(token);
      toast(`You joined ${lab.name}`);
      await reloadLab();
      onClose();
      openSettings('lab');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="st-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="st st-join" role="dialog" aria-modal="true" aria-labelledby="join-h">
        <span className="st-logo is-plain">
          <Icon name="users" />
        </span>
        {error ? (
          <>
            <h2 id="join-h">This invitation can’t be used</h2>
            <p>{error}</p>
            <button type="button" className="st-btn" onClick={onClose}>
              Close
            </button>
          </>
        ) : !info ? (
          <p>Loading the invitation…</p>
        ) : (
          <>
            <h2 id="join-h">Join {info.lab}</h2>
            <p>
              {info.inviter ? `${info.inviter} invited you` : 'You’re invited'} to {info.role === 'guest' ? 'a project in this lab, as a guest' : `this lab as ${info.role === 'admin' ? 'an admin' : 'a member'}`}: a shared shelf, chats in its projects and lab skills.
            </p>
            <div className="st-acts">
              <button type="button" className="st-btn" onClick={onClose}>
                Not now
              </button>
              <button type="button" className="st-btn is-dark" disabled={busy} onClick={join}>
                {busy ? 'Joining…' : 'Join the lab'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
