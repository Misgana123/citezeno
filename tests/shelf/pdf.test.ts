import { describe, expect, it, vi } from 'vitest';
import { findArxivDoi, findDoi, readPdfBasic, titleFromText } from '@/lib/shelf/pdf/basic-reader';
import { cleanFileName, looksLikePdf } from '@/lib/shelf/pdf/check';
import { readPdf } from '@/lib/shelf/pdf/reader';
import { cloudinaryStore, parseCloudinaryUrl, signParams } from '@/lib/shelf/storage/cloudinary';
import { paperPdf, scannedPdf } from './pdf-fixtures';

describe('PDF checks', () => {
  it('needs a PDF header and an end marker', () => {
    expect(looksLikePdf(paperPdf())).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('<!DOCTYPE html><html>' + ' '.repeat(100) + '%%EOF'))).toBe(false);
    const cut = paperPdf().subarray(0, 300);
    expect(looksLikePdf(cut)).toBe(false);
  });

  it('cleans file names', () => {
    expect(cleanFileName('C:\\Users\\me\\Smith "2020".PDF')).toBe('Smith 2020 .PDF');
    expect(cleanFileName('notes')).toBe('notes.pdf');
    expect(cleanFileName('')).toBe('paper.pdf');
  });
});

describe('reading PDFs', () => {
  it('reads pages in order, CID text through ToUnicode, and the first-page DOI', () => {
    const info = readPdfBasic(paperPdf());
    expect(info.pageCount).toBe(2);
    expect(info.doi).toBe('10.5555/rivers.2020');
    expect(info.title).toBe('Rivers and floods in a changing climate');
    expect(info.text.indexOf('Rivers and floods')).toBeLessThan(info.text.indexOf('Methods.'));
    expect(info.text).toContain('Results show more floods.');
  });

  it('prefers the metadata title and the first page’s DOI link', () => {
    const info = readPdfBasic(paperPdf({ infoTitle: 'Rivers and Floods: The Final Version', link: 'https://doi.org/10.7777/LINKED.1' }));
    expect(info.title).toBe('Rivers and Floods: The Final Version');
    expect(info.doi).toBe('10.7777/linked.1');
  });

  it('ignores file-name titles in the metadata', () => {
    expect(readPdfBasic(paperPdf({ infoTitle: 'Microsoft Word - draft3.docx' })).title).toBe('Rivers and floods in a changing climate');
  });

  it('marks a scanned PDF as having no text', () => {
    const r = readPdf(scannedPdf());
    expect(r).toMatchObject({ pageCount: 1, hasText: false, doi: null });
    expect(readPdf(paperPdf()).hasText).toBe(false); // too little text to be worth indexing
  });

  it('finds DOIs and arXiv stamps in text', () => {
    expect(findDoi('Published: https://doi.org/10.1038/s41586-020-2649-2.')).toBe('10.1038/s41586-020-2649-2');
    expect(findDoi('DOI: 10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-0')).toBe('10.1002/(sici)1097-4571(199806)49:8');
    expect(findDoi('no doi here 10.12/short')).toBeNull();
    expect(findArxivDoi('arXiv:1706.03762v7 [cs.CL] 2 Aug 2023')).toBe('10.48550/arxiv.1706.03762');
    expect(findArxivDoi('see arXiv:1607.06450, 2016')).toBeNull();
  });

  it('skips licence lines and headers when guessing a title', () => {
    expect(titleFromText('Provided proper attribution is provided, Google hereby grants permission to\nreproduce the tables\nAttention Is All You Need\nAshish Vaswani')).toBe('Attention Is All You Need');
  });
});

describe('Cloudinary', () => {
  const creds = parseCloudinaryUrl('cloudinary://key123:sec%2Fret@demo-cloud')!;

  it('reads CLOUDINARY_URL', () => {
    expect(creds).toEqual({ apiKey: 'key123', apiSecret: 'sec/ret', cloudName: 'demo-cloud' });
    expect(parseCloudinaryUrl('https://nope')).toBeNull();
    expect(parseCloudinaryUrl(undefined)).toBeNull();
  });

  it('signs like Cloudinary’s documented example', () => {
    expect(signParams({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('gives the browser a signed, private upload form without the secret', () => {
    const store = cloudinaryStore(creds, { now: () => 1_700_000_000_000 });
    const t = store.uploadTarget('shelf/u1/f1.pdf');
    expect(t.url).toBe('https://api.cloudinary.com/v1_1/demo-cloud/raw/upload');
    expect(t.fields).toMatchObject({ public_id: 'shelf/u1/f1.pdf', type: 'authenticated', timestamp: '1700000000', api_key: 'key123' });
    expect(t.fields.signature).toBe(signParams({ public_id: 'shelf/u1/f1.pdf', type: 'authenticated', timestamp: 1700000000 }, 'sec/ret'));
    expect(JSON.stringify(t)).not.toContain('sec/ret');
  });

  it('makes download links that expire', () => {
    const store = cloudinaryStore(creds, { now: () => 1_700_000_000_000 });
    const url = new URL(store.downloadUrl('shelf/u1/f1.pdf', { ttlS: 300, fileName: 'a.pdf' }));
    expect(url.pathname).toBe('/v1_1/demo-cloud/raw/download');
    expect(url.searchParams.get('expires_at')).toBe('1700000300');
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(url.searchParams.get('signature')).toHaveLength(40);
  });

  it('reads files with a size cap and deletes them', async () => {
    const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/destroy')) return Response.json({ result: (init?.body as URLSearchParams).get('public_id') === 'gone' ? 'not found' : 'ok' });
      if (u.includes('missing')) return new Response('', { status: 404 });
      return new Response(new Uint8Array(10), { headers: { 'content-length': '10' } });
    }) as unknown as typeof globalThis.fetch;
    const store = cloudinaryStore(creds, { fetch });
    expect((await store.read('ok', 100))?.byteLength).toBe(10);
    expect(await store.read('ok', 5)).toBeNull();
    expect(await store.read('missing', 100)).toBeNull();
    await expect(store.remove('x')).resolves.toBeUndefined();
    await expect(store.remove('gone')).resolves.toBeUndefined();
  });
});
