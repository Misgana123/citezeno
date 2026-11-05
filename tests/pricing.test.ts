import { describe, expect, it } from 'vitest';
import { monthKey, nextReset } from '@/lib/pricing';

describe('credit months', () => {
  it('resets on the first of next month, UTC', () => {
    expect(nextReset(new Date('2026-11-05T09:00:00Z'))).toBe('2026-12-01T00:00:00.000Z');
    expect(nextReset(new Date('2026-12-31T23:59:59Z'))).toBe('2027-01-01T00:00:00.000Z');
  });
  it('keys months as YYYY-MM', () => {
    expect(monthKey(new Date('2026-02-28T12:00:00Z'))).toBe('2026-02');
  });
});
