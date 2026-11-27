import type { ReaderPaper } from '@/lib/reader/service/paper';
import type { Name, Source, SourceType } from '@/lib/types';

/* A paper's reference in a citation style (APA by default), as plain text,
   using the Citation Studio's own style engine. Loaded only when asked for. */

const TYPES: Record<string, SourceType> = { article: 'article', book: 'book', 'book-chapter': 'chapter', preprint: 'preprint', dataset: 'dataset', dissertation: 'thesis', report: 'report' };

/* "Ada M. Lovelace" → { family: "Lovelace", given: "Ada M." }; one word stays as it is. */
export function splitName(full: string): Name {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { family: full.trim(), literal: true };
  return { family: parts.at(-1)!, given: parts.slice(0, -1).join(' ') };
}

export function toSource(p: Pick<ReaderPaper, 'title' | 'authors' | 'year' | 'source' | 'type' | 'doi' | 'landingUrl' | 'isRetracted'>): Source {
  return {
    provider: 'citezeno',
    type: TYPES[p.type ?? ''] ?? 'article',
    title: p.title,
    authors: p.authors.map((a) => splitName(a.name)),
    year: p.year,
    container: p.source ?? undefined,
    doi: p.doi ?? undefined,
    url: p.doi ? undefined : (p.landingUrl ?? undefined),
    retracted: p.isRetracted || undefined,
  };
}

export async function referenceText(p: Parameters<typeof toSource>[0], style = 'apa'): Promise<string> {
  const { STYLES, plain } = await import('@/lib/styles');
  const s = STYLES[style] ?? STYLES.apa;
  return plain(s.entry(toSource(p)));
}
