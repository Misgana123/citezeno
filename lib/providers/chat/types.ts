import type { ProviderDefinition } from '../types';

/* The AI chat model job: one turn of a conversation with tools. Every chat
   provider takes and returns this vendor-neutral format; its adapter turns it
   into the vendor's own request and answer. */

/* JSON Schema for a tool's input (an object schema). */
export type JsonSchema = Record<string, unknown>;

export type ToolSpec = { name: string; description: string; parameters: JsonSchema };

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type ToolResult = { callId: string; name: string; content: string; isError?: boolean };

/* What the model said in a turn exactly as the vendor sent it, so the same
   provider can be sent it back unchanged (some keep hidden state in it). */
export type NativeTurn = { provider: string; content: unknown };

export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; native?: NativeTurn }
  | { role: 'tool'; results: ToolResult[] };

/* A model in the catalog (models.ts). */
export type ChatModel = {
  id: string; // ours, stable: what users pick and conversations store
  provider: string; // registry name of the chat provider
  label: string; // shown to users
  vendorModel: string; // the vendor's model name
  inputUsdPerM: number; // price per million input tokens
  outputUsdPerM: number; // price per million output tokens
};

export type ChatRequest = {
  model: ChatModel;
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxOutputTokens: number;
};

export type ChatStop = 'end' | 'tool_use' | 'max_tokens' | 'other';

export type ChatResponse = {
  text: string;
  toolCalls: ToolCall[];
  stop: ChatStop;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  native: NativeTurn;
};

export interface ChatProvider {
  readonly name: string;
  complete(req: ChatRequest): Promise<ChatResponse>;
  /* Optional: the same answer, with its text handed to `onText` piece by piece
     as it is written. Only for requests without tools. */
  stream?(req: ChatRequest, onText: (delta: string) => void): Promise<ChatResponse>;
}

/* Stream the answer when the provider can (and the request has no tools),
   otherwise make the one-shot call and hand on its whole text at once. */
export async function streamOrComplete(provider: ChatProvider, req: ChatRequest, onText: (delta: string) => void): Promise<ChatResponse> {
  if (provider.stream && !req.tools.length) return provider.stream(req, onText);
  const res = await provider.complete(req);
  if (res.text) onText(res.text);
  return res;
}

export type ChatProviderDefinition = ProviderDefinition<ChatProvider>;

/* What a call cost, from the tokens used and the model's prices. */
export const costOf = (model: ChatModel, usage: { inputTokens: number; outputTokens: number }) =>
  (usage.inputTokens * model.inputUsdPerM + usage.outputTokens * model.outputUsdPerM) / 1_000_000;
