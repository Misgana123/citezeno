import { chatPolicy, chatTransport, tokens, type ChatHttpRequest } from '../chat/http';
import type { ChatMessage, ChatProvider, ChatRequest, ChatStop, ToolCall } from '../chat/types';
import type { Transport } from '../gateway/types';
import type { Env, Gate } from '../types';

/* Anthropic's Messages API (no SDK). ANTHROPIC_API_KEY, server only. */

export const PROVIDER = 'anthropic';
const LABEL = 'Anthropic';
const URL = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: string; [k: string]: unknown };

type MessagesResponse = { content?: Block[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };

const readUsage = (body: unknown) => {
  const u = (body as MessagesResponse).usage;
  return { inputTokens: tokens(u?.input_tokens), outputTokens: tokens(u?.output_tokens) };
};

/* Our messages → Anthropic's. Its own earlier answers are sent back as they came. */
export function toAnthropicMessages(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: Block[] }[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: [{ type: 'text', text: m.text }] };
    if (m.role === 'tool') {
      return { role: 'user', content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.callId, content: r.content, ...(r.isError ? { is_error: true } : {}) })) };
    }
    if (m.native?.provider === PROVIDER && Array.isArray(m.native.content)) return { role: 'assistant', content: m.native.content as Block[] };
    const content: Block[] = [];
    if (m.text) content.push({ type: 'text', text: m.text });
    for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
    return { role: 'assistant', content };
  });
}

const STOP: Record<string, ChatStop> = { end_turn: 'end', stop_sequence: 'end', tool_use: 'tool_use', max_tokens: 'max_tokens' };

export function anthropicChat(apiKey: string, transport: Transport<ChatHttpRequest>): ChatProvider {
  return {
    name: PROVIDER,
    async complete(req: ChatRequest) {
      const { body, costUsd } = await transport.call<MessagesResponse>({
        model: req.model,
        url: URL,
        headers: { 'x-api-key': apiKey, 'anthropic-version': VERSION },
        body: {
          model: req.model.vendorModel,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          ...(req.tools.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
        },
      });
      const content = body.content ?? [];
      const text = content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      const toolCalls: ToolCall[] = content
        .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }));
      return {
        text,
        toolCalls,
        stop: STOP[body.stop_reason ?? ''] ?? 'other',
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content },
      };
    },
  };
}

export function createAnthropicChat(env: Env, gate: Gate, doFetch?: typeof fetch): ChatProvider | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return anthropicChat(key, gate(chatTransport(PROVIDER, LABEL, readUsage, doFetch), chatPolicy(PROVIDER, LABEL, env)));
}
