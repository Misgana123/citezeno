'use client';

import type { ReaderTextState, ReaderView } from '@/lib/reader/service/open';

/* The reader's calls to our server. Errors come back as ReaderApiError with
   the server's code and a message written for the user. */

export type ReaderData = ReaderView & { ai: boolean };
export type { ReaderTextState };

export class ReaderApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ReaderApiError';
  }
}

export async function readerFetch<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ReaderApiError('network', 'You seem to be offline. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) throw new ReaderApiError(data?.code ?? 'unavailable', data?.error ?? 'Something went wrong. Please try again.', res.status);
  return data as T;
}

export const readerUrl = (paperId: string, rest = '') => `/api/reader/${encodeURIComponent(paperId)}${rest}`;
export const readHref = (paperId: string) => `/app/read/${encodeURIComponent(paperId)}`;
