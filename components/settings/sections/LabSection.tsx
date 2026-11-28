'use client';

import Link from 'next/link';
import { useState } from 'react';
import { canManage, type LabMember } from '@/lib/labs/types';
import { confirmDialog } from '../../confirm';
import { Icon } from '../../Icon';
import { toast } from '../../toast';
import * as api from '../../labs/api';
import { reloadLab, setLab, useLab } from '../../labs/useLab';
import { longDate } from './shared';

/* Settings → Lab: make a lab (Lab plan), its people (roles, monthly credit
   caps), invitations (email, share link), and handing over or deleting it. */

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member', guest: 'Guest' } as const;

export function LabSection({ userId }: { userId: string }) {
  const { lab: view } = useLab();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await reloadLab();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!view) return <div className="st-loading">Loading…</div>;
  if (!view.lab) return <NoLab canCreate={view.canCreate} guestOf={view.guestOf} busy={busy} run={run} />;

  const manage = canManage(view.role);
  const owner = view.role === 'owner';
  const seatsUsed = view.members.filter((m) => m.role === 'admin' || m.role === 'member').length + view.invites.filter((i) => i.role !== 'guest').length;

  return (
    <section>
      <h3>{view.lab.name}</h3>
      <p className="st-lead">
        Your lab shares a shelf, chats in its projects, skills and the Lab plan’s credits. You’re {view.role === 'owner' ? 'its owner' : `a ${ROLE_LABEL[view.role!].toLowerCase()}`}; it started {longDate(view.lab.createdAt)}.
      </p>

      <div className="st-group">
        <h4>
          People <span className="st-count">{seatsUsed} of {view.seats} seats</span>
        </h4>
        <p className="st-hint">The owner and guests don’t take a seat. Lab work is paid from the owner’s credits; a member past their monthly cap uses their own.</p>
        <div className="st-box">
          {view.members.map((m) => (
            <MemberLine key={m.userId} m={m} me={m.userId === userId} manage={manage} owner={owner} busy={busy} run={run} />
          ))}
        </div>
      </div>

      {manage && <Invites view={view} owner={owner} busy={busy} run={run} />}

      <div className="st-group">
        <h4>Lab settings</h4>
        <div className="st-box">
          {manage && <Rename name={view.lab.name} busy={busy} run={run} />}
          {owner ? (
            <>
              <Transfer members={view.members.filter((m) => m.role === 'admin' || m.role === 'member')} busy={busy} run={run} />
              <div className="st-line st-wrap">
                <div className="st-txt">
                  <b>Delete the lab</b>
                  <small>Deletes the lab’s shelf, its projects and lab skills. Chats in lab projects stay with the people who started them.</small>
                </div>
                <button
                  type="button"
                  className="st-btn is-danger"
                  disabled={busy}
                  onClick={async () => {
                    if (await confirmDialog({ title: `Delete “${view.lab!.name}”?`, body: 'Its shelf, projects and lab skills are deleted for everyone. This can’t be undone.', confirmLabel: 'Delete the lab', danger: true })) await run(api.deleteLab, 'Lab deleted');
                  }}
                >
                  Delete lab…
                </button>
              </div>
            </>
          ) : (
            <div className="st-line">
              <div className="st-txt">
                <b>Leave the lab</b>
                <small>You lose access to its shelf and chats. Your own shelf and chats stay yours.</small>
              </div>
              <button
                type="button"
                className="st-btn is-danger"
                disabled={busy}
                onClick={async () => {
                  if (await confirmDialog({ title: `Leave “${view.lab!.name}”?`, body: 'An admin can invite you again.', confirmLabel: 'Leave', danger: true })) await run(() => api.removeMember('me'), 'You left the lab');
                }}
              >
                Leave
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

function NoLab({ canCreate, guestOf, busy, run }: { canCreate: boolean; guestOf: { id: string; name: string }[]; busy: boolean; run: Run }) {
  const [name, setName] = useState('');
  return (
    <section>
      <h3>Lab</h3>
      <p className="st-lead">A shared space for a research group: a lab shelf, chats in its projects, lab skills and one credit pool.</p>
      {canCreate ? (
        <form
          className="st-group"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(async () => setLab(await api.createLab(name)), 'Lab created');
          }}
        >
          <label className="st-field">
            Lab name
            <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Memory and Sleep Lab" maxLength={80} required />
          </label>
          <button className="st-btn is-dark" disabled={busy || !name.trim()}>
            <Icon name="plus" /> Create the lab
          </button>
        </form>
      ) : (
        <div className="st-group">
          <div className="st-box">
            <div className="st-line st-wrap">
              <div className="st-txt">
                <b>A lab comes with the Lab plan</b>
                <small>You + 5 people, a shared shelf and chats, lab skills, one credit pool, and Python runs. If someone invited you, open the link from their email.</small>
              </div>
              <Link className="st-btn is-dark" href="/pricing">
                See the Lab plan
              </Link>
            </div>
          </div>
        </div>
      )}
      {guestOf.length > 0 && (
        <div className="st-group">
          <h4>Labs you’re a guest in</h4>
          <div className="st-box">
            {guestOf.map((g) => (
              <div className="st-line" key={g.id}>
                <div className="st-txt">
                  <b>{g.name}</b>
                  <small>You see the projects shared with you, on your shelf’s lab switch.</small>
                </div>
                <button type="button" className="st-btn" disabled={busy} onClick={() => run(() => api.removeMember('me', g.id), `You left ${g.name}`)}>
                  Leave
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MemberLine({ m, me, manage, owner, busy, run }: { m: LabMember; me: boolean; manage: boolean; owner: boolean; busy: boolean; run: Run }) {
  const [cap, setCap] = useState(m.creditCap == null ? '' : String(m.creditCap));
  const editable = manage && !me && m.role !== 'owner' && (owner || m.role !== 'admin');
  const saveCap = () => {
    const v = cap.trim() === '' ? null : Math.max(0, Math.floor(Number(cap)));
    if (v !== null && !Number.isFinite(v)) return;
    if (v !== m.creditCap) void run(() => api.updateMember(m.userId, { creditCap: v }), 'Credit cap saved');
  };
  return (
    <div className="st-line st-wrap">
      <span className="st-av st-av-sm">{(m.name[0] ?? '?').toUpperCase()}</span>
      <div className="st-txt">
        <b>
          {m.name}
          {me && <span className="st-tag">You</span>}
          {(!editable || m.role === 'guest') && <span className="st-tag">{ROLE_LABEL[m.role]}</span>}
        </b>
        <small>
          {m.email}
          {m.usedThisMonth != null && m.role !== 'guest' ? ` · ${m.usedThisMonth.toLocaleString('en-US')} lab credits this month` : ''}
        </small>
      </div>
      {editable && m.role !== 'guest' && (
        <>
          <label className="st-cap" title="The most lab credits they may spend this month (empty: no cap)">
            Cap
            <input className="st-input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))} onBlur={saveCap} placeholder="none" aria-label={`Monthly credit cap for ${m.name}`} />
          </label>
          <select className="st-input" value={m.role} disabled={busy} aria-label={`Role of ${m.name}`} onChange={(e) => run(() => api.updateMember(m.userId, { role: e.target.value as 'admin' | 'member' }), 'Role changed')}>
            {owner && <option value="admin">Admin</option>}
            <option value="member">Member</option>
          </select>
        </>
      )}
      {editable && (
        <button
          type="button"
          className="st-ib"
          aria-label={`Remove ${m.name}`}
          title="Remove from the lab"
          disabled={busy}
          onClick={async () => {
            if (await confirmDialog({ title: `Remove ${m.name}?`, body: 'They lose access to the lab’s shelf and chats.', confirmLabel: 'Remove', danger: true })) await run(() => api.removeMember(m.userId), 'Removed');
          }}
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

function Invites({ view, owner, busy, run }: { view: NonNullable<ReturnType<typeof useLab>['lab']>; owner: boolean; busy: boolean; run: Run }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  return (
    <div className="st-group">
      <h4>Invite people</h4>
      <form
        className="st-invite"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.inviteToLab({ email, role }), `Invitation sent to ${email}`)) setEmail('');
        }}
      >
        <input className="st-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@university.edu" aria-label="Email" required />
        <select className="st-input" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')} aria-label="Role">
          <option value="member">Member</option>
          {owner && <option value="admin">Admin</option>}
        </select>
        <button className="st-btn is-dark" disabled={busy || !email.trim()}>
          Send invite
        </button>
      </form>
      <p className="st-hint">Invitations work for 7 days and only for that email. To share one project with someone outside the lab, use Share on the project in your shelf.</p>
      <div className="st-box">
        <div className="st-line st-wrap">
          <div className="st-txt">
            <b>Share link</b>
            <small>{view.link.on ? 'Anyone with this link joins as a member while seats are free.' : 'Turn on a link anyone can use to join as a member.'}</small>
          </div>
          {view.link.url && (
            <button
              type="button"
              className="st-btn"
              onClick={async () => {
                await navigator.clipboard.writeText(view.link.url!).catch(() => {});
                toast('Link copied');
              }}
            >
              <Icon name="copy" /> Copy link
            </button>
          )}
          <button type="button" className={`st-switch${view.link.on ? ' is-on' : ''}`} role="switch" aria-checked={view.link.on} aria-label="Share link" disabled={busy} onClick={() => run(() => api.setShareLink(!view.link.on), view.link.on ? 'Link turned off' : 'Link turned on')} />
        </div>
        {view.invites.map((i) => (
          <div className="st-line" key={i.id}>
            <div className="st-txt">
              <b>
                {i.email} <span className="st-tag">{ROLE_LABEL[i.role]}</span>
              </b>
              <small>Invited {longDate(i.createdAt)}{i.expiresAt ? ` · until ${longDate(i.expiresAt)}` : ''}</small>
            </div>
            <button type="button" className="st-btn is-ghost" disabled={busy} onClick={() => run(() => api.cancelInvite(i.id), 'Invitation cancelled')}>
              Cancel
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Rename({ name: initial, busy, run }: { name: string; busy: boolean; run: Run }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="st-line st-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => setLab(await api.renameLab(name)), 'Lab renamed');
      }}
    >
      <div className="st-txt">
        <b>Name</b>
      </div>
      <input className="st-input st-input-inline" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Lab name" />
      <button className="st-btn" disabled={busy || !name.trim() || name.trim() === initial}>
        Save
      </button>
    </form>
  );
}

function Transfer({ members, busy, run }: { members: LabMember[]; busy: boolean; run: Run }) {
  const [to, setTo] = useState('');
  return (
    <div className="st-line st-wrap">
      <div className="st-txt">
        <b>Hand the lab over</b>
        <small>The new owner needs the Lab plan: the lab’s credits come from the owner’s plan. You become an admin.</small>
      </div>
      <select className="st-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="New owner" disabled={!members.length}>
        <option value="">{members.length ? 'Choose someone' : 'No members yet'}</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="st-btn"
        disabled={busy || !to}
        onClick={async () => {
          const who = members.find((m) => m.userId === to)?.name ?? 'them';
          if (await confirmDialog({ title: `Hand the lab over to ${who}?`, body: 'They become the owner and pay for the lab’s work; you become an admin.', confirmLabel: 'Hand over' })) await run(() => api.transferLab(to), 'Lab handed over');
        }}
      >
        Hand over
      </button>
    </div>
  );
}
