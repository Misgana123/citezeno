import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/reader/worker/route';

describe('PDF.js worker route', () => {
  it('serves the pinned worker from our origin, cached for good', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100_000);
  });
});
