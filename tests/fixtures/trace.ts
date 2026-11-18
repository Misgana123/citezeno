/* A small two-claim trace shared by the tests. Returns fresh objects each call. */
import type { Result, Source } from '@/lib/types';

export const oke = (): Source => ({
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
});

export const book = (): Source => ({
  id: 't:climate and the city:2019',
  provider: 'Open Library',
  type: 'book',
  title: 'Climate and the City',
  authors: [{ family: 'Rivera', given: 'A.' }],
  year: 2019,
  publisher: 'Urban Press',
});

export const alt = (): Source => ({
  id: 'doi:10.1000/alt.1',
  provider: 'Crossref',
  providers: ['Crossref'],
  type: 'article',
  title: 'Street trees and surface temperature',
  authors: [{ family: 'Zhang', given: 'L.' }],
  year: 2021,
  container: 'Urban Climate',
  doi: '10.1000/alt.1',
});

export function makeResult(): Result {
  const a = oke();
  const b = book();
  const c = alt();
  return {
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
      { sid: 0, text: 'Cities are often warmer than the countryside around them.', ids: [a.id!], cands: [{ id: a.id!, score: 0.81 }, { id: c.id!, score: 0.5 }] },
      { sid: 1, text: 'Planners have responded with trees and reflective roofs.', ids: [b.id!], cands: [{ id: b.id!, score: 0.42 }] },
    ],
    db: new Map([
      [a.id!, a],
      [b.id!, b],
      [c.id!, c],
    ]),
    extra: [],
    requested: 2,
  };
}
