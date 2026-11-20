/* Browser-side calls to /api/shelf. Only our own server is called. */

export type ShelfApiCode =
  | 'signed_out'
  | 'bad_request'
  | 'not_found'
  | 'duplicate'
  | 'name_taken'
  | 'too_large'
  | 'storage_full'
  | 'user_limit'
  | 'invalid_file'
  | 'busy'
  | 'unavailable'
  | 'budget'
  | 'network';

export class ShelfApiError extends Error {
  constructor(
    readonly code: ShelfApiCode,
    message: string,
    readonly itemId?: string,
  ) {
    super(message);
  }
}

export async function shelfFetch<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      signal: init.signal,
      cache: 'no-store',
      headers: { accept: 'application/json', ...(init.body !== undefined && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
      body: init.body === undefined ? undefined : init.body instanceof FormData ? init.body : JSON.stringify(init.body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ShelfApiError('network', 'Could not reach Citezeno. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as { error?: string; code?: ShelfApiCode; itemId?: string } | null;
  if (!res.ok) throw new ShelfApiError(body?.code ?? 'unavailable', body?.error ?? 'Something went wrong. Please try again.', body?.itemId);
  return body as T;
}

export const shelfItemHref = (itemId: string) => `/app/shelf?item=${encodeURIComponent(itemId)}`;
