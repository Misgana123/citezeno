import { doiUrl, paperId, toDoi, toOrcid } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';
import { all, children, clean, first, languageFrom3, parseXml, plain, textOf } from '../papers/parse';
import { pubmedUrl, toPmid } from './ids';

export const PROVIDER = 'pubmed';

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function pubDate(article: Element): { year: number | null; date: string | null } {
  const electronic = first(article, 'ArticleDate');
  const d = electronic ?? first(article, 'PubDate');
  const year = Number(textOf(d, 'Year') ?? textOf(d, 'MedlineDate')?.slice(0, 4));
  if (!Number.isInteger(year) || year < 1000) return { year: null, date: null };
  const rawMonth = textOf(d, 'Month');
  const month = rawMonth ? (MONTHS[rawMonth.slice(0, 3).toLowerCase()] ?? rawMonth.padStart(2, '0')) : null;
  const day = textOf(d, 'Day');
  return { year, date: month && /^\d{2}$/.test(month) ? (day ? `${year}-${month}-${day.padStart(2, '0')}` : `${year}-${month}`) : `${year}` };
}

function kind(types: string[]): string {
  const t = types.map((x) => x.toLowerCase());
  if (t.includes('preprint')) return 'preprint';
  if (t.some((x) => x.includes('review'))) return 'review';
  if (t.includes('editorial')) return 'editorial';
  if (t.includes('letter')) return 'letter';
  if (t.includes('dataset')) return 'dataset';
  return 'article';
}

/* The paper's own IDs: PubmedData's ArticleIdList, not the ones inside its reference list. */
function ownIds(pa: Element): Map<string, string> {
  const ids = new Map<string, string>();
  const list = children(first(pa, 'PubmedData'), 'ArticleIdList')[0];
  for (const id of children(list, 'ArticleId')) {
    const type = id.getAttribute('IdType');
    const value = clean(id.textContent);
    if (type && value && !ids.has(type)) ids.set(type, value);
  }
  return ids;
}

/* One <PubmedArticle> → a Paper (null without a PMID). */
export function toPaper(pa: Element): Paper | null {
  const citation = first(pa, 'MedlineCitation');
  const pmid = toPmid(clean(children(citation, 'PMID')[0]?.textContent));
  if (!pmid) return null;
  const article = first(citation, 'Article');
  const ids = ownIds(pa);
  const doi = toDoi(ids.get('doi')) ?? toDoi(all(article, 'ELocationID').find((e) => e.getAttribute('EIdType') === 'doi')?.textContent);
  const types = all(article, 'PublicationType').map((t) => clean(t.textContent) ?? '');
  const abstract = all(first(article, 'Abstract'), 'AbstractText')
    .map((a) => {
      const body = plain(a.textContent);
      const label = clean(a.getAttribute('Label'));
      return body ? (label ? `${label}: ${body}` : body) : null;
    })
    .filter(Boolean)
    .join(' ');
  const { year, date } = pubDate(article ?? pa);
  return {
    id: paperId(PROVIDER, pmid),
    provider: PROVIDER,
    record: { label: 'PubMed', url: pubmedUrl(pmid) },
    doi,
    title: plain(first(article, 'ArticleTitle')?.textContent) ?? 'Untitled',
    authors: all(first(article, 'AuthorList'), 'Author')
      .map((a) => {
        const name = clean(textOf(a, 'CollectiveName')) ?? clean([textOf(a, 'ForeName'), textOf(a, 'LastName')].filter(Boolean).join(' '));
        const orcid = toOrcid(all(a, 'Identifier').find((i) => i.getAttribute('Source') === 'ORCID')?.textContent);
        return name ? { name, orcid } : null;
      })
      .filter((a): a is { name: string; orcid: string | null } => a != null),
    year,
    publicationDate: date,
    source: clean(textOf(first(article, 'Journal'), 'Title')),
    type: kind(types),
    language: languageFrom3(textOf(article, 'Language')),
    abstract: abstract || null,
    citedByCount: 0,
    isOpenAccess: ids.has('pmc'),
    pdfUrl: null,
    license: null,
    landingUrl: doi ? doiUrl(doi) : pubmedUrl(pmid),
    isRetracted: types.some((t) => t.toLowerCase() === 'retracted publication'),
    topics: [...new Set([...all(citation, 'DescriptorName'), ...all(citation, 'Keyword')].map((n) => clean(n.textContent)).filter((t): t is string => !!t))],
    subject: 'Medicine', // every record here is biomedical
    referenceIds: [
      ...new Set(
        all(first(pa, 'ReferenceList'), 'ArticleId')
          .filter((i) => i.getAttribute('IdType') === 'pubmed')
          .map((i) => toPmid(i.textContent))
          .filter((p): p is string => !!p)
          .map((p) => paperId(PROVIDER, p)),
      ),
    ],
  };
}

/* An efetch answer → its papers, in the order PubMed sent them. */
export const fromFetch = (xml: string): Paper[] =>
  all(parseXml(xml), 'PubmedArticle')
    .map(toPaper)
    .filter((p): p is Paper => p != null);
