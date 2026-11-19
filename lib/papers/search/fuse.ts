import type { Paper } from '../types';

/* Reciprocal Rank Fusion: each paper scores Σ 1 / (k + rank) over the lists it
   appears in, so papers ranked well in both lists rise to the top.
   Duplicates are matched by paper ID first, then by DOI (which also matches
   one paper found through two providers). */

export const RRF_K = 60;

export function fuseRanked(lists: Paper[][], k = RRF_K): Paper[] {
  const entries: { paper: Paper; score: number; first: number }[] = [];
  const byId = new Map<string, number>();
  const byDoi = new Map<string, number>();
  let seen = 0;

  for (const list of lists) {
    list.forEach((paper, rank) => {
      const score = 1 / (k + rank + 1);
      const at = byId.get(paper.id) ?? (paper.doi ? byDoi.get(paper.doi) : undefined);
      if (at != null) {
        const e = entries[at];
        e.score += score;
        // keep the richer record (one with an abstract wins)
        if (!e.paper.abstract && paper.abstract) e.paper = paper;
        byId.set(paper.id, at);
        if (paper.doi) byDoi.set(paper.doi, at);
        return;
      }
      const index = entries.push({ paper, score, first: seen++ }) - 1;
      byId.set(paper.id, index);
      if (paper.doi) byDoi.set(paper.doi, index);
    });
  }

  return entries.sort((a, b) => b.score - a.score || a.first - b.first).map((e) => e.paper);
}
