import { describe, expect, it, vi } from 'vitest';
import { PapersError } from '@/lib/papers/errors';
import { errorResponse, signedOut } from '@/lib/papers/respond';

// respond.ts is server-only (it must never reach a browser bundle); tests run on the server side
vi.mock('server-only', () => ({}));

/* Section 9 of the spec: every failure reaches the user as the right status and message. */

async function body(res: Response) {
  return { status: res.status, retry: res.headers.get('retry-after'), json: (await res.json()) as Record<string, unknown> };
}

describe('errorResponse', () => {
  it('OpenAlex down or timed out → 502 "temporarily unavailable"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await body(errorResponse(new PapersError('unavailable', 'OpenAlex timed out.', { reason: 'timeout' })));
    expect(r.status).toBe(502);
    expect(r.json).toEqual({ error: 'Paper search is temporarily unavailable. Please try again shortly.', code: 'unavailable' });
    warn.mockRestore();
  });

  it('rate limited after retries → 503 "busy" with Retry-After', async () => {
    const r = await body(errorResponse(new PapersError('busy', 'OpenAlex is rate limiting requests.', { status: 429, retryAfterS: 1.5 })));
    expect(r.status).toBe(503);
    expect(r.retry).toBe('2');
    expect(r.json).toMatchObject({ error: 'Search is busy, please try again in a moment.', code: 'busy', retryAfterS: 1.5 });
  });

  it('daily limit → 429 with when it resets', async () => {
    const resetsAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const r = await body(errorResponse(new PapersError('user_limit', 'x', { resetsAt })));
    expect(r.status).toBe(429);
    expect(r.json.error).toMatch(/^You've reached today's search limit\. It resets at midnight UTC \(in about 2 hours\)\.$/);
    expect(r.json.resetsAt).toBe(resetsAt);
  });

  it('spending cap → the same "temporarily unavailable" message (no billing details)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await body(errorResponse(new PapersError('budget', 'Daily OpenAlex spending cap ($2) reached.')));
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.json)).not.toContain('$');
    warn.mockRestore();
  });

  it('bad input → 400 with its own message', async () => {
    const r = await body(errorResponse(new PapersError('bad_request', 'The "from" year is after the "to" year.')));
    expect(r).toMatchObject({ status: 400, json: { error: 'The "from" year is after the "to" year.', code: 'bad_request' } });
  });

  it('unknown paper → 404', async () => {
    expect((await body(errorResponse(new PapersError('not_found', 'x')))).status).toBe(404);
  });

  it('unexpected errors are logged on the server but never shown', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await body(errorResponse(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2')));
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toMatch(/ECONNREFUSED|hunter2/);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('signed out → 401', async () => {
    expect(await body(signedOut())).toMatchObject({ status: 401, json: { code: 'signed_out' } });
  });
});
