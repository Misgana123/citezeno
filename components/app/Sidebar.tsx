'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { deleteChat, pinChat, renameChat, type ConversationSummary } from '../chat/api';
import { refreshChats, useChatIndex } from '../chat/chat-index';
import { Icon, LogoMark } from '../Icon';
import { InlineName } from '../shelf/InlineName';
import { useShelfNotices } from '../shelf/useShelfNotices';
import { AccountMenu } from './AccountMenu';
import { APP_SECTIONS, type AppSection } from './sections';

/* The app's one sidebar: New chat and Search, the tools (Citation studio,
   Find papers, My shelf, Library, History), the user's pinned and recent
   chats, and their account. `compact`: icons only. */

const RECENT = 12;

export const openPalette = () => window.dispatchEvent(new Event('citezeno:palette'));

function ChatRow({ chat, active, onDone }: { chat: ConversationSummary; active: boolean; onDone(): void }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const box = useRef<HTMLLIElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  const act = async (fn: () => Promise<unknown>) => {
    setMenu(false);
    try {
      await fn();
    } finally {
      await refreshChats();
    }
  };

  if (renaming)
    return (
      <li className="cz-chat">
        <InlineName
          initial={chat.title}
          label="Chat title"
          placeholder="Title"
          onCancel={() => setRenaming(false)}
          onSave={async (t) => {
            await act(() => renameChat(chat.id, t));
            setRenaming(false);
            window.dispatchEvent(new CustomEvent('citezeno:chat-renamed', { detail: { id: chat.id, title: t } }));
          }}
        />
      </li>
    );

  return (
    <li className={`cz-chat${menu ? ' is-menu' : ''}`} ref={box}>
      <Link className="cz-chat-link" href={`/app/chat?c=${encodeURIComponent(chat.id)}`} aria-current={active ? 'page' : undefined} onClick={onDone} title={chat.title}>
        <Icon name={chat.pinned ? 'pin' : 'chat'} className={chat.pinned ? 'cz-chat-pin' : 'cz-chat-ico'} />
        <span>{chat.title}</span>
      </Link>
      <button type="button" className="cz-chat-more" aria-label={`More for “${chat.title}”`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        <Icon name="list" />
      </button>
      {menu && (
        <div className="cz-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => act(() => pinChat(chat.id, !chat.pinned))}>
            <Icon name="pin" /> {chat.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              setRenaming(true);
            }}
          >
            <Icon name="pencil" /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              if (!window.confirm('Delete this chat? This can’t be undone.')) return;
              act(async () => {
                await deleteChat(chat.id);
                if (active) router.push('/app/chat');
              });
            }}
          >
            <Icon name="trash" /> Delete
          </button>
        </div>
      )}
    </li>
  );
}

function Chats({ onNavigate }: { onNavigate(): void }) {
  const { index, error } = useChatIndex();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState({ pinned: true, chats: true });
  const path = usePathname();
  const activeId = useSearchParams().get('c');
  const chats = index?.conversations ?? [];
  const pinned = chats.filter((c) => c.pinned);
  const rest = chats.filter((c) => !c.pinned);
  const shown = all ? rest : rest.slice(0, RECENT);
  const row = (c: ConversationSummary) => <ChatRow key={c.id} chat={c} active={path === '/app/chat' && c.id === activeId} onDone={onNavigate} />;

  return (
    <>
      {pinned.length > 0 && (
        <section className="cz-sec">
          <button type="button" className="cz-sec-h" aria-expanded={open.pinned} onClick={() => setOpen({ ...open, pinned: !open.pinned })}>
            Pinned <Icon name="chevron" />
          </button>
          {open.pinned && <ul className="cz-chats">{pinned.map(row)}</ul>}
        </section>
      )}
      <section className="cz-sec">
        <button type="button" className="cz-sec-h" aria-expanded={open.chats} onClick={() => setOpen({ ...open, chats: !open.chats })}>
          Chats <Icon name="chevron" />
        </button>
        {open.chats && (
          <>
            {error && <p className="cz-note">{error}</p>}
            {index && !rest.length && !pinned.length && <p className="cz-note">Your chats will show here.</p>}
            <ul className="cz-chats">{shown.map(row)}</ul>
            {rest.length > RECENT && (
              <button type="button" className="cz-all" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : 'View all'}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

export function Sidebar({ current, compact, onToggle, onNavigate = () => {} }: { current: AppSection; compact: boolean; onToggle(): void; onNavigate?(): void }) {
  const notices = useShelfNotices();
  const tools = APP_SECTIONS.filter((s) => s.id !== 'chat');

  return (
    <nav className={`cz-side${compact ? ' is-compact' : ''}`} aria-label="Citezeno">
      <div className="cz-side-top">
        {!compact && (
          <Link className="cz-brand" href="/" aria-label="Citezeno home">
            <LogoMark className="cz-mark" /> Citezeno
          </Link>
        )}
        <button type="button" className="cz-ib" onClick={onToggle} aria-label={compact ? 'Open the sidebar' : 'Close the sidebar'} title={compact ? 'Open the sidebar' : 'Close the sidebar'}>
          <Icon name="panel" />
        </button>
      </div>

      <div className="cz-side-scroll">
        <Link className={`cz-item cz-new${current === 'chat' ? ' is-here' : ''}`} href="/app/chat" onClick={onNavigate} title="New chat">
          <Icon name="plus" /> <span className="cz-lbl">New chat</span>
        </Link>
        <button type="button" className="cz-item" onClick={openPalette} title="Search">
          <Icon name="search" /> <span className="cz-lbl">Search</span> <kbd className="cz-kbd">Ctrl K</kbd>
        </button>
        {tools.map((s) => (
          <Link key={s.id} className="cz-item" href={s.href} aria-current={current === s.id ? 'page' : undefined} onClick={onNavigate} title={s.label}>
            <Icon name={s.icon} /> <span className="cz-lbl">{s.label}</span>
            {s.id === 'shelf' && notices > 0 && <span className="cz-badge">{notices > 99 ? '99+' : notices}</span>}
          </Link>
        ))}
        {current === 'admin' && (
          <Link className="cz-item" href="/admin" aria-current="page" title="Admin">
            <Icon name="chart" /> <span className="cz-lbl">Admin</span>
          </Link>
        )}
        {!compact && <Chats onNavigate={onNavigate} />}
      </div>

      <div className="cz-side-foot">
        <AccountMenu compact={compact} />
      </div>
    </nav>
  );
}
