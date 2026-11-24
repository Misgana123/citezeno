import type { ChatMessage, ToolCall, ToolResult } from '@/lib/providers/chat/types';
import type { StepKind, StepLine, ToolDisplay } from './tools/types';

/* One step the agent took, as the chat page shows it. */
export type StepView = {
  callId: string;
  name: string;
  label: string;
  input: unknown;
  status: 'done' | 'error' | 'declined';
  error?: string;
  display?: ToolDisplay;
  /* its icon on the timeline (rows saved before kinds existed have none) */
  kind?: StepKind;
  /* its line once done, in the past tense (else the label is shown) */
  line?: StepLine;
  /* deep research: the plan question (its index) this step looked into */
  part?: number;
};

/* What the reader adds to a message in a paper's conversation: which scope
   answered ("paper": from the paper only; "assistant": the research assistant),
   the passages it cites, and the selection it was about. */
export type MessageMeta = { scope: 'paper' | 'assistant'; passageIds?: string[]; quote?: string; page?: number; kind?: 'ask' | 'explain'; basedOn?: 'full_text' | 'abstract' };

/* A message as stored: the chat format plus what the page shows for it. */
export type StoredMessage = { message: ChatMessage; ui?: StepView[] | null; costUsd?: number; meta?: MessageMeta | null };

/* A tool turn paused for the user: the calls of that turn, the results so
   far, and the call that is waiting. */
export type Pending = {
  calls: ToolCall[];
  results: ToolResult[];
  steps: StepView[];
  waiting: { callId: string; kind: 'confirm'; question: string } | { callId: string; kind: 'client'; name: string; input: unknown; label: string };
  /* model calls already made for the user's message */
  turns: number;
  /* the reply's paper numbers so far */
  refs?: Record<string, number>;
};

/* What the chat page receives while the agent works (one JSON object per line). */
export type AgentEvent =
  | { type: 'conversation'; id: string; title: string; model: string }
  | { type: 'step'; callId: string; name: string; label: string; input: unknown; kind?: StepKind; part?: number }
  | { type: 'step_done'; step: StepView }
  | { type: 'text'; text: string }
  | { type: 'confirm'; callId: string; question: string; label: string }
  /* the page should run this tool in the browser and send back the result */
  | { type: 'client_tool'; callId: string; name: string; input: unknown; label: string }
  | { type: 'done'; reason: 'answered' | 'waiting' | 'step_limit' | 'time_limit' }
  | { type: 'error'; message: string };
