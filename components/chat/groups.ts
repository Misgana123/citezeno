import type { ConversationSummary } from './api';

/* The chat list as the sidebar shows it: pinned first, then by day, filtered
   by the search box (words anywhere in the title, in any order). */

export type ChatGroup = { label: string; items: ConversationSummary[] };

const DAY = 86_400_000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function groupChats(list: ConversationSummary[], query = '', now: number = Date.now()): ChatGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = list.filter((c) => words.every((w) => c.title.toLowerCase().includes(w)));
  const today = startOfDay(now);
  const buckets: ChatGroup[] = [
    { label: 'Pinned', items: [] },
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const c of shown) {
    const t = Date.parse(c.updatedAt);
    const b = c.pinned ? 0 : t >= today ? 1 : t >= today - DAY ? 2 : t >= today - 7 * DAY ? 3 : 4;
    buckets[b].items.push(c);
  }
  for (const b of buckets) b.items.sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt));
  return buckets.filter((b) => b.items.length);
}
