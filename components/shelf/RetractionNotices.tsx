'use client';

import { useEffect, useState } from 'react';
import type { Notice } from '@/lib/shelf/store/notices';
import { Icon } from '../Icon';
import { shelfFetch } from './api';

/* "A paper you saved has been retracted": shown at the top of the shelf until dismissed. */
export function RetractionNotices({ onOpen, onRead }: { onOpen: (itemId: string) => void; onRead?: () => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    shelfFetch<{ notices: Notice[]; unread: number }>('/api/shelf/notices')
      .then((r) => {
        setNotices(r.notices);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  if (!notices.length) return null;

  const dismiss = async (ids?: string[]) => {
    setNotices((ns) => (ids ? ns.filter((n) => !ids.includes(n.id)) : []));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    await shelfFetch('/api/shelf/notices', { method: 'POST', body: { ids } }).catch(() => {});
    onRead?.();
  };

  return (
    <section className="sh-notices fp-retracted" role="alert" aria-label="Retracted papers">
      <Icon name="alert" />
      <div>
        <b>
          {unread === 1 ? 'A paper on your shelf has been retracted' : `${unread} papers on your shelf have been retracted`} since you saved {unread === 1 ? 'it' : 'them'}.
        </b>
        <ul>
          {notices.map((n) => (
            <li key={n.id}>
              {n.itemId ? (
                <button type="button" className="sh-notice-link" onClick={() => (onOpen(n.itemId!), dismiss([n.id]))}>
                  {n.title}
                </button>
              ) : (
                n.title
              )}
            </li>
          ))}
        </ul>
        <span className="small">Its findings should not be relied on or cited as valid.</span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss()}>
        Dismiss
      </button>
    </section>
  );
}
