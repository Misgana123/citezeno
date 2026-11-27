import { doiUrl, paperId, toDoi, toOrcid } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';
import { clean, dateParts, languageFrom3, plain } from '../papers/parse';
import { epmcUrl, toEpmcId } from './ids';
import type { EpmcResult } from './types';

export const PROVIDER = 'europepmc';

function kind(types: string[], source: string | undefined): string {
  const t = types.map((x) => x.toLowerCase());
  if (source === 'PPR' || t.includes('preprint')) return 'preprint';
  if (t.some((x) => x.includes('review'))) return 'review';
  if (t.includes('editorial')) return 'editorial';
  if (t.includes('letter')) return 'letter';
  return 'article';
}

/* One core result → a Paper (null without a usable ID). */
export function toPaper(r: EpmcResult): Paper | null {
  const id = toEpmcId(r.source && r.id ? `${r.source}:${r.id}` : null);
  if (!id) return null;
  const doi = toDoi(r.doi);
  const types = (r.pubTypeList?.pubType ?? []).map((t) => clean(t) ?? '');
  const { year: dateYear, date } = dateParts(r.firstPublicationDate);
  const year = Number(r.pubYear) || dateYear;
  const pdf = r.fullTextUrlList?.fullTextUrl?.find((u) => (u.availabilityCode === 'OA' || u.availabilityCode === 'F') && u.documentStyle === 'pdf')?.url;
  return {
    id: paperId(PROVIDER, id),
    provider: PROVIDER,
    record: { label: 'Europe PMC', url: epmcUrl(id) },
    doi,
    title: plain(r.title)?.replace(/\.$/, '') ?? 'Untitled',
    authors: (r.authorList?.author ?? [])
      .map((a) => {
        const name = clean(a.fullName) ?? clean([a.firstName, a.lastName].filter(Boolean).join(' ')) ?? clean(a.collectiveName);
        return name ? { name, orcid: a.authorId?.type === 'ORCID' ? toOrcid(a.authorId.value) : null } : null;
      })
      .filter((a): a is { name: string; orcid: string | null } => a != null),
    year: year || null,
    publicationDate: date,
    source: clean(r.journalInfo?.journal?.title) ?? clean(r.bookOrReportDetails?.publisher) ?? (r.source === 'PPR' ? 'Preprint' : null),
    type: kind(types, r.source),
    language: languageFrom3(r.language),
    abstract: plain(r.abstractText),
    citedByCount: Math.max(0, Number(r.citedByCount) || 0),
    isOpenAccess: r.isOpenAccess === 'Y',
    pdfUrl: clean(pdf),
    license: clean(r.license)?.toLowerCase() ?? null,
    landingUrl: doi ? doiUrl(doi) : epmcUrl(id),
    isRetracted: types.some((t) => t.toLowerCase() === 'retracted publication'),
    topics: [...new Set([...(r.keywordList?.keyword ?? []), ...(r.meshHeadingList?.meshHeading ?? []).map((m) => m.descriptorName)].map(clean).filter((t): t is string => !!t))],
    subject: 'Medicine', // every record here is biomedical
    referenceIds: [],
  };
}

export const toPapers = (rs: EpmcResult[] | null | undefined): Paper[] => (rs ?? []).map(toPaper).filter((p): p is Paper => p != null);
