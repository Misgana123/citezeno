import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, SHARE_THEMES, isShareMode, isShareTheme } from '@/lib/share-themes';
import { buildShareView } from '@/lib/share-view';
import type { Result, Source } from '@/lib/types';

const oke: Source = {
  id: 'doi:10.1002/qj.49710845502',
  provider: 'OpenAlex',
  providers: ['OpenAlex', 'Crossref'],
  type: 'article',
  title: 'The energetic basis of the urban heat island',
  authors: [{ family: 'Oke', given: 'T. R.' }],
  year: 1982,
  container: 'Quarterly Journal of the Royal Meteorological Society',
  doi: '10.1002/qj.49710845502',
  url: 'https://doi.org/10.1002/qj.49710845502',
  citedBy: 4000,
};
const book: Source = {
  id: 't:climate and the city:2019',
  provider: 'Open Library',
  type: 'book',
  title: 'Climate and the City',
  authors: [
    { family: 'Rivera', given: 'A.' },
    { family: 'Chen', given: 'B.' },
    { family: 'Osei', given: 'C.' },
  ],
  year: 2019,
  publisher: 'Urban Press',
  url: 'https://openlibrary.org/works/OL1W',
  retracted: true,
};

const result: Result = {
  analysis: {
    sentences: [
      { text: 'Cities are often warmer than the countryside around them.', para: 0, index: 0 },
      { text: 'Planners have responded with trees and reflective roofs.', para: 0, index: 1 },
    ],
    paraCount: 1,
    topic: ['cities'],
    wordCount: 18,
  },
  claims: [
    { sid: 0, text: 'Cities are often warmer than the countryside around them.', ids: [oke.id!], cands: [{ id: oke.id!, score: 0.81 }] },
    { sid: 1, text: 'Planners have responded with trees and reflective roofs.', ids: [book.id!], cands: [{ id: book.id!, score: 0.42 }] },
  ],
  db: new Map([
    [oke.id!, oke],
    [book.id!, book],
  ]),
  extra: [],
  requested: 2,
};

describe('share themes', () => {
  it('validates theme and mode ids', () => {
    expect(SHARE_THEMES.map((t) => t.id)).toContain(DEFAULT_THEME);
    expect(isShareTheme('threads')).toBe(true);
    expect(isShareTheme('neon')).toBe(false);
    expect(isShareTheme(undefined)).toBe(false);
    expect(isShareMode('footnotes')).toBe(true);
    expect(isShareMode('toString')).toBe(false);
  });
});

describe('buildShareView', () => {
  const v = buildShareView({ title: 'Urban heat', owner: 'Ada Lovelace', savedAt: Date.UTC(2026, 10, 16), style: 'apa', mode: 'intext', result });

  it('numbers sources in citation order and keeps the data-ref links', () => {
    expect(v.sources.map((s) => s.n)).toEqual([1, 2]);
    expect(v.sources[0].who).toBe('Oke');
    expect(v.sources[1].who).toBe('Rivera et al.');
    expect(v.sources[1].venue).toBe('Urban Press');
    expect(v.docHtml).toContain('data-ref="0"');
    expect(v.refHtml).toContain('class="ref" data-ref=');
  });

  it('separates the manuscript from the reference list', () => {
    expect(v.hasDoc).toBe(true);
    expect(v.bodyHtml).toContain('Cities are often warmer');
    expect(v.bodyHtml).not.toContain('class="ref"');
    expect(v.docHtml).toBe(v.bodyHtml + v.refHtml);
  });

  it('summarises match strength, retractions and databases', () => {
    expect(v.sources[0].score).toBe(0.81);
    expect(v.sources[1].retracted).toBe(true);
    expect(v.stats).toMatchObject({ claims: 2, retracted: 1, years: [1982, 2019] });
    expect(v.stats.providers).toEqual(['OpenAlex', 'Crossref', 'Open Library']);
    expect(v.owner).toBe('Ada');
    expect(v.dateText).toBe('16 November 2026');
    expect(v.bib).toContain('@article');
  });

  it('switches notes styles to footnotes and drops the manuscript for list mode', () => {
    const notes = buildShareView({ title: 't', savedAt: 0, style: 'chicago', mode: 'intext', result });
    expect(notes.effectiveMode).toBe('footnotes');
    expect(notes.modeLabel).toBe('Footnotes');
    expect(notes.bodyHtml).toContain('class="fnotes"');
    const list = buildShareView({ title: 't', savedAt: 'not a date', style: 'apa', mode: 'list', result });
    expect(list.hasDoc).toBe(false);
    expect(list.dateText).toBe('');
  });

  it('falls back to APA for an unknown style', () => {
    expect(buildShareView({ title: 't', savedAt: 0, style: 'nope', mode: 'intext', result }).styleId).toBe('apa');
  });
});
