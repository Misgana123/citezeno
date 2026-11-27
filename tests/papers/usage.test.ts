import { describe, expect, it } from 'vitest';
import { PapersError } from '@/lib/papers/errors';
import { reserveSearches } from '@/lib/papers/guard/usage';
import { resetsIn, userMessage } from '@/lib/papers/messages';
import { memoryUsage } from '@/lib/papers/store/memory';

const NOW = Date.UTC(2026, 10, 18, 21, 30);

describe('per-user daily limit', () => {
  it('reserves, refuses past the limit, and gives back unused searches', async () => {
    const usage = memoryUsage();
    const a = await reserveSearches(usage, 'u1', 2, 3, NOW);
    expect(await usage.used('u1', '2026-11-18')).toBe(2);
    await a.settle(1); // a cache hit saved one
    expect(await usage.used('u1', '2026-11-18')).toBe(1);

    await reserveSearches(usage, 'u1', 2, 3, NOW);
    const e = await reserveSearches(usage, 'u1', 1, 3, NOW).catch((x) => x);
    expect(e).toMatchObject({ code: 'user_limit', details: { resetsAt: '2026-11-19T00:00:00.000Z', limit: 3 } });
    expect(await usage.used('u2', '2026-11-18')).toBe(0);
  });

  it('resets the next UTC day and ignores zero-search requests', async () => {
    const usage = memoryUsage();
    await reserveSearches(usage, 'u1', 3, 3, NOW);
    await expect(reserveSearches(usage, 'u1', 1, 3, NOW + 3 * 3_600_000)).resolves.toMatchObject({ reserved: 1 });
    await expect(reserveSearches(usage, 'u1', 0, 3, NOW)).resolves.toMatchObject({ reserved: 0 });
  });

  it('tells the user when the limit resets', () => {
    expect(resetsIn('2026-11-19T00:00:00.000Z', NOW)).toBe('in about 3 hours');
    expect(resetsIn('2026-11-19T00:00:00.000Z', Date.UTC(2026, 10, 18, 23, 35))).toBe('in 25 minutes');
    const e = new PapersError('user_limit', 'x', { resetsAt: '2026-11-19T00:00:00.000Z' });
    expect(userMessage(e, NOW)).toBe("You've reached today's search limit. It resets at midnight UTC (in about 3 hours).");
  });
});
