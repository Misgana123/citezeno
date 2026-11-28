import { isPapersError, PapersError } from '@/lib/papers/errors';
import { userMessage } from '@/lib/papers/messages';
import { CONNECTOR_NAMES } from '@/lib/providers/connectors/registry';
import { isProviderError } from '@/lib/providers/errors';
import { papersErrorCode } from '@/lib/shelf/papers-error';
import type { AgentContext } from '../context';
import { findTool } from './index';
import type { ClientTool } from './client';
import type { AgentTool, CodeSource, StepKind, StepLine, ToolOutput } from './types';

/* Running one tool call the model asked for: check the input, ask the user
   first when the action needs it, run it as the user, and turn any failure
   into a short message the model can pass on. */

export type ToolOutcome =
  | { status: 'done'; output: ToolOutput }
  | { status: 'needs_confirmation'; question: string; code?: CodeSource }
  /* runs in the user's browser: the page is asked to run it with this input */
  | { status: 'client' }
  | { status: 'error'; message: string; code?: string };

export type ToolRun = { tool: AgentTool | ClientTool | null; input: unknown; label: string; outcome: ToolOutcome };

/* A failure in words the user can read (never a stack trace or vendor detail). */
export function failureMessage(e: unknown): { message: string; code?: string } {
  const err = e as { name?: string; code?: string; message?: string };
  if (err?.name === 'ShelfError' && typeof err.code === 'string') return { message: err.message ?? 'That didn’t work.', code: err.code };
  // a connected app: not connected, needs connecting again, refused this
  if (err?.name === 'ConnectorError' && typeof err.code === 'string') return { message: err.message ?? 'The connected app couldn’t do this.', code: err.code };
  if (isProviderError(e) && e.details.reason !== 'auth' && (e.code === 'not_found' || e.code === 'bad_request' || e.code === 'unsupported') && CONNECTOR_NAMES.includes(e.details.provider ?? '')) return { message: e.message, code: e.code };
  // out of credits, or past this reply's budget: the step didn't run
  if (err?.name === 'CreditError' && typeof err.code === 'string') return { message: `${err.message ?? 'Not enough credits.'} This step didn’t run.`, code: err.code };
  const papersCode = papersErrorCode(e);
  if (papersCode) {
    const pe = isPapersError(e) ? e : new PapersError(papersCode, err.message ?? '', (e as PapersError).details ?? {});
    return { message: userMessage(pe), code: papersCode };
  }
  if (isProviderError(e)) return { message: 'A service this needs is unavailable right now. Please try again shortly.', code: e.code };
  console.error('[citezeno] agent: tool failed', e);
  return { message: 'Something went wrong with this step.', code: 'unavailable' };
}

/* onStart: called once the input is valid, before anything runs (to show the step). */
export async function runTool(ctx: AgentContext, name: string, rawInput: unknown, opts: { confirmed?: boolean; onStart?: (label: string, input: unknown) => void } = {}): Promise<ToolRun> {
  const tool = findTool(name);
  if (!tool) return { tool: null, input: rawInput, label: name, outcome: { status: 'error', message: `There is no tool called "${name}".`, code: 'bad_request' } };

  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    return { tool, input: rawInput, label: tool.name, outcome: { status: 'error', message: `Invalid input${where}: ${issue?.message ?? 'check the input'}.`, code: 'bad_request' } };
  }
  const input = parsed.data;
  const label = tool.label(input);
  opts.onStart?.(label, input);
  if (tool.kind === 'client') return { tool, input, label, outcome: { status: 'client' } };

  try {
    // a connected app's tool: what the user lets the assistant do with it (Settings → Customize)
    const perm = tool.needs ? ctx.connectors?.permission?.(tool.needs, tool.kind) : undefined;
    if (perm === 'never') {
      const app = ctx.connectors?.connected.get(tool.needs!)?.label ?? 'this app';
      return { tool, input, label, outcome: { status: 'error', message: `The user turned this off for ${app} in Settings → Customize → Connectors.`, code: 'denied' } };
    }
    if (!opts.confirmed && perm !== 'allow' && (tool.confirm || perm === 'ask')) {
      const ask = tool.confirm ? await tool.confirm(input, ctx) : null;
      if (ask) return { tool, input, label, outcome: { status: 'needs_confirmation', ...(typeof ask === 'string' ? { question: ask } : ask) } };
      if (perm === 'ask') return { tool, input, label, outcome: { status: 'needs_confirmation', question: `Allow this step in ${ctx.connectors?.connected.get(tool.needs!)?.label ?? 'the connected app'}: ${label}?` } };
    }
    return { tool, input, label, outcome: { status: 'done', output: await tool.run(ctx, input) } };
  } catch (e) {
    return { tool, input, label, outcome: { status: 'error', ...failureMessage(e) } };
  }
}

/* How the chat shows a step: its kind (its icon) and, once done, its line in the past tense. */
export function stepLook(name: string, input: unknown, done: boolean): { kind?: StepKind; line?: StepLine } {
  const tool = findTool(name);
  if (!tool) return {};
  if (!done) return { kind: tool.step };
  try {
    return { kind: tool.step, line: tool.done(input as never) };
  } catch {
    return { kind: tool.step };
  }
}
