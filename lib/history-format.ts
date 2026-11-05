/* History labels and types, shared by the server and the browser (no database imports). */
import { REASONS } from './pricing';

export type HistoryFilter = 'all' | 'traces' | 'credits' | 'sharing' | 'security';
export const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'traces', label: 'Traces' },
  { id: 'credits', label: 'Credits' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'security', label: 'Sign-ins and security' },
];

export type HistoryItem = {
  id: string;
  at: string;
  kind: string;
  traceId: string | null;
  title: string | null;
  meta: Record<string, unknown>;
  delta: number | null;
  traceExists: boolean;
};

function device(ua: string) {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
}

/* A plain-language sentence for one item. Titles are returned separately so the page can link them. */
export function describe(it: HistoryItem): { text: string; detail?: string } {
  const m = it.meta || {};
  const n = (v: unknown) => Number(v) || 0;
  switch (it.kind) {
    case 'trace.created':
      return { text: 'Traced', detail: `${n(m.sources)} source${n(m.sources) === 1 ? '' : 's'} found` };
    case 'trace.renamed':
      return { text: 'Renamed', detail: m.from ? `was “${String(m.from)}”` : undefined };
    case 'trace.deleted':
      return { text: 'Deleted' };
    case 'trace.shared':
      return { text: 'Shared a public link to' };
    case 'trace.unshared':
      return { text: 'Turned off the public link to', detail: m.views != null ? `${n(m.views)} view${n(m.views) === 1 ? '' : 's'}` : undefined };
    case 'auth.signin':
      return { text: `Signed in with ${device(String(m.userAgent || ''))}`, detail: m.ip ? String(m.ip) : undefined };
    case 'auth.password':
      return { text: m.via === 'reset' ? 'Reset your password by email' : 'Changed your password' };
    case 'auth.2fa-on':
      return { text: 'Turned on two-step verification' };
    case 'auth.2fa-off':
      return { text: 'Turned off two-step verification' };
    case 'contact.sent':
      return { text: 'Sent a message to the team' };
    case 'credits.trace':
      return { text: `Searched ${n(m.claims)} claim${n(m.claims) === 1 ? '' : 's'}`, detail: m.refunded ? 'credits returned' : undefined };
    case 'credits.cite':
      return { text: 'Cited a single claim', detail: m.refunded ? 'credit returned' : undefined };
    case 'credits.purchase':
      return { text: `Bought credits${m.product ? `: ${String(m.product)}` : ''}` };
    case 'credits.refund':
      return { text: 'Payment refunded' };
    case 'credits.adjust':
      return { text: 'Credits adjusted by the team', detail: m.note ? String(m.note) : undefined };
    default:
      return { text: REASONS[it.kind.replace('credits.', '')] || it.kind };
  }
}
