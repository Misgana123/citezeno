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

/* Something the user added to a message: a file's text (read in their browser), or an image (an uploaded picture or a screenshot). */
export type Attachment = { kind: 'text'; name: string; text: string } | { kind: 'image'; name: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string /* base64 */ };

export type ChatMessage =
  | { role: 'user'; text: string; attachments?: Attachment[] }
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
  vendor?: string; // who made the model, for its icon and group (default: the part of the ID before "/")
  vendorName?: string; // the maker's name as shown (default: from `vendor`)
  images?: boolean; // reads images (default yes); without, attached images go as their names only
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
  /* Optional: the models this provider offers right now (a live list, such as
     OpenRouter's). They join the fixed ones in models.ts; same ID, this one wins. */
  models?(): Promise<ChatModel[]>;
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

/* A user message as the model reads it: the typed words, then each attached
   file's text marked as data (its closing tag can't be forged from inside),
   and the images to send beside it. */
export function userContent(m: Extract<ChatMessage, { role: 'user' }>): { text: string; images: Extract<Attachment, { kind: 'image' }>[] } {
  const files = m.attachments ?? [];
  const quote = (v: string) => v.replace(/["<>\n]/g, ' ');
  const parts = [m.text];
  for (const a of files) {
    if (a.kind === 'text') parts.push(`<attachment name="${quote(a.name)}">\n${a.text.replace(/<\/attachment>/gi, '<\\/attachment>')}\n</attachment>`);
    else parts.push(`[image attached: ${quote(a.name)}]`);
  }
  return { text: parts.filter(Boolean).join('\n\n') || '(no text)', images: files.filter((a): a is Extract<Attachment, { kind: 'image' }> => a.kind === 'image') };
}

export type ChatProviderDefinition = ProviderDefinition<ChatProvider>;

/* What a call cost: what the vendor says it charged when it says so, else from the tokens used and the model's prices. */
export const costOf = (model: ChatModel, usage: { inputTokens: number; outputTokens: number; costUsd?: number }) =>
  usage.costUsd != null && Number.isFinite(usage.costUsd) && usage.costUsd >= 0 ? usage.costUsd : (usage.inputTokens * model.inputUsdPerM + usage.outputTokens * model.outputUsdPerM) / 1_000_000;
