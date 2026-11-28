/* Dates and times the calendar adapters share, vendor-neutral. */

/* "2026-12-01T09:00" (or with seconds) → "2026-12-01T09:00:00"; a date stays a date. */
export function localDateTime(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
  if (!m) throw new Error(`“${v}” isn’t a date and time like 2026-12-01T09:00.`);
  return m[2] ? `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}` : m[1];
}

/* The day after a date (an all-day event's end is exclusive at the vendors). */
export function nextDay(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function previousDay(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* Free stretches of at least minMinutes between busy times (ISO times, any offset), from `from` to `to`. */
export function freeSlots(busy: { start: string; end: string }[], from: string, to: string, minMinutes: number): { start: string; end: string }[] {
  const spans = busy
    .map((b) => [Date.parse(b.start), Date.parse(b.end)] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: { start: string; end: string }[] = [];
  let at = Date.parse(from);
  const end = Date.parse(to);
  for (const [a, b] of spans) {
    if (a > at && a - at >= minMinutes * 60_000) out.push({ start: new Date(at).toISOString(), end: new Date(Math.min(a, end)).toISOString() });
    at = Math.max(at, b);
    if (at >= end) break;
  }
  if (end - at >= minMinutes * 60_000) out.push({ start: new Date(at).toISOString(), end: new Date(end).toISOString() });
  return out;
}

/* The offset (ms) of a time zone at one moment: local wall time minus UTC. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(utcMs / 1000) * 1000;
}

/* A local wall time ("2026-12-01T09:00") in an IANA time zone → its UTC ISO time. */
export function zonedToUtc(local: string, timeZone: string): string {
  const v = localDateTime(local);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/.exec(v)!;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let utc = wall - offsetAt(wall, timeZone);
  // across a daylight-saving change the offset differs at the true moment
  utc = wall - offsetAt(utc, timeZone);
  return new Date(utc).toISOString();
}
