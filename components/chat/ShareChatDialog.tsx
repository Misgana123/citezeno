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

  const on = !!share?.shared;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ch-share" role="dialog" aria-modal="true" aria-labelledby="ch-share-h">
        <button type="button" className="ch-share-x" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <header className="ch-share-head">
          <span className="ch-share-ic" aria-hidden="true">
            <Icon name="link" />
          </span>
          <div>
            <h2 id="ch-share-h">Share</h2>
            <p title={title}>{title}</p>
          </div>
        </header>

        {!share && !error && <p className="ch-quiet ch-share-wait">Checking…</p>}

        {share && (
          <div className={`ch-share-access${on ? ' is-on' : ''}`}>
            <span className="ch-share-dot" aria-hidden="true">
              <Icon name={on ? 'globe' : 'lock'} />
            </span>
            <span className="ch-share-who">
              <b>{on ? 'Anyone with the link' : 'Only you'}</b>
              <span>{on ? 'Can read, can’t reply' : 'Turn on to get a link anyone can read'}</span>
            </span>
            <button type="button" role="switch" aria-checked={on} aria-label="Share with anyone who has the link" className="ch-share-switch" onClick={on ? stop : create} disabled={busy} />
          </div>
        )}

        {share && !share.shared && (
          <>
            <ul className="ch-share-notes">
              <li>
                <Icon name="clock" /> The link shows the chat as it is now. Later messages stay private until you update it.
              </li>
              <li>
                <Icon name="shield" /> Your files, downloads and shelf notes are never shared.
              </li>
            </ul>
            <button type="button" className="ch-share-go" onClick={create} disabled={busy}>
              <Icon name="link" /> {busy ? 'Creating…' : 'Create public link'}
            </button>
          </>
        )}

        {share?.shared && (
          <>
            <div className="ch-share-link">
              <Icon name="link" />
              <input readOnly value={share.url} aria-label="Link to this chat" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="ch-share-btn-dark" onClick={() => copy(share.url)}>
                <Icon name="copy" /> Copy
              </button>
            </div>
            <div className="ch-share-meta">
              <span>
                Shared {when(share.sharedAt)} · {share.views.toLocaleString('en-US')} view{share.views === 1 ? '' : 's'}
              </span>
              <button type="button" className="ch-share-stop" onClick={stop} disabled={busy}>
                Stop sharing
              </button>
            </div>
            {share.behind && (
              <div className="ch-share-behind">
                <span>This chat has newer messages than the link.</span>
                <button type="button" className="ch-share-btn-dark" onClick={create} disabled={busy}>
                  {busy ? 'Updating…' : 'Update link'}
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="ch-error ch-share-err" role="alert">
            <Icon name="alert" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
