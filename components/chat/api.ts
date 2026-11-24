'use client';

import type { ChatShare } from '@/lib/agent/share';
import type { AgentEvent } from '@/lib/agent/types';
import type { ConversationView } from '@/lib/agent/view';
import type { ModelInfo } from '@/lib/providers/chat/catalog';
import type { Attachment } from '@/lib/providers/chat/types';

/* Browser-side calls to /api/agent. Only our own server is called. */

/* paperId: a paper's own conversation, opened in the reader */
export type ConversationSummary = { id: string; title: string; model: string; pinned: boolean; updatedAt: string; paperId?: string | null };
/* web: web search is set up (new chats start with it on) */
export type ChatList = { conversations: ConversationSummary[]; models: ModelInfo[]; defaultModel: string | null; web?: boolean };

async function readError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || `Request failed (${res.status}).`);
}

export async function agentFetch<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('Could not reach Citezeno. Check your connection and try again.');
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export const listChats = () => agentFetch<ChatList>('/api/agent/conversations');
export const openChat = (id: string) => agentFetch<ConversationView>(`/api/agent/conversations/${encodeURIComponent(id)}`);
export const renameChat = (id: string, title: string) => agentFetch(`/api/agent/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { title } });
export const pinChat = (id: string, pinned: boolean) => agentFetch(`/api/agent/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { pinned } });
export const deleteChat = (id: string) => agentFetch(`/api/agent/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
/* the chat's read-only public link: whether it is shared, make or update it (it then shows every message so far), stop it */
const shareUrl = (id: string) => `/api/agent/conversations/${encodeURIComponent(id)}/share`;
export const getChatShare = (id: string) => agentFetch<ChatShare>(shareUrl(id));
export const shareChat = (id: string) => agentFetch<ChatShare>(shareUrl(id), { method: 'POST' });
export const stopSharingChat = (id: string) => agentFetch(shareUrl(id), { method: 'DELETE' });

/* POST and read the reply as it streams: one JSON event per line. */
export async function streamReply(url: string, body: unknown, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', cache: 'no-store', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new Error('Could not reach Citezeno. Check your connection and try again.');
  }
  if (!res.ok || !res.body) throw await readError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as AgentEvent);
      } catch {
        // a broken line is skipped
      }
    }
  }
}

export const sendMessage = (
  body: { conversationId: string | null; text: string; model: string | null; paperId?: string | null; attachments?: Attachment[]; webSearch?: boolean },
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
) => streamReply('/api/agent/chat', body, onEvent, signal);

/* Deep research (the + menu): its steps and then the report stream back like a reply. */
export const startResearch = (body: { conversationId: string | null; text: string; model: string | null; webSearch?: boolean }, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) =>
  streamReply('/api/agent/research', body, onEvent, signal);

export const answerQuestion = (body: { conversationId: string; callId: string; approve: boolean }, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) =>
  streamReply('/api/agent/chat/confirm', body, onEvent, signal);

export const sendClientResult = (
  body: { conversationId: string; callId: string; outcome: { ok: true; sources: unknown[]; note?: string } | { ok: false; error: string } },
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
) => streamReply('/api/agent/chat/client-result', body, onEvent, signal);
