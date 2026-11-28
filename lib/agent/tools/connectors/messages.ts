import { z } from 'zod';
import { defineTool, tally } from '../types';
import { app, appLabel, clip } from './shared';

/* The user's connected team chat (Slack), as the user: find messages, read
   threads, and post (asking first). */

const CHANNEL = z.string().trim().min(1).max(40).describe('A channel ID (from chat_channels or a search result).');

export const chatChannels = defineTool({
  name: 'chat_channels',
  description: 'List channels in the user’s connected Slack (the ones they’re in first), optionally by name.',
  input: z.object({ query: z.string().trim().max(80).optional(), limit: z.number().int().min(1).max(100).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'messages',
  label: () => 'Looking at your channels',
  done: () => ({ did: 'Looked at your channels' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'messages');
    const channels = await api.channels({ query: i.query, limit: i.limit ?? 40 });
    return { result: { channels }, display: { summary: tally(channels.length, 'channel') } };
  },
});

export const chatSearch = defineTool({
  name: 'chat_search',
  description: 'Search the user’s Slack messages, newest first. Slack search syntax works: "in:#lab", "from:@ada", "after:2026-11-01", quotes for a phrase.',
  input: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(50).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'messages',
  label: (i) => `Searching messages for “${clip(i.query, 40)}”`,
  done: (i) => ({ did: 'Searched messages', about: i.query }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'messages');
    const messages = await api.search({ query: i.query, limit: i.limit ?? 20 });
    return { result: { messages: messages.map((m) => ({ ...m, text: clip(m.text, 1500) })) }, display: { summary: tally(messages.length, 'message') } };
  },
});

export const chatReadThread = defineTool({
  name: 'chat_read_thread',
  description: 'Read a thread (channelId and the thread’s threadId, or the message’s id, from a search), or a channel’s latest messages without threadId. Slack may give at most 15 messages at a time; the result says when it was capped.',
  input: z.object({ channelId: CHANNEL, threadId: z.string().trim().max(40).optional(), limit: z.number().int().min(1).max(15).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'messages',
  label: () => 'Reading a thread',
  done: () => ({ did: 'Read a thread' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'messages');
    const r = await api.thread(i.channelId, i.threadId ?? null, i.limit ?? 15);
    return { result: { messages: r.messages.map((m) => ({ ...m, text: clip(m.text, 1500) })), ...(r.limited ? { note: `Showing the latest ${r.messages.length}; Slack limits how many messages Citezeno may read at once.` } : {}) }, display: { summary: tally(r.messages.length, 'message') } };
  },
});

export const chatPost = defineTool({
  name: 'chat_post',
  description: 'Post a message to a Slack channel (or reply in a thread) as the user. Plain text with **bold** and [links](https://…). Asks the user first.',
  input: z.object({ channelId: CHANNEL, channelName: z.string().trim().max(80).optional().describe('The channel’s name, for the question shown to the user.'), text: z.string().trim().min(1).max(8000), threadId: z.string().trim().max(40).optional() }),
  kind: 'write',
  step: 'make',
  needs: 'messages',
  label: () => 'Posting a message',
  done: (i) => ({ did: 'Posted a message', ...(i.channelName ? { about: `#${i.channelName.replace(/^#/, '')}` } : {}) }),
  confirm: (i, ctx) => `Post this ${i.threadId ? 'reply ' : ''}to ${i.channelName ? `#${i.channelName.replace(/^#/, '')}` : 'the channel'} in ${appLabel(ctx, 'messages', 'Slack')} as you?\n\n“${clip(i.text, 400)}”`,
  async run(ctx, i) {
    const { api } = await app(ctx, 'messages');
    const m = await api.post(i.channelId, i.text, i.threadId ?? null);
    return { result: { posted: true, url: m.url }, display: { ...(m.url ? { links: [{ title: 'Open in Slack', url: m.url }] } : {}), summary: 'Posted' } };
  },
});

export const MESSAGE_TOOLS = [chatChannels, chatSearch, chatReadThread, chatPost];
