import { isPapersError, PapersError } from '@/lib/papers/errors';
import { userMessage } from '@/lib/papers/messages';
import { isProviderError } from '@/lib/providers/errors';
import { papersErrorCode } from '@/lib/shelf/papers-error';
import type { AgentContext } from '../context';
import { findTool } from './index';
import type { AgentTool, ToolOutput } from './types';

/* Running one tool call the model asked for: check the input, ask the user
   first when the action needs it, run it as the user, and turn any failure
   into a short message the model can pass on. */

export type ToolOutcome =
  | { status: 'done'; output: ToolOutput }
  | { status: 'needs_confirmation'; question: string }
  | { status: 'error'; message: string; code?: string };

export type ToolRun = { tool: AgentTool | null; input: unknown; label: string; outcome: ToolOutcome };

/* A failure in words the user can read (never a stack trace or vendor detail). */
export function failureMessage(e: unknown): { message: string; code?: string } {
  const err = e as { name?: string; code?: string; message?: string };
  if (err?.name === 'ShelfError' && typeof err.code === 'string') return { message: err.message ?? 'That didn’t work.', code: err.code };
  const papersCode = papersErrorCode(e);
  if (papersCode) {
    const pe = isPapersError(e) ? e : new PapersError(papersCode, err.message ?? '', (e as PapersError).details ?? {});
    return { message: userMessage(pe), code: papersCode };
  }
  if (isProviderError(e)) return { message: 'A service this needs is unavailable right now. Please try again shortly.', code: e.code };
  console.error('[citezeno] agent: tool failed', e);
  return { message: 'Something went wrong with this step.', code: 'unavailable' };
}

export async function runTool(ctx: AgentContext, name: string, rawInput: unknown, opts: { confirmed?: boolean } = {}): Promise<ToolRun> {
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

  try {
    if (!opts.confirmed && tool.confirm) {
      const question = await tool.confirm(input, ctx);
      if (question) return { tool, input, label, outcome: { status: 'needs_confirmation', question } };
    }
    return { tool, input, label, outcome: { status: 'done', output: await tool.run(ctx, input) } };
  } catch (e) {
    return { tool, input, label, outcome: { status: 'error', ...failureMessage(e) } };
  }
}
