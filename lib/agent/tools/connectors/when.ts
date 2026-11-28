import { localDateTime, zonedToUtc } from '@/lib/providers/connectors/time';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../../context';

/* Times for the calendar and task tools: the model writes the user's local
   times ("2026-12-01" or "2026-12-01T09:00"); the apps get exact moments. */

/* The user's time zone, checked (UTC when unknown or invalid). */
export function zoneOf(ctx: AgentContext, asked?: string | null): string {
  for (const z of [asked, ctx.timeZone]) {
    if (!z) continue;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: z });
      return z;
    } catch {
      /* not a time zone */
    }
  }
  return 'UTC';
}

/* A local date or date-time (or an exact ISO time with Z / an offset) → an exact ISO time.
   end: a bare date means the end of that day. */
export function moment(v: string, tz: string, end = false): string {
  const s = v.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && s.includes('T')) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  let local: string;
  try {
    local = localDateTime(s);
  } catch {
    throw new ShelfError('bad_request', `“${s}” isn’t a date like 2026-12-01 or 2026-12-01T09:00.`);
  }
  if (local.length === 10) return end ? new Date(Date.parse(zonedToUtc(local, tz)) + 86_400_000).toISOString() : zonedToUtc(local, tz);
  return zonedToUtc(local, tz);
}

/* "Tue 1 Dec, 09:00" in the user's time zone. */
export function showTime(iso: string, tz: string, withDay = true): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...(withDay ? { weekday: 'short', day: 'numeric', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/* "Tue 1 Dec" for a date. */
export const showDate = (date: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));

/* Each local day between two moments, as [day start, day end] for a working window ("09:00"–"18:00"). */
export function dayWindows(from: string, to: string, tz: string, dayStart: string, dayEnd: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  let d = day(from);
  const last = day(to);
  for (let i = 0; i < 31 && d <= last; i++) {
    const s = zonedToUtc(`${d}T${dayStart}`, tz);
    const e = zonedToUtc(`${d}T${dayEnd}`, tz);
    const start = s < from ? from : s;
    const end = e > to ? to : e;
    if (end > start) out.push({ start, end });
    const next = new Date(`${d}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  return out;
}
