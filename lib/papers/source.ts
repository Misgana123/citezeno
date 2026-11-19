import type { PaperSources } from '@/lib/providers/papers/sources';
import { paperSources } from '@/lib/providers/papers/sources';
import type { PaperSource } from '@/lib/providers/papers/types';
import { toPapersError } from './errors';

/* Paper sources as Find Papers and Shelf use them: the same sources, with
   provider errors turned into PapersErrors, so every failure reaches the user
   with Find Papers' codes and wording. */

const wrap =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (e) {
      throw toPapersError(e);
    }
  };

export function speakingPapersErrors(s: PaperSource): PaperSource {
  return {
    name: s.name,
    limits: s.limits,
    parseId: (raw) => s.parseId(raw),
    search: wrap((q) => s.search(q)),
    getPaper: wrap((ref) => s.getPaper(ref)),
    ...(s.semanticSearch ? { semanticSearch: wrap(s.semanticSearch.bind(s)) } : {}),
    ...(s.references ? { references: wrap(s.references.bind(s)) } : {}),
    ...(s.citedBy ? { citedBy: wrap(s.citedBy.bind(s)) } : {}),
    ...(s.similar ? { similar: wrap(s.similar.bind(s)) } : {}),
    ...(s.getPapers ? { getPapers: wrap(s.getPapers.bind(s)) } : {}),
  };
}

export const papersFacing = (sources: PaperSources): PaperSources => paperSources(sources.all.map(speakingPapersErrors));
