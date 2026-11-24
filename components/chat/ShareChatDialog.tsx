'use client';

import { useEffect, useState } from 'react';
import type { ChatShare } from '@/lib/agent/share';
import { confirmDialog } from '../confirm';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { getChatShare, shareChat, stopSharingChat } from './api';

/* Share a chat: make a read-only public link to it as it is now, copy it,
   bring it up to date after more messages, or stop sharing. */

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    toast('Couldn’t copy. Select the link and copy it.', true);
  }
}

export function ShareChatDialog({ chatId, title, onClose }: { chatId: string; title: string; onClose(): void }) {
  const [share, setShare] = useState<ChatShare | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getChatShare(chatId)
      .then((s) => alive && setShare(s))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [chatId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    act(async () => {
      const first = !share?.shared;
      const s = await shareChat(chatId);
      setShare(s);
      // a new link is copied straight away; an updated one keeps its address
      if (s.shared && first) await copy(s.url);
      else toast('Link updated');
    });
  const stop = () =>
    act(async () => {
      if (!(await confirmDialog({ title: 'Stop sharing this chat?', body: 'The link stops working for everyone who has it.', confirmLabel: 'Stop sharing', danger: true }))) return;
      await stopSharingChat(chatId);
      setShare({ shared: false });
      toast('Sharing stopped');
    });

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ch-share" role="dialog" aria-modal="true" aria-labelledby="ch-share-h">
        <h2 id="ch-share-h">Share this chat</h2>
        <p className="ch-share-title">{title}</p>

        {!share && !error && <p className="ch-quiet">Checking…</p>}

        {share && !share.shared && (
          <ul className="ch-share-notes">
            <li>Anyone with the link can read this chat as it is now, without signing in.</li>
            <li>Messages you send later aren’t included until you update the link.</li>
            <li>Your attached files, the files made for you and your shelf notes stay private.</li>
          </ul>
        )}

        {share?.shared && (
          <>
            <div className="ch-share-link">
              <input className="input" readOnly value={share.url} aria-label="Link to this chat" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-sm" onClick={() => copy(share.url)}>
                <Icon name="copy" /> Copy
              </button>
            </div>
            <p className="ch-share-meta">
              Shared {when(share.sharedAt)} · {share.views.toLocaleString('en-US')} view{share.views === 1 ? '' : 's'}
            </p>
            {share.behind && (
              <p className="ch-share-behind">
                <Icon name="history" /> This chat has newer messages than the link shows.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="ch-error" role="alert">
            <Icon name="alert" /> {error}
          </p>
        )}

        <div className="dialog-actions">
          {share?.shared && (
            <button type="button" className="btn btn-ghost btn-sm ch-share-stop" onClick={stop} disabled={busy}>
              Stop sharing
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {share?.shared ? 'Done' : 'Cancel'}
          </button>
          {share && !share.shared && (
            <button type="button" className="btn btn-sm" onClick={create} disabled={busy}>
              <Icon name="link" /> {busy ? 'Creating…' : 'Create link'}
            </button>
          )}
          {share?.shared && share.behind && (
            <button type="button" className="btn btn-sm" onClick={create} disabled={busy}>
              {busy ? 'Updating…' : 'Update link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
