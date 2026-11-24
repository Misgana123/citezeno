import { chatTransport, tokens, type ChatHttpRequest, type StreamAccumulator, type Usage } from '../chat/http';
import { userContent, type ChatMessage, type ChatModel, type ChatProvider, type ChatRequest, type ChatStop, type ToolCall } from '../chat/types';
import { ProviderError } from '../errors';
import type { Transport } from '../gateway/types';
import type { Env, Gate } from '../types';
import { BASE, LABEL, openRouterKey, openRouterPolicy, PROVIDER } from './policy';

/* OpenRouter's chat API: OpenAI's Chat Completions format for every vendor's
   models (no SDK). It says what each call cost, so that is what we log. */

type WireToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type WireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] }
  | { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[]; reasoning_details?: unknown[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type WireAnswer = { content?: string | null; tool_calls?: WireToolCall[]; reasoning_details?: unknown[] };

type CompletionResponse = {
  choices?: { message?: WireAnswer; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

const readUsage = (body: unknown): Usage => {
  const u = (body as CompletionResponse).usage;
  const cost = Number(u?.cost);
  return { inputTokens: tokens(u?.prompt_tokens), outputTokens: tokens(u?.completion_tokens), ...(u?.cost != null && Number.isFinite(cost) && cost >= 0 ? { costUsd: cost } : {}) };
};

/* Our messages → OpenRouter's. Each tool result is its own "tool" message. A
   model's earlier answers carry back their reasoning details (some models,
   Gemini among them, need them to go on after a tool call). Images go only to
   models that read them. */
export function toOpenRouterMessages(system: string, messages: ChatMessage[], model?: Pick<ChatModel, 'images'>): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      const { text, images: attached } = userContent(m);
      const images = model?.images === false ? [] : attached;
      out.push({
        role: 'user',
        content: images.length ? [...images.map((i) => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.data}` } })), { type: 'text' as const, text }] : text,
      });
    } else if (m.role === 'tool') for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.callId, content: r.isError ? `Error: ${r.content}` : r.content });
    else {
      const reasoning = m.native?.provider === PROVIDER ? (m.native.content as WireAnswer | null)?.reasoning_details : undefined;
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}),
        ...(Array.isArray(reasoning) && reasoning.length ? { reasoning_details: reasoning } : {}),
      });
    }
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

/* Chunks with a text delta each; the last one carries the usage and cost. */
function openRouterStream(onText: (delta: string) => void): StreamAccumulator {
  let text = '';
  let finish: string | undefined;
  let usage: CompletionResponse['usage'];
  return {
    event(data) {
      const chunk = data as { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; usage?: CompletionResponse['usage'] };
      const choice = chunk.choices?.[0];
      const t = choice?.delta?.content;
      if (typeof t === 'string' && t) {
        text += t;
        onText(t);
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    },
    result() {
      const body: CompletionResponse = { choices: [{ message: { content: text }, finish_reason: finish }], usage };
      return { body, usage: readUsage(body) };
    },
  };
}

/* An answer with no choice in it (OpenRouter can report a failure that way). */
function firstChoice(body: CompletionResponse) {
  const choice = body.choices?.[0];
  if (!choice) throw new ProviderError('unavailable', `${LABEL} sent no answer.`, { provider: PROVIDER, reason: body.error?.message?.slice(0, 300) });
  return choice;
}

export function openRouterChat(apiKey: string, transport: Transport<ChatHttpRequest>, models?: () => Promise<ChatModel[]>): ChatProvider {
  const url = `${BASE}/chat/completions`;
  const headers = { authorization: `Bearer ${apiKey}` };
  const base = (req: ChatRequest) => ({ model: req.model.vendorModel, max_tokens: req.maxOutputTokens, messages: toOpenRouterMessages(req.system, req.messages, req.model), usage: { include: true } });
  return {
    name: PROVIDER,
    ...(models ? { models } : {}),
    async stream(req, onText) {
      const { body, costUsd } = await transport.call<CompletionResponse>({ model: req.model, url, headers, body: { ...base(req), stream: true }, stream: openRouterStream(onText) });
      const choice = body.choices?.[0];
      return {
        text: choice?.message?.content ?? '',
        toolCalls: [],
        stop: STOP[choice?.finish_reason ?? ''] ?? 'other',
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content: choice?.message ?? {} },
      };
    },
    async complete(req: ChatRequest) {
      const { body, costUsd } = await transport.call<CompletionResponse>({
        model: req.model,
        url,
        headers,
        body: { ...base(req), ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}) },
      });
      const choice = firstChoice(body);
      const message = choice.message ?? {};
      const toolCalls: ToolCall[] = (message.tool_calls ?? [])
        .filter((c) => c?.type === 'function' && c.function?.name)
        .map((c, i) => ({ id: c.id || `call_${i}`, name: c.function.name, input: parseArgs(c.function.arguments) }));
      return {
        text: message.content ?? '',
        toolCalls,
        stop: toolCalls.length ? 'tool_use' : (STOP[choice.finish_reason ?? ''] ?? 'other'),
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content: message },
      };
    },
  };
}

export function createOpenRouterChat(env: Env, gate: Gate, doFetch?: typeof fetch, models?: () => Promise<ChatModel[]>): ChatProvider | null {
  const key = openRouterKey(env);
  if (!key) return null;
  return openRouterChat(key, gate(chatTransport(PROVIDER, LABEL, readUsage, doFetch), openRouterPolicy<ChatHttpRequest>(env)), models);
}
