import { z } from 'zod';
import type { Capabilities, Capability } from '@/lib/providers/connectors/types';
import type { CapabilityOpener } from '@/lib/connectors/access';
import { ConnectorError } from '@/lib/connectors/errors';
import type { AgentContext } from '../../context';

/* What the connected-app tools share. */

/* The most text one step hands the model from a file, page or sheet. */
export const READ_CHARS = 40_000;
export const SHEET_ROWS = 500;

export const clip = (s: string | undefined | null, n: number) => (!s ? '' : s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/* The "app" input of tools for a capability more than one app can give (calendars, tasks, files). */
export const APP = z
  .string()
  .trim()
  .max(40)
  .optional()
  .describe('Which connected app to use when more than one can do this (its id, e.g. "google-calendar" or "microsoft"; see Connected apps). Leave out to use the default.');

/* The capability from the user's connected app (the one asked for, else the
   default), or a plain "connect it first". */
export async function app<C extends Capability>(ctx: AgentContext, cap: C, which?: string | null): Promise<{ api: Capabilities[C]; connector: string; label: string }> {
  if (!ctx.connectors?.connected.has(cap)) throw new ConnectorError('not_connected', 'No app that can do this is connected. The user can connect one in Settings → Customize → Connectors.');
  return ctx.connectors.open(cap, which);
}

/* The same opener, for the shared services (send, import). */
export const opener =
  (ctx: AgentContext): CapabilityOpener =>
  (cap, which) =>
    app(ctx, cap, which);

/* The app's name for a question, when known ("your Google Drive"). */
export const appLabel = (ctx: AgentContext, cap: Capability, fallback: string, which?: string | null) =>
  (which ? ctx.connectors?.apps?.get(cap)?.find((a) => a.name === which)?.label : undefined) ?? ctx.connectors?.connected.get(cap)?.label ?? fallback;
