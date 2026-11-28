import type { Capabilities, Capability } from '@/lib/providers/connectors/types';
import type { CapabilityOpener } from '@/lib/connectors/access';
import { ConnectorError } from '@/lib/connectors/errors';
import type { AgentContext } from '../../context';

/* What the connected-app tools share. */

/* The most text one step hands the model from a file, page or sheet. */
export const READ_CHARS = 40_000;
export const SHEET_ROWS = 500;

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/* The capability from the user's connected app, or a plain "connect it first". */
export async function app<C extends Capability>(ctx: AgentContext, cap: C): Promise<{ api: Capabilities[C]; connector: string; label: string }> {
  if (!ctx.connectors?.connected.has(cap)) throw new ConnectorError('not_connected', 'No app that can do this is connected. The user can connect one in Settings → Customize → Connectors.');
  return ctx.connectors.open(cap);
}

/* The same opener, for the shared services (send, import). */
export const opener =
  (ctx: AgentContext): CapabilityOpener =>
  (cap) =>
    app(ctx, cap);

/* The app's name for a question, when known ("your Google Drive"). */
export const appLabel = (ctx: AgentContext, cap: Capability, fallback: string) => ctx.connectors?.connected.get(cap)?.label ?? fallback;
