import { chatPolicy, chatTransport, tokens, type ChatHttpRequest } from '../chat/http';
import type { ChatMessage, ChatProvider, ChatRequest, ChatStop, ToolCall } from '../chat/types';
import type { Transport } from '../gateway/types';
import type { Env, Gate } from '../types';

/* OpenAI's Chat Completions API (no SDK). OPENAI_API_KEY, server only. */

export const PROVIDER = 'openai';
const LABEL = 'OpenAI';
const URL = 'https://api.openai.com/v1/chat/completions';

type WireToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type CompletionResponse = {
  choices?: { message?: { content?: string | null; tool_calls?: WireToolCall[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const readUsage = (body: unknown) => {
  const u = (body as CompletionResponse).usage;
  return { inputTokens: tokens(u?.prompt_tokens), outputTokens: tokens(u?.completion_tokens) };
};

/* Our messages → OpenAI's. Each tool result is its own "tool" message. */
export function toOpenAiMessages(system: string, messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text });
    else if (m.role === 'tool') for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.callId, content: r.isError ? `Error: ${r.content}` : r.content });
    else
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}),
      });
  }
  return out;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const STOP: Record<string, ChatStop> = { stop: 'end', tool_calls: 'tool_use', function_call: 'tool_use', length: 'max_tokens' };

export function openAiChat(apiKey: string, transport: Transport<ChatHttpRequest>): ChatProvider {
  return {
    name: PROVIDER,
    async complete(req: ChatRequest) {
      const { body, costUsd } = await transport.call<CompletionResponse>({
        model: req.model,
        url: URL,
        headers: { authorization: `Bearer ${apiKey}` },
        body: {
          model: req.model.vendorModel,
          max_completion_tokens: req.maxOutputTokens,
          messages: toOpenAiMessages(req.system, req.messages),
          ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
        },
      });
      const choice = body.choices?.[0];
      const message = choice?.message ?? {};
      const toolCalls: ToolCall[] = (message.tool_calls ?? [])
        .filter((c) => c?.type === 'function' && c.function?.name)
        .map((c) => ({ id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }));
      return {
        text: message.content ?? '',
        toolCalls,
        stop: toolCalls.length ? 'tool_use' : (STOP[choice?.finish_reason ?? ''] ?? 'other'),
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content: message },
      };
    },
  };
}

export function createOpenAiChat(env: Env, gate: Gate, doFetch?: typeof fetch): ChatProvider | null {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return openAiChat(key, gate(chatTransport(PROVIDER, LABEL, readUsage, doFetch), chatPolicy(PROVIDER, LABEL, env)));
}
