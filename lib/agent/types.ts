import type { ChatMessage, ToolCall, ToolResult } from '@/lib/providers/chat/types';
import type { ToolDisplay } from './tools/types';

/* One step the agent took, as the chat page shows it. */
export type StepView = {
  callId: string;
  name: string;
  label: string;
  input: unknown;
  status: 'done' | 'error' | 'declined';
  error?: string;
  display?: ToolDisplay;
};

/* A message as stored: the chat format plus what the page shows for it. */
export type StoredMessage = { message: ChatMessage; ui?: StepView[] | null; costUsd?: number };

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
  | { type: 'step'; callId: string; name: string; label: string; input: unknown }
  | { type: 'step_done'; step: StepView }
  | { type: 'text'; text: string }
  | { type: 'confirm'; callId: string; question: string; label: string }
  /* the page should run this tool in the browser and send back the result */
  | { type: 'client_tool'; callId: string; name: string; input: unknown; label: string }
  | { type: 'done'; reason: 'answered' | 'waiting' | 'step_limit' | 'time_limit' }
  | { type: 'error'; message: string };
