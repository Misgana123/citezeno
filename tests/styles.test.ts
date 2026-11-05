import { describe, expect, it } from 'vitest';
import { STYLES, bibtex, specimen } from '@/lib/styles';
import type { Source } from '@/lib/types';

const article: Source = {
  id: 'doi:10.1038/nature21056',
  provider: 'OpenAlex',
  type: 'article',
  title: 'Dermatologist-level classification of skin cancer with deep neural networks',
  authors: [
    { family: 'Esteva', given: 'Andre' },
    { family: 'Kuprel', given: 'Brett' },
  ],
  year: 2017,
  container: 'Nature',
  volume: '542',
  issue: '7639',
  pages: '115–118',
  doi: '10.1038/nature21056',
  url: 'https://doi.org/10.1038/nature21056',
};

describe('citation styles', () => {
  it('formats APA 7 with authors, year, journal and DOI', () => {
    const { entry, inText } = specimen('apa', article);
    expect(entry).toContain('Esteva, A.');
    expect(entry).toContain('(2017)');
    expect(entry).toContain('<i>Nature</i>, <i>542</i>(7639), 115–118');
    expect(entry).toContain('https://doi.org/10.1038/nature21056');
    expect(inText).toContain('Esteva');
    expect(inText).toContain('2017');
  });
  it('renders every style without throwing', () => {
    for (const id of Object.keys(STYLES)) {
      const { entry } = specimen(id, article);
      expect(entry.length, id).toBeGreaterThan(40);
    }
  });
  it('escapes HTML in titles', () => {
    const { entry } = specimen('apa', { ...article, title: '<script>alert(1)</script>' });
    expect(entry).not.toContain('<script>');
  });
  it('exports BibTeX', () => {
    const bib = bibtex([article]);
    expect(bib).toMatch(/@article\{esteva2017\w+,/);
    expect(bib).toContain('doi');
  });
});
