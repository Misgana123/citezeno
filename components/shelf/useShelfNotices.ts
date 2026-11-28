'use client';

import { useEffect, useState } from 'react';

/* How many unread shelf notices the user has, their lab's included (for the badge on "My shelf"). */
export function useShelfNotices(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/shelf/notices', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: { unread?: number; labUnread?: number } | null) => alive && setN((r?.unread ?? 0) + (r?.labUnread ?? 0)))
        .catch(() => {});
    void load();
    window.addEventListener('citezeno:shelf-notices', load);
    return () => {
      alive = false;
      window.removeEventListener('citezeno:shelf-notices', load);
    };
  }, []);
  return n;
}
