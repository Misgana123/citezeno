import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPIRY_PRESETS, MAX_EXPIRY_DAYS, UNLOCK_MAX, UNLOCK_WINDOW_S, endOfDay, isExpired, parseExpiry, passwordProblem } from '@/lib/share-access';
import { checkSharePassword, hashSharePassword, isUnlocked, unlockCookie, unlockSignature } from '@/lib/share-unlock';

const NOW = Date.UTC(2026, 10, 17, 12);
const DAY = 86_400_000;

describe('share link expiry', () => {
  it('turns presets into dates from now', () => {
    expect(EXPIRY_PRESETS.map((p) => p.id)).toEqual(['never', '1d', '7d', '30d']);
    expect(parseExpiry('never', NOW)).toEqual({ at: null });
    expect(parseExpiry(null, NOW)).toEqual({ at: null });
    expect(parseExpiry('1d', NOW)).toEqual({ at: new Date(NOW + DAY) });
    expect(parseExpiry('7d', NOW)).toEqual({ at: new Date(NOW + 7 * DAY) });
    expect(parseExpiry('30d', NOW)).toEqual({ at: new Date(NOW + 30 * DAY) });
  });

  it('accepts a custom future date and rejects bad ones', () => {
    const iso = new Date(NOW + 3 * DAY).toISOString();
    expect(parseExpiry(iso, NOW)).toEqual({ at: new Date(iso) });
    expect(parseExpiry(new Date(NOW - 1000).toISOString(), NOW)).toHaveProperty('error');
    expect(parseExpiry(new Date(NOW + (MAX_EXPIRY_DAYS + 1) * DAY).toISOString(), NOW)).toHaveProperty('error');
    expect(parseExpiry('tomorrow-ish', NOW)).toHaveProperty('error');
    expect(parseExpiry(42, NOW)).toHaveProperty('error');
    expect(parseExpiry({}, NOW)).toHaveProperty('error');
  });

  it('knows when a link has expired; no expiry never expires', () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
    expect(isExpired(new Date(NOW + 1), NOW)).toBe(false);
    expect(isExpired(new Date(NOW), NOW)).toBe(true);
    expect(isExpired(new Date(NOW - DAY).toISOString(), NOW)).toBe(true);
  });

  it('a picked day lasts until its end, in local time', () => {
    const iso = endOfDay('2026-12-01')!;
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 1, 23, 59]);
    expect(endOfDay('01/12/2026')).toBeNull();
    expect(endOfDay('')).toBeNull();
  });
});

describe('share link passwords', () => {
  it('checks length', () => {
    expect(passwordProblem('abc')).toMatch(/at least 4/);
    expect(passwordProblem('abcd')).toBeNull();
    expect(passwordProblem('x'.repeat(129))).toMatch(/at most/);
    expect(passwordProblem(undefined)).toMatch(/Enter/);
  });

  it('stores only a hash, made the same way as account passwords', async () => {
    const hash = await hashSharePassword('river-otter');
    expect(hash).not.toContain('river-otter');
    // Better Auth's scrypt format: salt:key in hex
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await checkSharePassword(hash, 'river-otter')).toBe(true);
    expect(await checkSharePassword(hash, 'River-otter')).toBe(false);
    expect(await checkSharePassword('not-a-hash', 'river-otter')).toBe(false);
  });

  it('unlock cookies are per link and stop working when the password changes', () => {
    const secret = 's'.repeat(32);
    const sig = unlockSignature(secret, 'tokenAAAAAAAA', 'hash1');
    expect(unlockCookie('tokenAAAAAAAA')).toBe('cz_unlock_tokenAAAAAAAA');
    expect(isUnlocked(secret, 'tokenAAAAAAAA', 'hash1', sig)).toBe(true);
    expect(isUnlocked(secret, 'tokenBBBBBBBB', 'hash1', sig)).toBe(false);
    expect(isUnlocked(secret, 'tokenAAAAAAAA', 'hash2', sig)).toBe(false);
    expect(isUnlocked('other-secret-xxxxxxxxxxxxxxxxxxxxxx', 'tokenAAAAAAAA', 'hash1', sig)).toBe(false);
    expect(isUnlocked(secret, 'tokenAAAAAAAA', 'hash1', undefined)).toBe(false);
    expect(isUnlocked(secret, 'tokenAAAAAAAA', 'hash1', 'short')).toBe(false);
    expect(isUnlocked('', 'tokenAAAAAAAA', 'hash1', sig)).toBe(false);
  });

  it('limits attempts like the sign-in endpoint', () => {
    const auth = readFileSync('lib/auth.ts', 'utf8');
    const rule = /'\/sign-in\/email': \{ window: (\d+), max: (\d+) \}/.exec(auth)!;
    expect([UNLOCK_WINDOW_S, UNLOCK_MAX]).toEqual([Number(rule[1]), Number(rule[2])]);
  });
});
