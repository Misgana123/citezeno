import type { Paper } from '@/lib/papers/types';
import { resolvePaperId, type PaperSources } from '@/lib/providers/papers/sources';
import type { PaperRef } from '@/lib/providers/papers/types';
import { ShelfError } from '../errors';
import type { ParsedInput } from './parse-input';

/* Turn parsed input into papers to choose from.
   IDs (DOI, PMID, PMCID, a provider's own ID or link) are single lookups: free.
   DOIs, PMIDs and PMCIDs go to the primary source; a provider ID or link to
   the source that recognises it. A title is one search on the primary source,
   which costs and counts toward the user's daily search limit; the caller
   reserves it first (see needsSearch). */

export const TITLE_MATCHES = 5;

export type LookupResult = { via: 'doi' | 'link' | 'title'; papers: Paper[] };

/* Whether this input will run a title search (so a search must be reserved). */
export const needsSearch = (sources: PaperSources, parsed: ParsedInput) =>
  parsed.kind === 'title' || (parsed.kind === 'id' && !parsed.fromLink && !resolvePaperId(sources, parsed.raw));

const notFound = (doi: boolean) =>
  new ShelfError('not_found', doi ? 'We couldn’t find this DOI. You can enter the details by hand.' : 'We couldn’t find this paper. Try its title, or enter the details by hand.');

async function byTitle(sources: PaperSources, title: string): Promise<LookupResult> {
  const { papers } = await sources.primary.search({ text: title, perPage: TITLE_MATCHES });
  return { via: 'title', papers };
}

export async function resolveInput(sources: PaperSources, parsed: ParsedInput): Promise<LookupResult> {
  switch (parsed.kind) {
    case 'empty':
      throw new ShelfError('bad_request', 'Paste a DOI, a link or a title.');
    case 'unreadable_link':
      throw new ShelfError('bad_request', 'We couldn’t read a paper from this link. Try searching by its title, or enter the details by hand.');
    case 'title':
      return byTitle(sources, parsed.title);
    case 'id': {
      const target = resolvePaperId(sources, parsed.raw);
      if (!target) {
        if (parsed.fromLink) return resolveInput(sources, { kind: 'unreadable_link' });
        return byTitle(sources, parsed.raw);
      }
      const { paper } = await target.source.getPaper({ kind: 'id', id: target.id });
      if (!paper) throw notFound(false);
      return { via: parsed.fromLink ? 'link' : 'doi', papers: [paper] };
    }
    default: {
      const ref: PaperRef = parsed.kind === 'doi' ? { kind: 'doi', doi: parsed.doi } : { kind: parsed.kind, id: parsed.id };
      const { paper } = await sources.primary.getPaper(ref);
      if (!paper) throw notFound(parsed.kind === 'doi');
      return { via: parsed.kind === 'doi' && !parsed.fromLink ? 'doi' : 'link', papers: [paper] };
    }
  }
}
