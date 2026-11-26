import type { CodeOutput, CodeRequest, CodeRun, CodeSandbox, SandboxFile } from '../code-sandbox/types';
import { ProviderError } from '../errors';
import type { GatewayPolicy, Transport } from '../gateway/types';
import type { Env, Gate } from '../types';

/* E2B cloud sandboxes (@e2b/code-interpreter). E2B_API_KEY, server only.

     E2B_TEMPLATE              a custom sandbox template (default: E2B's code interpreter)
     E2B_USD_PER_SECOND        what a running sandbox costs us per second (default 0.00003)
     CODE_SANDBOX_INTERNET     "off" cuts the sandbox off from the internet (default on)
     CODE_DAILY_ALERT_USD      log a warning once a day's sandbox spending passes this (default 2)
     CODE_DAILY_CAP_USD        stop running code once it passes this (default 10)

   Nothing secret goes into the sandbox: no keys, no environment variables,
   only the files a run asks for. A session stays open for a few idle minutes
   (so the next run keeps its variables), then E2B ends it. Runs are never
   retried: running code twice isn't safe. */

export const PROVIDER = 'e2b';
const LABEL = 'E2B';
const IDLE_MS = 10 * 60_000;
const OUT_CHARS = 20_000;
export const WORK_DIR = '/home/user';

type SandboxLike = {
  sandboxId: string;
  runCode(
    code: string,
    opts: { timeoutMs: number },
  ): Promise<{ results: { png?: string; jpeg?: string; svg?: string; text?: string }[]; logs: { stdout: string[]; stderr: string[] }; error?: { name: string; value: string; traceback: string } }>;
  files: { write(path: string, data: ArrayBuffer): Promise<unknown>; read(path: string, opts: { format: 'bytes' }): Promise<Uint8Array> };
  setTimeout(ms: number): Promise<void>;
  kill(): Promise<unknown>;
};
export type SandboxApi = {
  create(opts: { apiKey: string; timeoutMs: number; allowInternetAccess: boolean; template?: string }): Promise<SandboxLike>;
  connect(id: string, opts: { apiKey: string }): Promise<SandboxLike>;
};

type E2bRequest = { op: 'run'; req: CodeRequest } | { op: 'close'; sessionId: string };

const loadSdk = async (): Promise<SandboxApi> => {
  const { Sandbox } = await import('@e2b/code-interpreter');
  return {
    create: ({ template, ...opts }) => (template ? Sandbox.create(template, opts) : Sandbox.create(opts)) as unknown as Promise<SandboxLike>,
    connect: (id, opts) => Sandbox.connect(id, opts) as unknown as Promise<SandboxLike>,
  };
};

const clip = (s: string) => (s.length > OUT_CHARS ? `${s.slice(0, OUT_CHARS)}\n… [cut: ${s.length - OUT_CHARS} more characters]` : s);

/* A path inside the sandbox's work folder ("data.csv" → /home/user/data.csv); nothing outside it. */
export function sandboxPath(p: string): string {
  const rel = p.replace(/^\/home\/user\/?/, '').replace(/^\.\//, '');
  if (!rel || rel.startsWith('/') || rel.split('/').some((part) => part === '..' || part === ''))
    throw new ProviderError('bad_request', `"${p}" isn’t a file in the sandbox's work folder.`, { provider: PROVIDER, reason: 'path' });
  return `${WORK_DIR}/${rel}`;
}

function sdkError(e: unknown, what: string): ProviderError {
  const err = e as { name?: string; message?: string; status?: number };
  const msg = err?.message ?? '';
  if (/rate limit|429/i.test(msg)) return new ProviderError('busy', `${LABEL} is rate limiting requests.`, { provider: PROVIDER, reason: msg.slice(0, 200) });
  if (/unauthori[sz]ed|401|403|api key/i.test(msg)) return new ProviderError('unavailable', `${LABEL} refused our key.`, { provider: PROVIDER, reason: 'auth' });
  if (/timeout|timed out/i.test(msg)) return new ProviderError('unavailable', `${LABEL} took too long to ${what}.`, { provider: PROVIDER, reason: 'timeout' });
  return new ProviderError('unavailable', `${LABEL} could not ${what}.`, { provider: PROVIDER, reason: msg.slice(0, 200) });
}

export function e2bTransport(
  apiKey: string,
  opts: { template?: string; internet: boolean; usdPerSecond: number },
  sdk: () => Promise<SandboxApi> = loadSdk,
  now: () => number = Date.now,
): Transport<E2bRequest> {
  /* The session's sandbox: connect to it, or start a new one when it ended. */
  const open = async (api: SandboxApi, sessionId: string | null): Promise<SandboxLike> => {
    if (sessionId) {
      try {
        return await api.connect(sessionId, { apiKey });
      } catch {
        // ended or unknown: start again
      }
    }
    try {
      return await api.create({ apiKey, timeoutMs: IDLE_MS, allowInternetAccess: opts.internet, ...(opts.template ? { template: opts.template } : {}) });
    } catch (e) {
      throw sdkError(e, 'start a sandbox');
    }
  };

  return {
    async call<T>(r: E2bRequest) {
      const api = await sdk();
      if (r.op === 'close') {
        const box = await api.connect(r.sessionId, { apiKey }).catch(() => null);
        await box?.kill().catch(() => {});
        return { body: null as T, costUsd: 0, status: 200 };
      }
      const { req } = r;
      const started = now();
      const box = await open(api, req.sessionId);
      try {
        for (const f of req.upload) await box.files.write(sandboxPath(f.path), f.bytes.slice().buffer as ArrayBuffer);
        let exec: Awaited<ReturnType<SandboxLike['runCode']>>;
        try {
          exec = await box.runCode(req.code, { timeoutMs: req.timeoutMs });
        } catch (e) {
          throw sdkError(e, 'run the code');
        }
        const outputs: CodeOutput[] = exec.results.flatMap((x): CodeOutput[] => {
          if (x.png) return [{ mime: 'image/png', data: x.png }];
          if (x.jpeg) return [{ mime: 'image/jpeg', data: x.jpeg }];
          if (x.svg) return [{ mime: 'image/svg+xml', data: x.svg }];
          return x.text ? [{ mime: 'text/plain', data: clip(x.text) }] : [];
        });
        const files: SandboxFile[] = [];
        const missing: string[] = [];
        for (const p of req.download) {
          try {
            files.push({ path: p, bytes: await box.files.read(sandboxPath(p), { format: 'bytes' }) });
          } catch (e) {
            if (e instanceof ProviderError) throw e;
            missing.push(p);
          }
        }
        // keep the session for the next run
        await box.setTimeout(IDLE_MS).catch(() => {});
        const run: CodeRun = {
          sessionId: box.sandboxId,
          stdout: clip(exec.logs.stdout.join('')),
          stderr: clip(exec.logs.stderr.join('')),
          error: exec.error ? { name: exec.error.name, message: exec.error.value, traceback: clip(exec.error.traceback) } : null,
          outputs,
          files,
          missing,
        };
        return { body: run as T, costUsd: ((now() - started) / 1000) * opts.usdPerSecond, status: 200 };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw sdkError(e, 'move the files');
      }
    },
  };
}

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

/* Never cached, never retried, never counted as a paper search. */
export function e2bPolicy(env: Env): GatewayPolicy<E2bRequest> {
  return {
    provider: PROVIDER,
    label: LABEL,
    describe: () => ({ search: false, cacheKey: null, cacheTtlS: 0 }),
    // a run is billed by the second: at most its time limit
    estimateUsd: (r) => (r.op === 'run' ? (r.req.timeoutMs / 1000) * positive(env.E2B_USD_PER_SECOND, 0.00003) : 0),
    spend: { dailyAlertUsd: positive(env.CODE_DAILY_ALERT_USD, 2), dailyCapUsd: positive(env.CODE_DAILY_CAP_USD, 10), configHint: 'CODE_DAILY_ALERT_USD and CODE_DAILY_CAP_USD' },
    concurrency: 10,
    maxQueue: 40,
    retryTries: 1,
  };
}

export function e2b(transport: Transport<E2bRequest>): CodeSandbox {
  return { name: PROVIDER, run: async (req) => (await transport.call<CodeRun>({ op: 'run', req })).body, close: async (sessionId) => void (await transport.call({ op: 'close', sessionId })) };
}

export function createE2b(env: Env, gate: Gate, sdk?: () => Promise<SandboxApi>): CodeSandbox | null {
  const key = env.E2B_API_KEY?.trim();
  if (!key) return null;
  const opts = { template: env.E2B_TEMPLATE?.trim() || undefined, internet: env.CODE_SANDBOX_INTERNET?.trim().toLowerCase() !== 'off', usdPerSecond: positive(env.E2B_USD_PER_SECOND, 0.00003) };
  return e2b(gate(e2bTransport(key, opts, sdk), e2bPolicy(env)));
}
