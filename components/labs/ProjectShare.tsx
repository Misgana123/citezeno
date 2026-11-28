'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { inviteToLab, projectGuests, setProjectAccess } from './api';

/* Share one lab project with guests (people outside the lab): invite by email
   with view or edit access, change it, or take it away. Members already see it. */
export function ProjectShare({ projectId, name, onClose }: { projectId: string; name: string; onClose(): void }) {
  const [people, setPeople] = useState<{ userId: string; name: string; email: string; access: 'view' | 'edit' }[] | null>(null);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<'view' | 'edit'>('view');
  const [busy, setBusy] = useState(false);
  const load = () =>
    projectGuests(projectId)
      .then((r) => setPeople(r.people))
      .catch((e) => toast((e as Error).message, true));
  useEffect(() => {
    void load();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      await load();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="st-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="st st-share" role="dialog" aria-modal="true" aria-labelledby="share-h">
        <div className="st-top">
          <h2 id="share-h">Share “{name}”</h2>
          <button type="button" className="st-ib" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="st-pane">
          <p className="st-lead">Everyone in the lab already sees this project. Guests see only the projects shared with them.</p>
          <form
            className="st-invite"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => inviteToLab({ email, role: 'guest', projectId, access }), `Invitation sent to ${email}`)) setEmail('');
            }}
          >
            <input className="st-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@university.edu" aria-label="Guest’s email" required />
            <select className="st-input" value={access} onChange={(e) => setAccess(e.target.value as 'view' | 'edit')} aria-label="Access">
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button className="st-btn is-dark" disabled={busy || !email.trim()}>
              Invite guest
            </button>
          </form>
          <div className="st-group">
            <h4>Guests</h4>
            {people == null ? (
              <div className="st-loading">Loading…</div>
            ) : people.length === 0 ? (
              <div className="st-empty">No guests yet.</div>
            ) : (
              <div className="st-box">
                {people.map((p) => (
                  <div className="st-line" key={p.userId}>
                    <div className="st-txt">
                      <b>{p.name}</b>
                      <small>{p.email}</small>
                    </div>
                    <select className="st-input" value={p.access} disabled={busy} aria-label={`Access for ${p.name}`} onChange={(e) => run(() => setProjectAccess(projectId, p.userId, e.target.value as 'view' | 'edit'), 'Access changed')}>
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <button type="button" className="st-ib" aria-label={`Stop sharing with ${p.name}`} disabled={busy} onClick={() => run(() => setProjectAccess(projectId, p.userId, null), 'No longer shared')}>
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
