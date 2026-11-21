'use client';

import { useEffect, useState } from 'react';
import { ReaderApiError, readerFetch, readerUrl, type ReaderData, type ReaderTextState } from '../../reader/api';

/* A paper as the reader opens it (its PDF link, text state, shelf state and
   last page), for the file panel: loaded once, checked on while its text is
   being prepared, and the page the user stops on remembered. */
export function useReaderData(paperId: string, page: number | null, pageCount: number | null) {
  const [data, setData] = useState<ReaderData | null>(null);
  const [error, setError] = useState<ReaderApiError | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    readerFetch<ReaderData>(readerUrl(paperId), { signal: ctl.signal })
      .then(setData)
      .catch((e) => (e as Error)?.name !== 'AbortError' && setError(e as ReaderApiError));
    return () => ctl.abort();
  }, [paperId, reload]);

  const preparing = data?.text != null && (data.text.status === 'pending' || data.text.status === 'processing');
  useEffect(() => {
    if (!preparing) return;
    const t = setInterval(async () => {
      try {
        const r = await readerFetch<{ text: ReaderTextState | null }>(readerUrl(paperId, '/status'));
        setData((d) => (d ? { ...d, text: r.text } : d));
      } catch {
        /* try again next time */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [preparing, paperId]);

  useEffect(() => {
    if (!data || page == null || pageCount == null) return;
    const t = setTimeout(() => {
      readerFetch(readerUrl(paperId, '/position'), { method: 'PATCH', body: { page, pageCount } }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [page, pageCount, data, paperId]);

  return { data, setData, error, retry: () => setReload((n) => n + 1) };
}
