import { fillGaps, missing } from '@/lib/providers/enrich/fill';
import type { PaperEnricher } from '@/lib/providers/enrich/types';
import type { Paper } from './types';

/* Filling the gaps in papers (a free PDF link, a missing abstract…) with the
   enrichers in PAPER_ENRICHERS, asked in order. Each is only sent the DOIs of
   papers still missing something it can fill, so later ones get fewer. One
   enricher failing (busy, down, out of calls) leaves the rest working. */

export type EnrichResult = { papers: Paper[]; changed: Set<string>; byEnricher: Record<string, number> };

export async function enrichPapers(papers: Paper[], enrichers: PaperEnricher[]): Promise<EnrichResult> {
  const current = new Map(papers.map((p) => [p.id, p]));
  const changed = new Set<string>();
  const byEnricher: Record<string, number> = {};
  for (const e of enrichers) {
    const wanting = [...current.values()].filter((p) => p.doi && e.fills.some((f) => missing(p, f)));
    if (!wanting.length) continue;
    let found: Map<string, Partial<Paper>>;
    try {
      found = await e.lookup(wanting.map((p) => p.doi as string));
    } catch (err) {
      console.warn(`[citezeno] papers: filling details with ${e.name} failed`, (err as Error)?.message ?? err);
      continue;
    }
    let n = 0;
    for (const p of wanting) {
      const patch = found.get((p.doi as string).toLowerCase());
      if (!patch) continue;
      const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => (e.fills as readonly string[]).includes(k)));
      const r = fillGaps(p, allowed);
      if (r.changed.length) {
        current.set(p.id, r.paper);
        changed.add(p.id);
        n++;
      }
    }
    byEnricher[e.name] = n;
  }
  return { papers: papers.map((p) => current.get(p.id) as Paper), changed, byEnricher };
}
