/* Looking up the references found by lib/refcheck.ts, from the browser, with the
   existing database clients and their existing timeouts, retries and
   concurrency. Free: no credits are involved. */
import { PROVIDERS, crossrefDOIRecord, openalexDOI, pool } from './sources';
import { looksLikeArticle, verdict, type Notice, type RefEntry, type Verdict } from './refcheck';
import type { ApiSettings, Source } from './types';

/* same number of requests in flight as a trace */
export const CHECK_CONCURRENCY = 5;

/* One reference. Lookups run one after another so CHECK_CONCURRENCY entries means
   at most that many requests at once. */
export async function checkOne(e: RefEntry, settings: ApiSettings): Promise<Verdict> {
  let failed = false;
  const tryIt = async <T>(f: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await f();
    } catch {
      failed = true;
      return undefined;
    }
  };

  if (e.doi) {
    // a direct DOI lookup: OpenAlex for the retracted flag, Crossref for notices
    const oa = await tryIt(() => openalexDOI(e.doi!, settings));
    const cr = await tryIt(() => crossrefDOIRecord(e.doi!, settings));
    const record = cr?.source || oa || null;
    if (record) {
      const notices: Notice[] = cr?.notices || [];
      return verdict(e, { doiRecord: oa && cr ? { ...cr.source, retracted: oa.retracted } : record, notices, retracted: !!oa?.retracted, failed });
    }
    // both said "no such DOI": fall back to the title, if there is one
    if (!e.title) return verdict(e, { failed });
  }
  if (!e.title) {
    return { status: 'error', diffs: [], notices: [], note: 'Couldn’t read a title or DOI in this reference, so it wasn’t looked up.' };
  }

  // a bibliographic search with the title and first author
  const q = [e.title, e.authorsShown[0]].filter(Boolean).join(' ');
  const found: Source[] = [];
  const cr = await tryIt(() => PROVIDERS.crossref.fn(q, { limit: 5, settings }));
  if (cr) found.push(...cr);
  const oa = await tryIt(() => PROVIDERS.openalex.fn(q, { limit: 5, settings }));
  if (oa) found.push(...oa);
  let v = verdict(e, { found, failed });
  if (v.status === 'notfound' || (v.status === 'error' && !found.length)) {
    // books are often only in Open Library; a journal article won't be there
    if (!looksLikeArticle(e.raw)) {
      const ol = await tryIt(() => PROVIDERS.openlibrary.fn(q, { limit: 5, settings }));
      if (ol) found.push(...ol);
    }
    v = verdict(e, { found, failed });
  }
  // OpenAlex's retracted flag on the matched work, whichever database it came from
  const m = v.match;
  if (m && found.some((s) => s.retracted && (s === m || (m.doi && s.doi?.toLowerCase() === m.doi.toLowerCase())))) {
    v = verdict(e, { found, retracted: true, failed });
  }
  return v;
}

export async function checkAll(
  entries: RefEntry[],
  settings: ApiSettings,
  onDone?: (id: number, v: Verdict) => void,
  isCancelled?: () => boolean,
): Promise<Map<number, Verdict>> {
  const out = new Map<number, Verdict>();
  await pool(
    entries.map((e) => async () => {
      if (isCancelled?.()) throw new Error('cancelled');
      const v = await checkOne(e, settings);
      out.set(e.id, v);
      onDone?.(e.id, v);
      return v;
    }),
    CHECK_CONCURRENCY,
  );
  return out;
}
