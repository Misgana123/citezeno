import { describe, expect, it, vi } from 'vitest';
import { CODE_SANDBOX_PROVIDERS } from '@/lib/providers/code-sandbox/registry';
import { createE2b, e2bPolicy, sandboxPath, type SandboxApi } from '@/lib/providers/e2b/sandbox';
import type { Gate } from '@/lib/providers/types';

const ungated: Gate = (t) => t;

/* A fake E2B: sandboxes by ID, with files and a scripted run. */
function fakeSdk(opts: { known?: string[]; error?: boolean } = {}) {
  const writes: { id: string; path: string }[] = [];
  const created: unknown[] = [];
  const box = (sandboxId: string) => ({
    sandboxId,
    runCode: vi.fn(async () => ({
      results: [{ png: 'iVBORw0K' }, { text: '42' }],
      logs: { stdout: ['mean: 3.5\n'], stderr: [] as string[] },
      ...(opts.error ? { error: { name: 'ValueError', value: 'bad', traceback: 'Traceback…' } } : {}),
    })),
    files: {
      write: vi.fn(async (path: string) => void writes.push({ id: sandboxId, path })),
      read: vi.fn(async (path: string) => {
        if (path.endsWith('missing.csv')) throw new Error('not found');
        return new TextEncoder().encode('a,b\n1,2');
      }),
    },
    setTimeout: vi.fn(async () => {}),
    kill: vi.fn(async () => true),
  });
  const api: SandboxApi = {
    create: vi.fn(async (o) => (created.push(o), box('sb_new'))),
    connect: vi.fn(async (id) => {
      if (!(opts.known ?? []).includes(id)) throw new Error('sandbox not found');
      return box(id);
    }),
  };
  return { api, writes, created };
}

const req = { code: 'print(1)', upload: [{ path: 'data.csv', bytes: new Uint8Array([1]) }], download: ['out.csv', 'missing.csv'], timeoutMs: 30_000 };

describe('code sandbox (E2B)', () => {
  it('is registered under its job, and is off without a key', () => {
    expect(Object.keys(CODE_SANDBOX_PROVIDERS)).toEqual(['e2b']);
    expect(createE2b({}, ungated)).toBeNull();
  });

  it('starts a sandbox with internet and no secrets, uploads, runs, and downloads', async () => {
    const sdk = fakeSdk();
    const box = createE2b({ E2B_API_KEY: 'e2b_key', SECRET: 'x' }, ungated, async () => sdk.api)!;
    const out = await box.run({ ...req, sessionId: null });
    expect(sdk.created).toEqual([{ apiKey: 'e2b_key', timeoutMs: 180_000, allowInternetAccess: true }]);
    expect(JSON.stringify(sdk.created)).not.toContain('SECRET');
    expect(sdk.writes).toEqual([{ id: 'sb_new', path: '/home/user/data.csv' }]);
    expect(out).toMatchObject({ sessionId: 'sb_new', stdout: 'mean: 3.5\n', outputs: [{ mime: 'image/png' }, { mime: 'text/plain', data: '42' }], missing: ['missing.csv'], error: null });
    expect(out.files.map((f) => f.path)).toEqual(['out.csv']);
  });

  it('keeps using the chat’s session, and starts again when it has ended', async () => {
    const sdk = fakeSdk({ known: ['sb_old'] });
    const box = createE2b({ E2B_API_KEY: 'k' }, ungated, async () => sdk.api)!;
    expect((await box.run({ ...req, sessionId: 'sb_old' })).sessionId).toBe('sb_old');
    expect(sdk.created).toHaveLength(0);
    expect((await box.run({ ...req, sessionId: 'sb_gone' })).sessionId).toBe('sb_new');
  });

  it('passes on the code’s own error, cuts the internet when told, and uses a custom template', async () => {
    const sdk = fakeSdk({ error: true });
    const box = createE2b({ E2B_API_KEY: 'k', CODE_SANDBOX_INTERNET: 'off', E2B_TEMPLATE: 'citezeno-office' }, ungated, async () => sdk.api)!;
    expect((await box.run({ ...req, sessionId: null })).error).toEqual({ name: 'ValueError', message: 'bad', traceback: 'Traceback…' });
    expect(sdk.created[0]).toMatchObject({ allowInternetAccess: false, template: 'citezeno-office' });
  });

  it('keeps files inside the work folder', () => {
    expect(sandboxPath('data.csv')).toBe('/home/user/data.csv');
    expect(sandboxPath('/home/user/out/x.csv')).toBe('/home/user/out/x.csv');
    for (const p of ['../etc/passwd', '/etc/passwd', 'a/../../b', '']) expect(() => sandboxPath(p), p).toThrow();
  });

  it('is never retried or cached, and has a daily cap', () => {
    const p = e2bPolicy({ CODE_DAILY_CAP_USD: '4' });
    expect(p.retryTries).toBe(1);
    expect(p.describe({ op: 'close', sessionId: 'x' })).toMatchObject({ search: false, cacheKey: null });
    expect(p.spend?.dailyCapUsd).toBe(4);
  });
});
