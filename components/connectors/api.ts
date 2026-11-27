'use client';

import type { ConnectorView } from '@/lib/connectors/catalog';

/* Browser-side calls to /api/connectors. Only our own server is called; the
   apps' tokens never reach the browser. */

export class ConnectorApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function connectorFetch<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      signal: init.signal,
      cache: 'no-store',
      headers: { accept: 'application/json', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ConnectorApiError('network', 'Could not reach Citezeno. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!res.ok) throw new ConnectorApiError(body?.code ?? 'unavailable', body?.error ?? 'Something went wrong. Please try again.');
  return body as T;
}

export const listConnectors = () => connectorFetch<{ connectors: ConnectorView[] }>('/api/connectors').then((r) => r.connectors);

/* The app's sign-in page, coming back to `back` (a path on our site). */
export const connectHref = (name: string, back: string) => `/api/connectors/${encodeURIComponent(name)}/start?back=${encodeURIComponent(back)}`;
