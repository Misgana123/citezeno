import { describe, expect, it } from 'vitest';
import { groupChats } from '@/components/app/chat-groups';
import type { ConversationSummary } from '@/components/chat/api';

/* The sidebar lists chats as plain titles: pinned first, then by when they were last used. */

const now = new Date(2026, 10, 24, 15, 0);
const chat = (id: string, updatedAt: Date, pinned = false): ConversationSummary => ({ id, title: id, model: 'm', pinned, updatedAt: updatedAt.toISOString() });

describe('chats in the sidebar', () => {
  it('groups pinned, today, the previous 7 days and older, newest first, leaving out empty groups', () => {
    const groups = groupChats(
      [
        chat('old', new Date(2026, 9, 1)),
        chat('this-morning', new Date(2026, 10, 24, 8)),
        chat('pinned-old', new Date(2026, 0, 1), true),
        chat('just-now', new Date(2026, 10, 24, 14, 50)),
        chat('yesterday', new Date(2026, 10, 23, 22)),
        chat('six-days', new Date(2026, 10, 18, 9)),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ['Pinned', ['pinned-old']],
      ['Today', ['just-now', 'this-morning']],
      ['Previous 7 days', ['yesterday', 'six-days']],
      ['Older', ['old']],
    ]);
  });

  it('starts today at midnight, and has no groups for no chats', () => {
    expect(groupChats([chat('late-last-night', new Date(2026, 10, 23, 23, 59))], now).map((g) => g.label)).toEqual(['Previous 7 days']);
    expect(groupChats([], now)).toEqual([]);
  });
});
