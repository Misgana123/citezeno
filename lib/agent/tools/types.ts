import type { z } from 'zod';
import type { Paper } from '@/lib/papers/types';
import type { ShelfItem } from '@/lib/shelf/types';
import type { AgentContext } from '../context';
import type { AgentFileRef } from '../files';
import type { CitedSource } from './client';

/* An agent tool is one action a user can take in the app, with a clear name,
   a plain description of what it does and when to use it, a validated input,
   and the same service the app's button calls. */

/* A page the web search found or the assistant read, as the chat shows it. */
export type WebLink = { title: string; url: string; snippet?: string; published?: string | null };

/* What kind of step a tool is, for its icon on the chat's timeline and for
   joining steps of one kind that ran one after another ("Read 3 sources"). */
export const STEP_KINDS = ['papers', 'web', 'read', 'trace', 'shelf', 'change', 'make', 'code', 'cite', 'plan'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/* A step's line once it is done, in the past tense: what it did and, when it
   helps, what about. { did: 'Searched papers', about: 'sleep and memory' } */
export type StepLine = { did: string; about?: string };

/* What the chat shows the user next to a step (the model gets `result`). */
export type ToolDisplay = {
  papers?: Paper[];
  items?: ShelfItem[];
  /* a small text file sent with the step (an export), or a file the tool stored (a document, a chart) */
  file?: { name: string; mime: string; text: string } | AgentFileRef;
  sources?: CitedSource[];
  /* web pages found or read */
  links?: WebLink[];
  /* more files a step made (run_python) */
  files?: AgentFileRef[];
  /* code a step ran, and what it printed */
  code?: CodeSource & { output: string; failed?: boolean };
  /* the reply's number for each paper shown here (by paper ID), as the answer cites them: [1], [2]… */
  refs?: Record<string, number>;
  /* deep research offered for this question: the chat shows a button that starts it */
  research?: { question: string };
  /* what the step came to, in a few words, shown on its row: "6 papers", "No notices", "Saved" */
  summary?: string;
  /* deep research: the questions the research looks into, in order */
  plan?: string[];
};

/* "No papers", "1 paper", "1,240 papers": a count for a step's row. */
export function tally(n: number, one: string, many = `${one}s`): string {
  return n === 0 ? `No ${many}` : `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/* Code shown to the user: after it ran, or before, when they're asked to run it. */
export type CodeSource = { language: 'python'; source: string };

/* What to ask before a step runs; code lets the user see what they're approving. */
export type Confirmation = { question: string; code?: CodeSource };

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
  /* What kind of step this is (its icon on the chat's timeline). */
  step: StepKind;
  /* A short label for the step while it runs, e.g. 'Searching papers for “sleep”'. */
  label(input: z.infer<S>): string;
  /* Its line once done, in the past tense: { did: 'Searched papers', about: 'sleep' }.
     Plain words only: never a tool name, a provider, an ID or raw input. */
  done(input: z.infer<S>): StepLine;
  /* The question to ask before running, or null when it can run straight away. */
  confirm?(input: z.infer<S>, ctx: AgentContext): string | Confirmation | null | Promise<string | Confirmation | null>;
  run(ctx: AgentContext, input: z.infer<S>): Promise<ToolOutput>;
};

export const defineTool = <S extends z.ZodType>(tool: AgentTool<S>): AgentTool<S> => tool;
