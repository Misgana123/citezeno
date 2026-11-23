import { paperId, toDoi } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';
import { all, clean, dateParts, first, parseXml, plain, textOf } from '../papers/parse';
import { absUrl, arxivDoi, toArxivId } from './ids';

export const PROVIDER = 'arxiv';

/* One Atom <entry> → a Paper; null for arXiv's error entries (no usable ID). */
export function toPaper(entry: Element): Paper | null {
  const id = toArxivId(textOf(entry, 'id'));
  if (!id) return null;
  const { year, date } = dateParts(textOf(entry, 'published'));
  const journalDoi = toDoi(textOf(entry, 'arxiv:doi'));
  const pdf = all(entry, 'link').find((l) => l.getAttribute('title') === 'pdf')?.getAttribute('href');
  return {
    id: paperId(PROVIDER, id),
    provider: PROVIDER,
    record: { label: 'arXiv', url: absUrl(id) },
    doi: journalDoi ?? arxivDoi(id),
    title: plain(textOf(entry, 'title')) ?? 'Untitled',
    authors: all(entry, 'author')
      .map((a) => clean(first(a, 'name')?.textContent))
      .filter((n): n is string => !!n)
      .map((name) => ({ name, orcid: null })),
    year,
    publicationDate: date,
    source: clean(textOf(entry, 'arxiv:journal_ref')) ?? 'arXiv',
    type: 'preprint',
    language: 'en',
    abstract: plain(textOf(entry, 'summary')),
    citedByCount: 0,
    isOpenAccess: true,
    pdfUrl: pdf ? pdf.replace(/^http:/, 'https:') : `https://arxiv.org/pdf/${id}`,
    license: null,
    landingUrl: absUrl(id),
    isRetracted: false,
    topics: all(entry, 'category')
      .map((c) => clean(c.getAttribute('term')))
      .filter((t): t is string => !!t),
    referenceIds: [],
  };
}

/* An Atom feed → its papers and the total match count. */
export function fromFeed(xml: string): { papers: Paper[]; total: number } {
  const doc = parseXml(xml);
  const papers = all(doc, 'entry')
    .map(toPaper)
    .filter((p): p is Paper => p != null);
  const total = Number(textOf(doc, 'opensearch:totalResults'));
  return { papers, total: Number.isFinite(total) ? total : papers.length };
}
