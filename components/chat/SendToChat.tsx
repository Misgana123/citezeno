'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatChannel } from '@/lib/providers/connectors/types';
import { AppLogo } from '../connectors/AppLogo';
import { connectorFetch } from '../connectors/api';
import { useConnectors } from '../connectors/useConnectors';
import { Icon } from '../Icon';
import { toast } from '../toast';

/* "Send to Slack" under an answer: pick a channel you're in, and the answer is
   posted there as you. Shown only while a team chat app is connected. */
export function SendToChat({ text }: { text: string }) {
  const app = useConnectors().forCapability('messages');
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!channels)
      connectorFetch<{ channels: ChatChannel[] }>('/api/connectors/messages/channels')
        .then((r) => setChannels(r.channels))
        .catch((e) => {
          toast((e as Error).message, true);
          setOpen(false);
        });
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open, channels]);

  if (app?.connection?.status !== 'ok') return null;

  const post = async (c: ChatChannel) => {
    setBusy(true);
    try {
      await connectorFetch<{ url: string | null }>('/api/connectors/messages/post', { method: 'POST', body: { channelId: c.id, text } });
      toast(`Posted to #${c.name}`);
      setOpen(false);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase().replace(/^#/, '');
  const shown = (channels ?? []).filter((c) => !q || c.name.includes(q)).slice(0, 30);
  return (
    <div className="ch-send-chat" ref={box}>
      <button type="button" className={`ch-act${open ? ' is-on' : ''}`} onClick={() => setOpen(!open)} aria-label={`Send to ${app.label}`} title={`Send to ${app.label}`} aria-haspopup="menu" aria-expanded={open}>
        <AppLogo app={app.name} size={16} className="ch-send-chat-logo" />
      </button>
      {open && (
        <div className="ch-am ch-send-chat-pop" role="menu">
          <div className="ch-am-note">Post this answer as you to…</div>
          <input className="ch-send-chat-find" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a channel" autoFocus aria-label="Find a channel" />
          {channels == null ? (
            <div className="ch-am-note">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="ch-am-note">{channels.length ? 'No channel matches.' : 'You aren’t in any channels yet.'}</div>
          ) : (
            shown.map((c) => (
              <button key={c.id} type="button" className="ch-am-i" role="menuitem" disabled={busy} onClick={() => post(c)}>
                <Icon name={c.private ? 'lock' : 'chat'} />#{c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
