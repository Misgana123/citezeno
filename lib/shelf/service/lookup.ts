import type { PaperSources } from '@/lib/providers/papers/sources';
import type { Db } from '../db';
import { parseInput } from '../lookup/parse-input';
import { needsSearch, resolveInput, type LookupResult } from '../lookup/resolve';
import { savedMap } from '../store/items';

/* Find a paper from a DOI, a link or a title before saving it. A title search
   counts toward the user's daily search limit (reserved first); ID lookups are
   free. Each match says whether it is already on the shelf. */
export type LookupDeps = { db: Db; sources: PaperSources; reserveSearches(n: number): Promise<void> };

export async function lookupPaper(deps: LookupDeps, userId: string, input: string): Promise<LookupResult & { saved: Record<string, string> }> {
  const parsed = parseInput(input);
  if (needsSearch(deps.sources, parsed)) await deps.reserveSearches(1);
  const result = await resolveInput(deps.sources, parsed);
  const saved = await savedMap(deps.db, userId, result.papers.map((p) => p.id));
  return { ...result, saved };
}
