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

/* Reading from a lab's shelf ("lab:<id>"): set by the reader page (from ?lab=)
   and by a lab chat's file panel; every reader request carries it. */
let space: string | null = null;
export const setReaderSpace = (v: string | null) => (space = v);
export const readerSpace = () => space;

export const readerUrl = (paperId: string, rest = '') => {
  const url = `/api/reader/${encodeURIComponent(paperId)}${rest}`;
  return space ? `${url}${url.includes('?') ? '&' : '?'}space=${encodeURIComponent(space)}` : url;
};

/* The reader's page for a paper (optionally one of the user's own PDFs of it, or from a lab's shelf: space "lab:<id>"). */
export const readHref = (paperId: string, pdfId?: string | null, from?: string | null) => {
  const q = new URLSearchParams();
  if (pdfId) q.set('pdf', pdfId);
  if (from?.startsWith('lab:')) q.set('lab', from.slice(4));
  const s = q.toString();
  return `/app/read/${encodeURIComponent(paperId)}${s ? `?${s}` : ''}`;
};
