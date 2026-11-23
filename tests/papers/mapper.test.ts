import { describe, expect, it } from 'vitest';
import { rebuildAbstract } from '@/lib/providers/openalex/abstract';
import { paperId, splitPaperId, toDoi, toOrcid } from '@/lib/papers/ids';
import { toWorkId } from '@/lib/providers/openalex/ids';
import { toPaper, toPapers } from '@/lib/providers/openalex/mapper';
import type { OpenAlexWork } from '@/lib/providers/openalex/types';

const WORK: OpenAlexWork = {
  id: 'https://openalex.org/W2741809807',
  doi: 'https://doi.org/10.7717/PEERJ.4375',
  display_name: 'The state of OA',
  publication_year: 2018,
  publication_date: '2018-02-13',
  type: 'article',
  language: 'en',
  cited_by_count: 1694,
  is_retracted: false,
  abstract_inverted_index: { Despite: [0], growing: [1], interest: [2], in: [3, 5], OA: [4], 'research.': [6] },
  authorships: [
    { author: { display_name: 'Heather Piwowar', orcid: 'https://orcid.org/0000-0003-1613-5981' } },
    { author: { display_name: null }, raw_author_name: 'J. Priem' },
    { author: null },
  ],
  primary_location: { landing_page_url: 'https://doi.org/10.7717/peerj.4375', pdf_url: null, source: { display_name: 'PeerJ' } },
  best_oa_location: { pdf_url: 'https://peerj.com/articles/4375.pdf' },
  open_access: { is_oa: true },
  topics: [{ display_name: 'Open Access' }, { display_name: 'Scholarly Publishing' }],
  keywords: [{ display_name: 'open access' }, { display_name: 'Citation advantage' }],
  referenced_works: ['https://openalex.org/W1', 'https://openalex.org/W22', 'not-an-id'],
};

describe('rebuildAbstract', () => {
  it('puts words back at their positions', () => {
    expect(rebuildAbstract(WORK.abstract_inverted_index)).toBe('Despite growing interest in OA in research.');
  });

  it('returns null for missing or empty indexes', () => {
    expect(rebuildAbstract(null)).toBeNull();
    expect(rebuildAbstract(undefined)).toBeNull();
    expect(rebuildAbstract({})).toBeNull();
  });

  it('skips gaps and bad positions', () => {
    expect(rebuildAbstract({ a: [0], c: [4], bad: [-1, 1.5] as number[] })).toBe('a c');
  });
});

describe('ids', () => {
  it('normalizes OpenAlex work IDs', () => {
    expect(toWorkId('https://openalex.org/W123')).toBe('W123');
    expect(toWorkId('w123')).toBe('W123');
    expect(toWorkId('openalex.org/W7')).toBe('W7');
    expect(toWorkId('https://api.openalex.org/works/W8?select=id')).toBe('W8');
    expect(toWorkId('https://example.org/W123')).toBeNull();
    expect(toWorkId('A123')).toBeNull();
    expect(toWorkId('')).toBeNull();
  });

  it('builds and splits Citezeno paper IDs', () => {
    expect(paperId('openalex', 'W1')).toBe('openalex:W1');
    expect(splitPaperId('openalex:W1')).toEqual({ provider: 'openalex', providerId: 'W1' });
    expect(splitPaperId('semantic-scholar:abc123')).toEqual({ provider: 'semantic-scholar', providerId: 'abc123' });
    for (const bad of ['W1', 'p_123', ':W1', 'OpenAlex:W1', 'openalex:', 'a b:c', null]) expect(splitPaperId(bad)).toBeNull();
  });

  it('normalizes DOIs', () => {
    expect(toDoi('https://doi.org/10.1000/ABC')).toBe('10.1000/abc');
    expect(toDoi('doi:10.1000/x')).toBe('10.1000/x');
    expect(toDoi('nope')).toBeNull();
    expect(toDoi(null)).toBeNull();
  });

  it('extracts ORCIDs', () => {
    expect(toOrcid('https://orcid.org/0000-0002-1825-009x')).toBe('0000-0002-1825-009X');
    expect(toOrcid(null)).toBeNull();
  });
});

describe('toPaper', () => {
  it('maps a full OpenAlex work', () => {
    expect(toPaper(WORK)).toEqual({
      id: 'openalex:W2741809807',
      provider: 'openalex',
      record: { label: 'OpenAlex', url: 'https://openalex.org/W2741809807' },
      doi: '10.7717/peerj.4375',
      title: 'The state of OA',
      authors: [
        { name: 'Heather Piwowar', orcid: '0000-0003-1613-5981' },
        { name: 'J. Priem', orcid: null },
      ],
      year: 2018,
      publicationDate: '2018-02-13',
      source: 'PeerJ',
      type: 'article',
      language: 'en',
      abstract: 'Despite growing interest in OA in research.',
      citedByCount: 1694,
      isOpenAccess: true,
      pdfUrl: 'https://peerj.com/articles/4375.pdf',
      license: null,
      landingUrl: 'https://doi.org/10.7717/peerj.4375',
      isRetracted: false,
      topics: ['Open Access', 'Scholarly Publishing', 'Citation advantage'],
      subject: null,
      referenceIds: ['openalex:W1', 'openalex:W22'],
    });
  });

  it('takes the broad subject from the primary topic’s field, when it is one of ours', () => {
    expect(toPaper({ id: 'W9', primary_topic: { field: { display_name: 'Computer Science' } } })?.subject).toBe('Computer Science');
    expect(toPaper({ id: 'W9', primary_topic: { field: { display_name: 'Not a field' } } })?.subject).toBeNull();
  });

  it('fills safe defaults for a sparse record', () => {
    const p = toPaper({ id: 'https://openalex.org/W9' });
    expect(p).toMatchObject({
      id: 'openalex:W9',
      doi: null,
      title: 'Untitled',
      authors: [],
      year: null,
      source: null,
      abstract: null,
      citedByCount: 0,
      isOpenAccess: false,
      pdfUrl: null,
      landingUrl: null,
      isRetracted: false,
      topics: [],
      referenceIds: [],
    });
  });

  it('falls back to the DOI link when there is no landing page', () => {
    expect(toPaper({ id: 'W9', doi: '10.1000/x' })?.landingUrl).toBe('https://doi.org/10.1000/x');
  });

  it('takes the license of the location the PDF link comes from', () => {
    expect(toPaper({ id: 'W9', best_oa_location: { pdf_url: 'https://x/a.pdf', license: 'CC-BY' }, primary_location: { license: 'other-oa' } })?.license).toBe('cc-by');
    expect(toPaper({ id: 'W9', best_oa_location: { landing_page_url: 'https://x' }, primary_location: { pdf_url: 'https://y/a.pdf', license: 'cc0' } })?.license).toBe('cc0');
    expect(toPaper({ id: 'W9', primary_location: { license: 'cc-by' } })?.license).toBeNull();
  });

  it('flags retracted papers', () => {
    expect(toPaper({ id: 'W9', is_retracted: true })?.isRetracted).toBe(true);
  });

  it('drops works without a usable ID', () => {
    expect(toPaper({ display_name: 'x' })).toBeNull();
    expect(toPapers([{ id: 'W1' }, { id: null }, { id: 'W2' }]).map((p) => p.id)).toEqual(['openalex:W1', 'openalex:W2']);
    expect(toPapers(undefined)).toEqual([]);
  });
});
