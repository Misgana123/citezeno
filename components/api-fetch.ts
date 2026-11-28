'use client';

/* JSON calls to our own API from the browser: one error shape ({ error, code })
   turned into an ApiError with words for the user. */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
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
    throw new ApiError('network', 'Could not reach Citezeno. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!res.ok) throw new ApiError(body?.code ?? 'unavailable', body?.error ?? 'Something went wrong. Please try again.');
  return body as T;
}
