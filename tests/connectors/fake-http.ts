import { connectorTransport } from '@/lib/providers/connectors/http';
import type { ConnectorDefinition } from '@/lib/providers/connectors/types';
import type { Gate } from '@/lib/providers/types';

/* A pretend vendor for adapter tests: answers by "METHOD host/path" prefix, records every call. */
export type Seen = { url: URL; method: string; headers: Record<string, string>; body: unknown; json: () => Record<string, unknown> };

export function fakeVendor(answers: Record<string, (s: Seen) => Response>) {
  const seen: Seen[] = [];
  const doFetch = (async (u: string, init: RequestInit) => {
    const s: Seen = { url: new URL(u), method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body, json: () => JSON.parse(String(init.body)) };
    seen.push(s);
    // the longest matching route wins
    const key = Object.keys(answers)
      .filter((k) => `${s.method} ${s.url.host}${decodeURIComponent(s.url.pathname)}`.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    return key ? answers[key](s) : new Response('{"error":{"message":"no route"}}', { status: 404 });
  }) as unknown as typeof fetch;
  return { seen, doFetch };
}

export const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

/* A connector built on the fake fetch instead of the gateway. */
export function buildWith(def: ConnectorDefinition, doFetch: typeof fetch, env: Record<string, string>) {
  const gate: Gate = (_t, policy) => connectorTransport({ provider: policy.provider, label: policy.label, fetch: doFetch }) as never;
  return def.create(env, gate)!;
}

export const cred = { accessToken: 'at', account: { id: 'a1', label: 'me@x.com' } };
