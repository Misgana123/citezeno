import { rebuildAbstract } from './abstract';
import { doiUrl, toDoi, toOrcid, toWorkId } from './ids';
import type { OpenAlexWork } from './openalex/types';
import type { Paper } from './types';

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function uniqueNames(items: ({ display_name?: string | null } | null | undefined)[] | null | undefined) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items ?? []) {
    const name = text(item?.display_name);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

/* Convert one OpenAlex work into a Paper. Returns null when the record has no
   usable work ID (nothing else in the app can point at it). */
export function toPaper(work: OpenAlexWork): Paper | null {
  const openalexId = toWorkId(work.id);
  if (!openalexId) return null;
  const doi = toDoi(work.doi);
  const primary = work.primary_location ?? null;
  const best = work.best_oa_location ?? null;
  const year = Number.isInteger(work.publication_year) ? (work.publication_year as number) : null;

  return {
    id: openalexId,
    openalexId,
    doi,
    title: text(work.display_name) ?? text(work.title) ?? 'Untitled',
    authors: (work.authorships ?? [])
      .map((a) => ({ name: text(a?.author?.display_name) ?? text(a?.raw_author_name), orcid: toOrcid(a?.author?.orcid) }))
      .filter((a): a is { name: string; orcid: string | null } => a.name != null),
    year,
    publicationDate: text(work.publication_date),
    source: text(primary?.source?.display_name) ?? text(primary?.raw_source_name),
    type: text(work.type),
    language: text(work.language),
    abstract: rebuildAbstract(work.abstract_inverted_index),
    citedByCount: Math.max(0, Number(work.cited_by_count) || 0),
    isOpenAccess: work.open_access?.is_oa === true,
    pdfUrl: text(best?.pdf_url) ?? text(primary?.pdf_url),
    landingUrl: text(primary?.landing_page_url) ?? (doi ? doiUrl(doi) : null),
    isRetracted: work.is_retracted === true,
    topics: uniqueNames([...(work.topics ?? []), ...(work.keywords ?? [])]),
    referencedWorkIds: (work.referenced_works ?? []).map(toWorkId).filter((id): id is string => id != null),
  };
}

export const toPapers = (works: OpenAlexWork[] | null | undefined): Paper[] =>
  (works ?? []).map(toPaper).filter((p): p is Paper => p != null);
