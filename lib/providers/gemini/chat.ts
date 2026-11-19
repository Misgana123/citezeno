import { chatPolicy, chatTransport, tokens, type ChatHttpRequest } from '../chat/http';
import type { ChatMessage, ChatProvider, ChatRequest, ChatStop, ToolCall } from '../chat/types';
import type { Transport } from '../gateway/types';
import type { Env, Gate } from '../types';
import { toGeminiSchema } from './schema';

/* Google's Gemini API, generateContent (no SDK). GEMINI_API_KEY, server only. */

export const PROVIDER = 'gemini';
const LABEL = 'Gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type Part =
  | { text: string; thought?: boolean }
  | { functionCall: { id?: string; name: string; args?: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { id?: string; name: string; response: Record<string, unknown> } }
  | Record<string, unknown>;

type Content = { role: 'user' | 'model'; parts: Part[] };

type GenerateResponse = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

const readUsage = (body: unknown) => {
  const u = (body as GenerateResponse).usageMetadata;
  // thinking tokens are billed as output
  return { inputTokens: tokens(u?.promptTokenCount), outputTokens: tokens(u?.candidatesTokenCount) + tokens(u?.thoughtsTokenCount) };
};

/* Our messages → Gemini's contents. Its own earlier answers go back as they
   came (they can carry thought signatures it needs for the next turn). */
export function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', parts: [{ text: m.text }] };
    if (m.role === 'tool') {
      return {
        role: 'user',
        parts: m.results.map((r) => ({ functionResponse: { ...(r.callId.startsWith('gemini_') ? {} : { id: r.callId }), name: r.name, response: r.isError ? { error: r.content } : { content: r.content } } })),
      };
    }
    if (m.native?.provider === PROVIDER && Array.isArray(m.native.content)) return { role: 'model', parts: m.native.content as Part[] };
    const parts: Part[] = [];
    if (m.text) parts.push({ text: m.text });
    for (const c of m.toolCalls) parts.push({ functionCall: { name: c.name, args: c.input } });
    return { role: 'model', parts };
  });
}

const STOP: Record<string, ChatStop> = { STOP: 'end', MAX_TOKENS: 'max_tokens' };

export function geminiChat(apiKey: string, transport: Transport<ChatHttpRequest>): ChatProvider {
  return {
    name: PROVIDER,
    async complete(req: ChatRequest) {
      const { body, costUsd } = await transport.call<GenerateResponse>({
        model: req.model,
        url: `${BASE}/${encodeURIComponent(req.model.vendorModel)}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: toGeminiContents(req.messages),
          ...(req.tools.length
            ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }] }
            : {}),
          generationConfig: { maxOutputTokens: req.maxOutputTokens },
        },
      });
      const candidate = body.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const text = parts
        .filter((p): p is { text: string } => typeof (p as { text?: unknown }).text === 'string' && !(p as { thought?: boolean }).thought)
        .map((p) => p.text)
        .join('');
      // Gemini may leave out call IDs; ours are made up then, and left out when results go back
      const toolCalls: ToolCall[] = parts
        .filter((p): p is { functionCall: { id?: string; name: string; args?: Record<string, unknown> } } => !!(p as { functionCall?: unknown }).functionCall)
        .map((p, i) => ({ id: p.functionCall.id || `gemini_${i}`, name: p.functionCall.name, input: p.functionCall.args ?? {} }));
      return {
        text,
        toolCalls,
        stop: toolCalls.length ? 'tool_use' : (STOP[candidate?.finishReason ?? ''] ?? 'other'),
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content: parts },
      };
    },
  };
}

export function createGeminiChat(env: Env, gate: Gate, doFetch?: typeof fetch): ChatProvider | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return geminiChat(key, gate(chatTransport(PROVIDER, LABEL, readUsage, doFetch), chatPolicy(PROVIDER, LABEL, env)));
}
