import type { z } from 'zod';
import type { Paper } from '@/lib/papers/types';
import type { ShelfItem } from '@/lib/shelf/types';
import type { AgentContext } from '../context';
import type { AgentFileRef } from '../files';
import type { CitedSource } from './client';

/* An agent tool is one action a user can take in the app, with a clear name,
   a plain description of what it does and when to use it, a validated input,
   and the same service the app's button calls. */

/* What the chat shows the user next to a step (the model gets `result`). */
export type ToolDisplay = {
  papers?: Paper[];
  items?: ShelfItem[];
  /* a small text file sent with the step (an export), or a file the tool stored (a document, a chart) */
  file?: { name: string; mime: string; text: string } | AgentFileRef;
  sources?: CitedSource[];
  /* the reply's number for each paper shown here (by paper ID), as the answer cites them: [1], [2]… */
  refs?: Record<string, number>;
  /* what the step came to, in a few words, shown on its row: "6 papers", "No notices", "Saved" */
  summary?: string;
};

/* "No papers", "1 paper", "1,240 papers": a count for a step's row. */
export function tally(n: number, one: string, many = `${one}s`): string {
  return n === 0 ? `No ${many}` : `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export type ToolOutput = {
  /* What the model reads: compact JSON-friendly data. */
  result: unknown;
  display?: ToolDisplay;
};

/* read: looks only. write: changes the user's library. Either may also ask
   for confirmation first (deleting, merging, bulk changes, large exports). */
export type ToolKind = 'read' | 'write';

export type AgentTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  input: S;
  kind: ToolKind;
  /* A short label for the step, e.g. 'Searching papers for “sleep”'. */
  label(input: z.infer<S>): string;
  /* The question to ask before running, or null when it can run straight away. */
  confirm?(input: z.infer<S>, ctx: AgentContext): string | null | Promise<string | null>;
  run(ctx: AgentContext, input: z.infer<S>): Promise<ToolOutput>;
};

export const defineTool = <S extends z.ZodType>(tool: AgentTool<S>): AgentTool<S> => tool;
