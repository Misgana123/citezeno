import { chatPolicy, chatTransport, tokens, type ChatHttpRequest, type StreamAccumulator } from '../chat/http';
import { userContent, type ChatMessage, type ChatProvider, type ChatRequest, type ChatStop, type ToolCall } from '../chat/types';
import type { Transport } from '../gateway/types';
import type { Env, Gate } from '../types';
import { toGeminiSchema } from './schema';

/* Google's Gemini API, generateContent (no SDK). GEMINI_API_KEY, server only. */

export const PROVIDER = 'gemini';
const LABEL = 'Gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/* Gemini's documented stand-in signature for tool calls it didn't make itself. */
const FOREIGN_SIGNATURE = 'skip_thought_signature_validator';

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
    if (m.role === 'user') {
      const { text, images } = userContent(m);
      return { role: 'user', parts: [...images.map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.data } })), { text }] };
    }
    if (m.role === 'tool') {
      return {
        role: 'user',
        parts: m.results.map((r) => ({ functionResponse: { ...(r.callId.startsWith('gemini_') ? {} : { id: r.callId }), name: r.name, response: r.isError ? { error: r.content } : { content: r.content } } })),
      };
    }
    if (m.native?.provider === PROVIDER && Array.isArray(m.native.content)) return { role: 'model', parts: m.native.content as Part[] };
    // another provider's turn (a model switch, or the fallback taking over): its tool calls
    // carry no thought signature, so they say so with the marker Gemini accepts for that
    const parts: Part[] = [];
    if (m.text) parts.push({ text: m.text });
    for (const c of m.toolCalls) parts.push({ functionCall: { name: c.name, args: c.input }, thoughtSignature: FOREIGN_SIGNATURE });
    return { role: 'model', parts };
  });
}

const STOP: Record<string, ChatStop> = { STOP: 'end', MAX_TOKENS: 'max_tokens' };

const requestBody = (req: ChatRequest) => ({
  systemInstruction: { parts: [{ text: req.system }] },
  contents: toGeminiContents(req.messages),
  ...(req.tools.length ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }] } : {}),
  generationConfig: { maxOutputTokens: req.maxOutputTokens },
});

/* Gemini streams whole GenerateResponse chunks: text parts to add up, the
   finish reason and the (running) usage in the last ones. */
function geminiStream(onText: (delta: string) => void): StreamAccumulator {
  let text = '';
  let finishReason: string | undefined;
  let usage: GenerateResponse['usageMetadata'];
  return {
    event(data) {
      const chunk = data as GenerateResponse;
      const candidate = chunk.candidates?.[0];
      for (const p of candidate?.content?.parts ?? []) {
        const t = (p as { text?: unknown; thought?: boolean }).text;
        if (typeof t === 'string' && t && !(p as { thought?: boolean }).thought) {
          text += t;
          onText(t);
        }
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    },
    result() {
      const body: GenerateResponse = { candidates: [{ content: { parts: text ? [{ text }] : [] }, finishReason }], usageMetadata: usage };
      return { body, usage: readUsage(body) };
    },
  };
}

export function geminiChat(apiKey: string, transport: Transport<ChatHttpRequest>): ChatProvider {
  const url = (model: ChatRequest['model'], action: string) => `${BASE}/${encodeURIComponent(model.vendorModel)}:${action}`;
  return {
    name: PROVIDER,
    async stream(req, onText) {
      const { body, costUsd } = await transport.call<GenerateResponse>({
        model: req.model,
        url: url(req.model, 'streamGenerateContent?alt=sse'),
        headers: { 'x-goog-api-key': apiKey },
        body: requestBody(req),
        stream: geminiStream(onText),
      });
      const candidate = body.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      return {
        text: (parts[0] as { text?: string } | undefined)?.text ?? '',
        toolCalls: [],
        stop: STOP[candidate?.finishReason ?? ''] ?? 'other',
        usage: readUsage(body),
        costUsd,
        native: { provider: PROVIDER, content: parts },
      };
    },
    async complete(req: ChatRequest) {
      const { body, costUsd } = await transport.call<GenerateResponse>({
        model: req.model,
        url: url(req.model, 'generateContent'),
        headers: { 'x-goog-api-key': apiKey },
        body: requestBody(req),
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
