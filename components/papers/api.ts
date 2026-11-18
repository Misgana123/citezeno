import type { PaperList } from '@/lib/papers/search/types';
import type { Paper } from '@/lib/papers/types';

/* Browser-side calls to /api/papers. Only our own server is called from here:
   OpenAlex and its key stay on the server. */

export type ApiErrorCode = 'signed_out' | 'bad_request' | 'not_found' | 'busy' | 'unavailable' | 'budget' | 'user_limit' | 'network';

export class PapersApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly resetsAt?: string,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { accept: 'application/json' }, cache: 'no-store' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new PapersApiError('network', 'Could not reach Citezeno. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as { error?: string; code?: ApiErrorCode; resetsAt?: string } | null;
  if (!res.ok) {
    throw new PapersApiError(body?.code ?? 'unavailable', body?.error ?? 'Paper search is temporarily unavailable. Please try again shortly.', body?.resetsAt);
  }
  return body as T;
}

/* The related lists a paper has, and the endpoint behind each. */
export type ListKind = 'search' | 'references' | 'cited-by' | 'similar';

export function listUrl(kind: ListKind, params: URLSearchParams, paperId?: string): string {
  const qs = params.toString();
  const path = kind === 'search' ? '/api/papers/search' : `/api/papers/${encodeURIComponent(paperId ?? '')}/${kind}`;
  return qs ? `${path}?${qs}` : path;
}

export const fetchPaperList = (url: string, signal?: AbortSignal) => getJson<PaperList>(url, signal);

export const fetchPaper = (id: string, signal?: AbortSignal) => getJson<Paper>(`/api/papers/${encodeURIComponent(id)}`, signal);
