/* Who may open a shared link: optional expiry and optional password.
   Pure rules, used by the share dialog (browser) and the API and public page (server).
   Hashing and cookies live in lib/share-unlock.ts, which is server-only. */

export const EXPIRY_PRESETS = [
  { id: 'never', label: 'Never', days: 0 },
  { id: '1d', label: '1 day', days: 1 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
] as const;
export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]['id'];

/* a custom expiry can be at most this far ahead */
export const MAX_EXPIRY_DAYS = 365 * 5;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;

/* Wrong-password attempts: like the sign-in rule in lib/auth.ts (5 a minute). */
export const UNLOCK_WINDOW_S = 60;
export const UNLOCK_MAX = 5;
/* how long an unlocked link stays open in that browser */
export const UNLOCK_TTL_S = 60 * 60 * 12;

const DAY = 86_400_000;

/* What the dialog sends as `expires`:
     'never' | '1d' | '7d' | '30d' → relative to now
     an ISO date-time               → that moment (a custom date)
   Returns the new expiry (null = never), or an error message. */
export function parseExpiry(input: unknown, now = Date.now()): { at: Date | null } | { error: string } {
  if (input === 'never' || input === null) return { at: null };
  const preset = EXPIRY_PRESETS.find((p) => p.id === input);
  if (preset) return { at: new Date(now + preset.days * DAY) };
  if (typeof input !== 'string' || input.length > 40) return { error: 'Choose when the link should expire.' };
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return { error: 'That expiry date isn’t valid.' };
  if (t <= now) return { error: 'Pick an expiry date in the future.' };
  if (t > now + MAX_EXPIRY_DAYS * DAY) return { error: 'Pick an expiry date within the next 5 years.' };
  return { at: new Date(t) };
}

export function isExpired(expiresAt: Date | string | number | null | undefined, now = Date.now()) {
  if (expiresAt == null) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

/* null when the password is acceptable, otherwise the reason. */
export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string') return 'Enter a password.';
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/* The end of a picked calendar day (yyyy-mm-dd) in the viewer's time zone, as ISO. */
export function endOfDay(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function formatExpiry(at: string | number | Date) {
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
