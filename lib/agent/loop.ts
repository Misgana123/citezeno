import type { Attachment, ChatMessage, ChatModel, ChatProvider, ToolCall, ToolResult } from '@/lib/providers/chat/types';
import type { AgentContext } from './context';
import { asData, systemPrompt } from './prompt';
import { toolSpecs } from './tools';
import type { ClientTool } from './tools/client';
import { failureMessage, runTool, stepLook, type ToolRun } from './tools/run';
import type { AgentTool, ToolDisplay, ToolOutput } from './tools/types';
import { WEB_TOOL_NAMES } from './tools/web';
import type { AgentEvent, Pending, StepView, StoredMessage } from './types';

/* The agent loop for one user message: ask the model, run the tools it asks
   for (as the user), give it the results, and repeat until it answers, a step
   needs the user's yes / no, or a limit is reached. Every step is reported as
   it happens and saved as it is done. */

export type LoopDeps = {
  ctx: AgentContext;
  chat: ChatProvider;
  model: ChatModel;
  emit(e: AgentEvent): void;
  /* saves messages; returns their numbers when it knows them */
  save(messages: StoredMessage[]): Promise<number[] | void>;
  setPending(p: Pending | null): Promise<void>;
  /* model calls allowed for one user message */
  maxTurns: number;
  /* stop starting new steps after this time (ms since epoch) */
  deadline: number;
  now?: () => number;
  maxOutputTokens?: number;
  /* this reply's paper numbers (paper ID → n), so the answer can cite [n] */
  refs?: Map<string, number>;
  /* more instructions for this reply (the reader: the paper the user has open) */
  extraSystem?: string;
  /* the tools offered for this reply (all of them when not given); others are refused */
  tools?: readonly (AgentTool | ClientTool)[];
};

/* Number the papers and saved items a step found, in the order they first
   appear in this reply: the model reads each as "ref": n and cites it as [n];
   the page shows the same numbers. */
export function numberPapers(output: ToolOutput, refs: Map<string, number>): ToolOutput {
  const n = (id: string) => {
    if (!refs.has(id)) refs.set(id, refs.size + 1);
    return refs.get(id)!;
  };
  const shown: Record<string, number> = {};
  for (const p of output.display?.papers ?? []) shown[p.id] = n(p.id);
  for (const i of output.display?.items ?? []) shown[i.paper.id] = n(i.paper.id);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return typeof o.paperId === 'string' && shown[o.paperId] != null ? { ref: shown[o.paperId], ...o } : o;
  };
  if (!Object.keys(shown).length) return output;
  return { result: walk(output.result), display: { ...output.display, refs: shown } };
}

/* What the model is sent: the latest messages, cut at a user message so a
   tool call is never separated from its result. */
export const HISTORY_MAX = 60;

export function trimHistory(messages: ChatMessage[], max = HISTORY_MAX): ChatMessage[] {
  if (messages.length <= max) return messages;
  let start = messages.length - max;
  while (start < messages.length && messages[start].role !== 'user') start++;
  return start < messages.length ? messages.slice(start) : messages.slice(-1);
}

/* Images are sent again with every call, so only the latest few messages'
   go; older ones are left as their names (the model already saw them). */
export const IMAGE_MESSAGES_KEPT = 3;

export function dropOldImages(messages: ChatMessage[], keep = IMAGE_MESSAGES_KEPT): ChatMessage[] {
  let seen = 0;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== 'user' || !m.attachments?.some((a) => a.kind === 'image')) continue;
    if (++seen <= keep) continue;
    out[i] = { ...m, attachments: m.attachments.map((a) => (a.kind === 'image' ? { kind: 'text' as const, name: a.name, text: '(an image shown earlier in this chat)' } : a)) };
  }
  return out;
}

export const STEP_LIMIT_TEXT = 'I stopped here because this request took too many steps. Tell me how you’d like to continue.';
export const TIME_LIMIT_TEXT = 'I stopped here because this request was taking too long. Tell me how you’d like to continue.';

type CallsResult = { status: 'done'; results: ToolResult[]; steps: StepView[] } | { status: 'paused' };

/* Run a turn's tool calls in order, from `from`. Pauses (and saves where it
   stopped) when one needs the user's answer. */
async function runCalls(d: LoopDeps, calls: ToolCall[], from: number, results: ToolResult[], steps: StepView[], turns: number, confirmed?: string): Promise<CallsResult> {
  for (let i = from; i < calls.length; i++) {
    const call = calls[i];
    let started = false;
    const run = d.tools && !d.tools.some((t) => t.name === call.name) ? notOffered(call) : await runTool(d.ctx, call.name, call.input, {
      confirmed: call.id === confirmed,
      onStart: (label, input) => {
        started = true;
        d.emit({ type: 'step', callId: call.id, name: call.name, label, input, ...stepLook(call.name, input, false) });
      },
    });
    if (!started) d.emit({ type: 'step', callId: call.id, name: call.name, label: run.label, input: run.input, ...stepLook(call.name, run.input, false) });
    const o = run.outcome;
    if (o.status === 'needs_confirmation') {
      await d.setPending({ calls, results, steps, waiting: { callId: call.id, kind: 'confirm', question: o.question }, turns, refs: Object.fromEntries(d.refs ?? []) });
      d.emit({ type: 'confirm', callId: call.id, question: o.question, label: run.label });
      return { status: 'paused' };
    }
    if (o.status === 'client') {
      await d.setPending({ calls, results, steps, waiting: { callId: call.id, kind: 'client', name: call.name, input: run.input, label: run.label }, turns, refs: Object.fromEntries(d.refs ?? []) });
      d.emit({ type: 'client_tool', callId: call.id, name: call.name, input: run.input, label: run.label });
      return { status: 'paused' };
    }
    const out = o.status === 'done' ? numberPapers(o.output, (d.refs ??= new Map())) : null;
    const step: StepView =
      out
        ? { callId: call.id, name: call.name, label: run.label, input: run.input, status: 'done', ...stepLook(call.name, run.input, true), ...(out.display ? { display: out.display } : {}) }
        : { callId: call.id, name: call.name, label: run.label, input: run.input, status: 'error', ...stepLook(call.name, run.input, false), error: (o as { message: string }).message };
    steps = [...steps, step];
    results = [...results, out ? { callId: call.id, name: call.name, content: asData(call.name, out.result) } : { callId: call.id, name: call.name, content: (o as { message: string }).message, isError: true }];
    d.emit({ type: 'step_done', step });
  }
  return { status: 'done', results, steps };
}

/* A call to a tool this reply doesn't offer (the web tools while web search is off). */
function notOffered(call: ToolCall): ToolRun {
  const message = WEB_TOOL_NAMES.has(call.name) ? 'Web search is off in this chat. The user can turn it on from the + menu.' : `The tool "${call.name}" isn't available here.`;
  return { tool: null, input: call.input, label: call.name, outcome: { status: 'error', message, code: 'bad_request' } };
}

/* Ask the model and act, starting from `history` (which ends with the user's
   message or with tool results), for at most the turns left. */
async function think(d: LoopDeps, history: ChatMessage[], turns: number): Promise<void> {
  const now = d.now ?? Date.now;
  const tools = toolSpecs(d.tools);
  for (;;) {
    if (turns >= d.maxTurns || now() >= d.deadline) {
      const limit = turns >= d.maxTurns ? 'step_limit' : 'time_limit';
      const text = limit === 'step_limit' ? STEP_LIMIT_TEXT : TIME_LIMIT_TEXT;
      const [seq] = (await d.save([{ message: { role: 'assistant', text, toolCalls: [] } }])) ?? [];
      d.emit({ type: 'text', text, ...(seq != null ? { seq } : {}) });
      d.emit({ type: 'done', reason: limit });
      return;
    }
    const res = await d.chat.complete({
      model: d.model,
      system: systemPrompt() + (d.extraSystem ?? ''),
      messages: dropOldImages(trimHistory(history)),
      tools,
      maxOutputTokens: d.maxOutputTokens ?? 2048,
    });
    turns++;
    const assistant: ChatMessage = { role: 'assistant', text: res.text, toolCalls: res.toolCalls, native: res.native };
    const [seq] = (await d.save([{ message: assistant, costUsd: res.costUsd }])) ?? [];
    history = [...history, assistant];
    if (res.text) d.emit({ type: 'text', text: res.text, ...(seq != null ? { seq } : {}) });
    if (!res.toolCalls.length) {
      d.emit({ type: 'done', reason: 'answered' });
      return;
    }
    const r = await runCalls(d, res.toolCalls, 0, [], [], turns);
    if (r.status === 'paused') {
      d.emit({ type: 'done', reason: 'waiting' });
      return;
    }
    const tool: ChatMessage = { role: 'tool', results: r.results };
    await d.save([{ message: tool, ui: r.steps }]);
    history = [...history, tool];
  }
}

/* A new message from the user. */
export async function answer(d: LoopDeps, history: ChatMessage[], text: string, attachments: Attachment[] = []): Promise<void> {
  d.refs = new Map();
  const user: ChatMessage = { role: 'user', text, ...(attachments.length ? { attachments } : {}) };
  await d.save([{ message: user }]);
  await guarded(d, () => think(d, [...history, user], 0));
}

/* Try again: answer the user's last message afresh (what followed it was already dropped). */
export async function retry(d: LoopDeps, history: ChatMessage[]): Promise<void> {
  d.refs = new Map();
  await guarded(d, () => think(d, history, 0));
}

/* Carry on with the rest of a paused turn's calls (from `from`), then think again. */
async function finishTurn(d: LoopDeps, history: ChatMessage[], pending: Pending, from: number, results: ToolResult[], steps: StepView[], confirmed?: string): Promise<void> {
  const r = await runCalls(d, pending.calls, from, results, steps, pending.turns, confirmed);
  if (r.status === 'paused') {
    d.emit({ type: 'done', reason: 'waiting' });
    return;
  }
  const tool: ChatMessage = { role: 'tool', results: r.results };
  await d.save([{ message: tool, ui: r.steps }]);
  await think(d, [...history, tool], pending.turns);
}

/* The user's yes / no to the step that was waiting; then carry on. */
export async function resume(d: LoopDeps, history: ChatMessage[], pending: Pending, approved: boolean): Promise<void> {
  d.refs = new Map(Object.entries(pending.refs ?? {}));
  await guarded(d, async () => {
    await d.setPending(null);
    const at = pending.calls.findIndex((c) => c.id === pending.waiting.callId);
    if (approved) return finishTurn(d, history, pending, at, pending.results, pending.steps, pending.waiting.callId);
    const call = pending.calls[at];
    const question = pending.waiting.kind === 'confirm' ? pending.waiting.question : pending.waiting.label;
    const step: StepView = { callId: call.id, name: call.name, label: question, input: call.input, status: 'declined', ...stepLook(call.name, call.input, false) };
    d.emit({ type: 'step_done', step });
    const result: ToolResult = { callId: call.id, name: call.name, content: 'The user said no. Do not do this, and do not try another way to do it.', isError: true };
    await finishTurn(d, history, pending, at + 1, [...pending.results, result], [...pending.steps, step]);
  });
}

/* What the user's browser sent back for a tool it ran (or why it couldn't). */
export type ClientOutcome = { ok: true; result: unknown; display?: ToolDisplay } | { ok: false; error: string };

export async function resumeWithClientResult(d: LoopDeps, history: ChatMessage[], pending: Pending, outcome: ClientOutcome): Promise<void> {
  d.refs = new Map(Object.entries(pending.refs ?? {}));
  await guarded(d, async () => {
    await d.setPending(null);
    const at = pending.calls.findIndex((c) => c.id === pending.waiting.callId);
    const call = pending.calls[at];
    const label = pending.waiting.kind === 'client' ? pending.waiting.label : call.name;
    const step: StepView = outcome.ok
      ? { callId: call.id, name: call.name, label, input: call.input, status: 'done', ...stepLook(call.name, call.input, true), ...(outcome.display ? { display: outcome.display } : {}) }
      : { callId: call.id, name: call.name, label, input: call.input, status: 'error', ...stepLook(call.name, call.input, false), error: outcome.error };
    d.emit({ type: 'step_done', step });
    const result: ToolResult = outcome.ok ? { callId: call.id, name: call.name, content: asData(call.name, outcome.result) } : { callId: call.id, name: call.name, content: outcome.error, isError: true };
    await finishTurn(d, history, pending, at + 1, [...pending.results, result], [...pending.steps, step]);
  });
}

/* A failure ends the reply with a message the user can read; what was done so far stays saved. */
async function guarded(d: LoopDeps, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const { message } = failureMessage(e);
    d.emit({ type: 'error', message: message === 'Something went wrong with this step.' ? 'Something went wrong. Please try again.' : message });
  }
}

/* Every tool call needs a result before the next message. A reply that failed
   halfway, or a confirmation the user never answered (they wrote something
   else instead), leaves calls without one: those get "not done" here. */
export const NOT_DONE = 'Not done: this step did not run (it was interrupted, or the user moved on without answering).';

export function repairHistory(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    out.push(m);
    if (m.role !== 'assistant' || !m.toolCalls.length) continue;
    const next = messages[i + 1];
    const have = next?.role === 'tool' ? next.results : [];
    const missing = m.toolCalls.filter((c) => !have.some((r) => r.callId === c.id)).map((c) => ({ callId: c.id, name: c.name, content: NOT_DONE, isError: true }));
    if (!missing.length) continue;
    if (next?.role === 'tool') {
      out.push({ role: 'tool', results: [...next.results, ...missing] });
      i++;
    } else out.push({ role: 'tool', results: missing });
  }
  return out;
}
