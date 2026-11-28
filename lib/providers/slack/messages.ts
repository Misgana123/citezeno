import type { ChatMessage, ChatMessages } from '../connectors/types';
import { toMrkdwn, type SlackCall } from './http';

/* Slack channels and messages, as the user sees them. Apps outside the Slack
   Marketplace may read a channel's or thread's history only 15 messages a
   minute, so finding messages goes through search (not limited this way) and
   reading a thread says when it was capped. */

type SChannel = { id: string; name?: string; is_private?: boolean; is_member?: boolean; is_archived?: boolean };
type SMessage = { ts: string; text?: string; user?: string; username?: string; thread_ts?: string; reply_count?: number; channel?: { id: string; name?: string }; permalink?: string };

/* what Slack now allows outside its Marketplace, per history call */
export const HISTORY_CAP = 15;

/* Slack's own markup in a message → readable text. */
export const plain = (t: string) =>
  t
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<@([A-Z0-9]+)>/g, '@$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const at = (ts: string) => new Date(Number(ts) * 1000).toISOString();

export function slackMessages(call: SlackCall, meta: { teamUrl?: string | null }): ChatMessages {
  const link = (channelId: string, ts: string) => (meta.teamUrl ? `${meta.teamUrl.replace(/\/$/, '')}/archives/${channelId}/p${ts.replace('.', '')}` : null);
  const names = new Map<string, string>();
  const nameOf = async (userId: string | undefined) => {
    if (!userId) return null;
    if (!names.has(userId)) {
      const r = await call<{ user?: { real_name?: string; name?: string; profile?: { display_name?: string } } }>('users.info', { query: { user: userId } }).catch(() => null);
      names.set(userId, r?.user?.profile?.display_name || r?.user?.real_name || r?.user?.name || userId);
    }
    return names.get(userId)!;
  };
  const toMessage = async (m: SMessage, channelId: string, channel: string | null): Promise<ChatMessage> => ({
    id: m.ts,
    channelId,
    channel,
    author: m.username || (await nameOf(m.user)),
    text: plain(m.text ?? ''),
    at: at(m.ts),
    threadId: m.thread_ts ?? null,
    replies: m.reply_count ?? 0,
    url: m.permalink ?? link(channelId, m.ts),
  });

  return {
    async channels({ query, limit }) {
      const r = await call<{ channels?: SChannel[] }>('conversations.list', { query: { types: 'public_channel,private_channel', exclude_archived: true, limit: 200 } });
      const q = query?.trim().toLowerCase().replace(/^#/, '');
      return (r.channels ?? [])
        .filter((c) => !c.is_archived && (!q || (c.name ?? '').includes(q)))
        .sort((a, b) => Number(!!b.is_member) - Number(!!a.is_member) || (a.name ?? '').localeCompare(b.name ?? ''))
        .slice(0, limit)
        .map((c) => ({ id: c.id, name: c.name ?? c.id, private: !!c.is_private, member: !!c.is_member }));
    },

    async search({ query, limit }) {
      const r = await call<{ messages?: { matches?: SMessage[] } }>('search.messages', { query: { query, count: Math.min(50, limit), sort: 'timestamp', sort_dir: 'desc' } });
      return Promise.all((r.messages?.matches ?? []).slice(0, limit).map((m) => toMessage(m, m.channel?.id ?? '', m.channel?.name ?? null)));
    },

    async thread(channelId, threadId, limit) {
      const n = Math.min(HISTORY_CAP, Math.max(1, limit));
      const r = threadId
        ? await call<{ messages?: SMessage[]; has_more?: boolean }>('conversations.replies', { query: { channel: channelId, ts: threadId, limit: n } })
        : await call<{ messages?: SMessage[]; has_more?: boolean }>('conversations.history', { query: { channel: channelId, limit: n } });
      const list = threadId ? (r.messages ?? []) : [...(r.messages ?? [])].reverse();
      return { messages: await Promise.all(list.map((m) => toMessage(m, channelId, null))), limited: !!r.has_more };
    },

    async post(channelId, text, threadId) {
      const r = await call<{ ts: string; channel: string; message?: SMessage }>('chat.postMessage', { json: { channel: channelId, text: toMrkdwn(text), ...(threadId ? { thread_ts: threadId } : {}), unfurl_links: false } });
      return toMessage({ ...(r.message ?? {}), ts: r.ts }, r.channel, null);
    },
  };
}
