import type { ChatMessage, ChatModel, ChatProvider, ToolCall, ToolResult } from '@/lib/providers/chat/types';
import type { AgentContext } from './context';
import { asData, systemPrompt } from './prompt';
import { toolSpecs } from './tools';
import { failureMessage, runTool } from './tools/run';
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
  save(messages: StoredMessage[]): Promise<void>;
  setPending(p: Pending | null): Promise<void>;
  /* model calls allowed for one user message */
  maxTurns: number;
  /* stop starting new steps after this time (ms since epoch) */
  deadline: number;
  now?: () => number;
  maxOutputTokens?: number;
};

/* What the model is sent: the latest messages, cut at a user message so a
   tool call is never separated from its result. */
export const HISTORY_MAX = 60;

export function trimHistory(messages: ChatMessage[], max = HISTORY_MAX): ChatMessage[] {
  if (messages.length <= max) return messages;
  let start = messages.length - max;
  while (start < messages.length && messages[start].role !== 'user') start++;
  return start < messages.length ? messages.slice(start) : messages.slice(-1);
}

export const STEP_LIMIT_TEXT = 'I stopped here because this request took too many steps. Tell me how you’d like to continue.';
export const TIME_LIMIT_TEXT = 'I stopped here because this request was taking too long. Tell me how you’d like to continue.';

type CallsResult = { status: 'done'; results: ToolResult[]; steps: StepView[] } | { status: 'paused' };

/* Run a turn's tool calls in order, from `from`. Pauses (and saves where it
   stopped) when one needs the user's answer. */
async function runCalls(d: LoopDeps, calls: ToolCall[], from: number, results: ToolResult[], steps: StepView[], turns: number, confirmed?: string): Promise<CallsResult> {
  for (let i = from; i < calls.length; i++) {
    const call = calls[i];
    const run = await runTool(d.ctx, call.name, call.input, { confirmed: call.id === confirmed });
    d.emit({ type: 'step', callId: call.id, name: call.name, label: run.label, input: run.input });
    const o = run.outcome;
    if (o.status === 'needs_confirmation') {
      await d.setPending({ calls, results, steps, waiting: { callId: call.id, kind: 'confirm', question: o.question }, turns });
      d.emit({ type: 'confirm', callId: call.id, question: o.question, label: run.label });
      return { status: 'paused' };
    }
    const step: StepView =
      o.status === 'done'
        ? { callId: call.id, name: call.name, label: run.label, input: run.input, status: 'done', ...(o.output.display ? { display: o.output.display } : {}) }
        : { callId: call.id, name: call.name, label: run.label, input: run.input, status: 'error', error: o.message };
    steps = [...steps, step];
    results = [...results, o.status === 'done' ? { callId: call.id, name: call.name, content: asData(call.name, o.output.result) } : { callId: call.id, name: call.name, content: o.message, isError: true }];
    d.emit({ type: 'step_done', step });
  }
  return { status: 'done', results, steps };
}

/* Ask the model and act, starting from `history` (which ends with the user's
   message or with tool results), for at most the turns left. */
async function think(d: LoopDeps, history: ChatMessage[], turns: number): Promise<void> {
  const now = d.now ?? Date.now;
  const tools = toolSpecs();
  for (;;) {
    if (turns >= d.maxTurns || now() >= d.deadline) {
      const limit = turns >= d.maxTurns ? 'step_limit' : 'time_limit';
      const text = limit === 'step_limit' ? STEP_LIMIT_TEXT : TIME_LIMIT_TEXT;
      await d.save([{ message: { role: 'assistant', text, toolCalls: [] } }]);
      d.emit({ type: 'text', text });
      d.emit({ type: 'done', reason: limit });
      return;
    }
    const res = await d.chat.complete({ model: d.model, system: systemPrompt(), messages: trimHistory(history), tools, maxOutputTokens: d.maxOutputTokens ?? 2048 });
    turns++;
    const assistant: ChatMessage = { role: 'assistant', text: res.text, toolCalls: res.toolCalls, native: res.native };
    await d.save([{ message: assistant, costUsd: res.costUsd }]);
    history = [...history, assistant];
    if (res.text) d.emit({ type: 'text', text: res.text });
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
export async function answer(d: LoopDeps, history: ChatMessage[], text: string): Promise<void> {
  const user: ChatMessage = { role: 'user', text };
  await d.save([{ message: user }]);
  await guarded(d, () => think(d, [...history, user], 0));
}

/* The user's yes / no to the step that was waiting; then carry on. */
export async function resume(d: LoopDeps, history: ChatMessage[], pending: Pending, approved: boolean): Promise<void> {
  await guarded(d, async () => {
    await d.setPending(null);
    const at = pending.calls.findIndex((c) => c.id === pending.waiting.callId);
    let results = pending.results;
    let steps = pending.steps;
    let from = at;
    if (!approved) {
      const call = pending.calls[at];
      const step: StepView = { callId: call.id, name: call.name, label: pending.waiting.question, input: call.input, status: 'declined' };
      steps = [...steps, step];
      results = [...results, { callId: call.id, name: call.name, content: 'The user said no. Do not do this, and do not try another way to do it.', isError: true }];
      d.emit({ type: 'step_done', step });
      from = at + 1;
    }
    const r = await runCalls(d, pending.calls, from, results, steps, pending.turns, approved ? pending.waiting.callId : undefined);
    if (r.status === 'paused') {
      d.emit({ type: 'done', reason: 'waiting' });
      return;
    }
    const tool: ChatMessage = { role: 'tool', results: r.results };
    await d.save([{ message: tool, ui: r.steps }]);
    await think(d, [...history, tool], pending.turns);
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
