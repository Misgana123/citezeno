import { chatPolicy, chatTransport, tokens, type ChatHttpRequest, type StreamAccumulator } from '../chat/http';
import { userContent, type ChatMessage, type ChatProvider, type ChatRequest, type ChatStop, type ToolCall } from '../chat/types';
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
    if (m.role === 'user') {
      const { text, images } = userContent(m);
      return { role: 'user', content: [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })), { type: 'text', text }] };
    }
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

/* Anthropic streams typed events: message_start (input tokens), text deltas,
   and message_delta (stop reason, output tokens). */
function anthropicStream(onText: (delta: string) => void): StreamAccumulator {
  let text = '';
  let stop: string | undefined;
  let input = 0;
  let output = 0;
  return {
    event(data) {
      const e = data as { type?: string; message?: { usage?: { input_tokens?: number; output_tokens?: number } }; delta?: { type?: string; text?: string; stop_reason?: string }; usage?: { output_tokens?: number } };
      if (e.type === 'message_start') {
        input = tokens(e.message?.usage?.input_tokens);
        output = tokens(e.message?.usage?.output_tokens);
      } else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string') {
        text += e.delta.text;
        onText(e.delta.text);
      } else if (e.type === 'message_delta') {
        if (e.delta?.stop_reason) stop = e.delta.stop_reason;
        if (e.usage?.output_tokens != null) output = tokens(e.usage.output_tokens);
      }
    },
    result() {
      const body: MessagesResponse = { content: text ? [{ type: 'text', text }] : [], stop_reason: stop, usage: { input_tokens: input, output_tokens: output } };
      return { body, usage: readUsage(body) };
    },
  };
}

export function anthropicChat(apiKey: string, transport: Transport<ChatHttpRequest>): ChatProvider {
  return {
    name: PROVIDER,
    async stream(req, onText) {
      const { body, costUsd } = await transport.call<MessagesResponse>({
        model: req.model,
        url: URL,
        headers: { 'x-api-key': apiKey, 'anthropic-version': VERSION },
        body: { model: req.model.vendorModel, max_tokens: req.maxOutputTokens, system: req.system, messages: toAnthropicMessages(req.messages), stream: true },
        stream: anthropicStream(onText),
      });
      const content = body.content ?? [];
      return {
        text: content.map((b) => (b.type === 'text' ? (b as { text: string }).text : '')).join(''),
        toolCalls: [],
        stop: STOP[body.stop_reason ?? ''] ?? 'other',
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content },
      };
    },
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
