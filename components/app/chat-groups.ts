import type { ConversationSummary } from '../chat/api';

/* The sidebar's chats in groups: pinned first, then by when they were last
   used (today, the previous 7 days, older), newest first within each. Empty
   groups are left out. */

export type ChatGroup = { label: string; chats: ConversationSummary[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export function groupChats(chats: ConversationSummary[], now = new Date()): ChatGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfToday - 7 * DAY_MS;
  const groups: ChatGroup[] = [
    { label: 'Pinned', chats: [] },
    { label: 'Today', chats: [] },
    { label: 'Previous 7 days', chats: [] },
    { label: 'Older', chats: [] },
  ];
  const sorted = [...chats].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const c of sorted) {
    const at = Date.parse(c.updatedAt);
    const g = c.pinned ? 0 : at >= startOfToday ? 1 : at >= weekAgo ? 2 : 3;
    groups[g].chats.push(c);
  }
  return groups.filter((g) => g.chats.length);
}
