import { paperSources, type LocalPaperSearch, type PaperSources } from '@/lib/providers/papers/sources';
import type { PaperRef, PaperSource } from '@/lib/providers/papers/types';
import { paperId } from '../ids';
import type { Paper } from '../types';
import type { PaperCopyStore, StoredPaper } from './types';

/* Paper sources with our own copy of papers in front:
   - every paper a source returns is kept (merged by DOI), so the copy fills up
     with what our users actually look at;
   - a single paper (or a batch, by ID or DOI) we hold with full details and
     fetched recently enough is answered from the copy, free, without calling
     the provider.
   The copy only helps: when it fails or doesn't have a paper, the source is
   asked as before. Only the source's own records are served from it, so a
   paper's ID never changes under a feature. */

export type LocalCopyOptions = { freshMs: number; now?: () => number; searchFirst?: { minResults: number } };

function quietly<T>(what: string, p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((e) => {
    console.warn(`[citezeno] papers: local copy ${what} failed`, (e as Error)?.message ?? e);
    return fallback;
  });
}

export function rememberingSource(s: PaperSource, store: PaperCopyStore, opts: LocalCopyOptions): PaperSource {
  const now = opts.now ?? Date.now;
  const usable = (hit: StoredPaper | undefined): hit is StoredPaper => !!hit && hit.detail && hit.paper.provider === s.name && now() - hit.fetchedAt < opts.freshMs;
  const remember = (papers: Paper[], detail: boolean) => (papers.length ? quietly('save', store.save(papers, { detail, origin: 'live' }), undefined) : Promise.resolve());
  const served = (papers: Paper[]) => (papers.length ? quietly('touch', store.touch(papers.map((p) => p.id)), undefined) : Promise.resolve());

  /* A list call: pass it on, keep what came back (result cards). */
  const cards =
    <A extends unknown[], R extends { papers: Paper[] }>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const r = await fn(...args);
      await remember(r.papers, false);
      return r;
    };

  async function local(kind: 'id' | 'doi', values: string[]): Promise<Map<string, Paper>> {
    const out = new Map<string, Paper>();
    if (kind === 'id') {
      const found = await quietly('lookup', store.byIds(values.map((v) => paperId(s.name, v))), new Map<string, StoredPaper>());
      for (const v of values) {
        const hit = found.get(paperId(s.name, v));
        if (usable(hit) && hit.paper.id === paperId(s.name, v)) out.set(v, hit.paper);
      }
    } else {
      const found = await quietly('lookup', store.byDois(values), new Map<string, StoredPaper>());
      for (const v of values) {
        const hit = found.get(v.toLowerCase());
        if (usable(hit)) out.set(v.toLowerCase(), hit.paper);
      }
    }
    return out;
  }

  async function getPaper(ref: PaperRef) {
    if (ref.kind === 'id' || ref.kind === 'doi') {
      const value = ref.kind === 'id' ? ref.id : ref.doi;
      const hit = (await local(ref.kind, [value])).get(ref.kind === 'doi' ? value.toLowerCase() : value);
      if (hit) {
        await served([hit]);
        return { paper: hit, costUsd: 0 };
      }
    }
    const r = await s.getPaper(ref);
    if (r.paper) await remember([r.paper], true);
    return r;
  }

  const getPapers = s.getPapers
    ? async (kind: 'id' | 'doi', values: string[]) => {
        const found = await local(kind, values);
        await served([...found.values()]);
        const key = (v: string) => (kind === 'doi' ? v.toLowerCase() : v);
        const missing = [...new Set(values.filter((v) => !found.has(key(v))))];
        if (!missing.length) return { found, costUsd: 0 };
        const live = await s.getPapers!(kind, missing);
        await remember([...live.found.values()], true);
        for (const [k, p] of live.found) found.set(k, p);
        return { found, costUsd: live.costUsd };
      }
    : undefined;

  return {
    name: s.name,
    limits: s.limits,
    parseId: (raw) => s.parseId(raw),
    search: cards((q) => s.search(q)),
    getPaper,
    ...(s.semanticSearch ? { semanticSearch: cards(s.semanticSearch.bind(s)) } : {}),
    ...(s.references ? { references: cards(s.references.bind(s)) } : {}),
    ...(s.citedBy ? { citedBy: cards(s.citedBy.bind(s)) } : {}),
    ...(s.similar ? { similar: cards(s.similar.bind(s)) } : {}),
    ...(getPapers ? { getPapers } : {}),
    // browsing a provider's listing (Explore's fallback) isn't a user seeing papers: passed straight on
    ...(s.browse ? { browse: s.browse.bind(s) } : {}),
  };
}

/* The copy as a search in front of the sources (keyword only); what it serves counts as seen. */
export function localSearch(store: PaperCopyStore, minResults: number): LocalPaperSearch {
  return {
    minResults,
    async search(q) {
      const page = await store.search(q);
      if (page.total >= minResults && page.papers.length) await quietly('touch', store.touch(page.papers.map((p) => p.id)), undefined);
      return page;
    },
  };
}

export const withLocalCopy = (sources: PaperSources, store: PaperCopyStore, opts: LocalCopyOptions): PaperSources =>
  paperSources(
    sources.all.map((s) => rememberingSource(s, store, opts)),
    opts.searchFirst ? localSearch(store, opts.searchFirst.minResults) : null,
  );
