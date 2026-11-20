'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { InlineName } from '../shelf/InlineName';
import type { ConversationSummary } from './api';
import { groupChats } from './groups';

/* The chat list: New chat, search, then pinned chats and the rest by day.
   Each chat can be pinned, renamed or deleted from its row. */
export function ChatList({
  chats,
  activeId,
  error,
  onOpen,
  onNew,
  onRename,
  onPin,
  onDelete,
}: {
  chats: ConversationSummary[] | null;
  activeId: string | null;
  error: string | null;
  onOpen(id: string): void;
  onNew(): void;
  onRename(id: string, title: string): Promise<void>;
  onPin(id: string, pinned: boolean): void;
  onDelete(id: string): void;
}) {
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const groups = useMemo(() => groupChats(chats ?? [], query), [chats, query]);

  return (
    <div className="ch-list">
      <button type="button" className="ch-new" onClick={onNew}>
        <Icon name="plus" /> New chat
      </button>
      <label className="ch-search">
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        {query && (
          <button type="button" aria-label="Clear the search" onClick={() => setQuery('')}>
            <Icon name="x" />
          </button>
        )}
      </label>
      {error && <p className="ch-list-note">{error}</p>}

      <nav className="ch-groups" aria-label="Your chats">
        {groups.map((g) => (
          <section key={g.label} className="ch-group">
            <h3>{g.label}</h3>
            <ul>
              {g.items.map((c) => (
                <li key={c.id} className="ch-row">
                  {renaming === c.id ? (
                    <InlineName
                      initial={c.title}
                      label="Chat title"
                      placeholder="Title"
                      onCancel={() => setRenaming(null)}
                      onSave={async (t) => {
                        await onRename(c.id, t);
                        setRenaming(null);
                      }}
                    />
                  ) : (
                    <>
                      <button type="button" className="ch-row-open" aria-current={c.id === activeId ? 'true' : undefined} onClick={() => onOpen(c.id)} title={c.title}>
                        {c.pinned && <Icon name="pin" />}
                        <span>{c.title}</span>
                      </button>
                      <span className="ch-row-acts">
                        <button type="button" aria-label={c.pinned ? `Unpin “${c.title}”` : `Pin “${c.title}”`} title={c.pinned ? 'Unpin' : 'Pin'} onClick={() => onPin(c.id, !c.pinned)}>
                          <Icon name="pin" />
                        </button>
                        <button type="button" aria-label={`Rename “${c.title}”`} title="Rename" onClick={() => setRenaming(c.id)}>
                          <Icon name="pencil" />
                        </button>
                        <button type="button" aria-label={`Delete “${c.title}”`} title="Delete" onClick={() => onDelete(c.id)}>
                          <Icon name="trash" />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {chats && !chats.length && <p className="ch-list-note">Your chats will show here.</p>}
        {chats && chats.length > 0 && !groups.length && <p className="ch-list-note">No chat matches “{query}”.</p>}
      </nav>

      <p className="ch-list-note ch-private">
        <Icon name="lock" /> Private to you, never used to train AI.
      </p>
    </div>
  );
}
