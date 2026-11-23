import { paperId } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';
import { clean, dateParts, plain } from '../papers/parse';
import { studyUrl, toNctId } from './ids';
import type { CtStudy } from './types';

export const PROVIDER = 'clinicaltrials';

/* Only the fields we map (keeps answers small). */
export const FIELDS = 'NCTId,BriefTitle,OfficialTitle,BriefSummary,StartDate,OverallStatus,LeadSponsorName,OverallOfficialName,Condition,Keyword,Phase';

const words = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* A study → a Paper: a registered trial, shown with its phase and status. */
export function toPaper(s: CtStudy): Paper | null {
  const p = s.protocolSection;
  const nct = toNctId(p?.identificationModule?.nctId);
  if (!p || !nct) return null;
  const { year, date } = dateParts(p.statusModule?.startDateStruct?.date);
  const phases = (p.designModule?.phases ?? []).filter((x) => x && x !== 'NA').map((x) => words(x).replace('Phase', 'Phase '));
  const status = clean(p.statusModule?.overallStatus);
  const officials = (p.contactsLocationsModule?.overallOfficials ?? []).map((o) => clean(o.name)).filter((n): n is string => !!n);
  const sponsor = clean(p.sponsorCollaboratorsModule?.leadSponsor?.name);
  return {
    id: paperId(PROVIDER, nct),
    provider: PROVIDER,
    record: { label: 'ClinicalTrials.gov', url: studyUrl(nct) },
    doi: null,
    title: plain(p.identificationModule?.briefTitle) ?? plain(p.identificationModule?.officialTitle) ?? nct,
    authors: (officials.length ? officials : sponsor ? [sponsor] : []).map((name) => ({ name, orcid: null })),
    year,
    publicationDate: date,
    source: ['ClinicalTrials.gov', phases.join('/') || null, status ? words(status) : null].filter(Boolean).join(' · '),
    type: 'other',
    language: 'en',
    abstract: plain(p.descriptionModule?.briefSummary),
    citedByCount: 0,
    isOpenAccess: true,
    pdfUrl: null,
    license: null,
    landingUrl: studyUrl(nct),
    isRetracted: false,
    topics: [...new Set([...(p.conditionsModule?.conditions ?? []), ...(p.conditionsModule?.keywords ?? [])].map(clean).filter((t): t is string => !!t))],
    subject: 'Medicine', // every record here is biomedical
    referenceIds: [],
  };
}

export const toPapers = (ss: CtStudy[] | null | undefined): Paper[] => (ss ?? []).map(toPaper).filter((p): p is Paper => p != null);
