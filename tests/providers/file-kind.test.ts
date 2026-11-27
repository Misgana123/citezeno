import { describe, expect, it } from 'vitest';
import { downloadName, fileKind, nameWithKind } from '@/lib/providers/web-files/kind';

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const ext = (v: ReturnType<typeof fileKind>) => (v && v !== 'page' ? v.ext : v);

describe('the kind of a downloaded file', () => {
  it('trusts the bytes, using the name or declared type only to pick between kinds the bytes allow', () => {
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0);
    expect(ext(fileKind(zip, '', 'a.docx'))).toBe('docx');
    expect(ext(fileKind(zip, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'download'))).toBe('pptx');
    expect(ext(fileKind(zip, '', 'a.csv'))).toBe('zip');
    expect(ext(fileKind(text('%PDF-1.7'), 'text/html', 'a.html'))).toBe('pdf');
    expect(ext(fileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d), '', null))).toBe('png');
    expect(ext(fileKind(bytes(0xff, 0xd8, 0xff, 0xe0), '', null))).toBe('jpg');
    expect(ext(fileKind(text('RIFF\0\0\0\0WEBPVP8 '), '', null))).toBe('webp');
    expect(ext(fileKind(bytes(0x1f, 0x8b, 8), '', 'data.tar.gz'))).toBe('gz');
    expect(ext(fileKind(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), '', 'old.xls'))).toBe('xls');
    expect(ext(fileKind(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), '', 'thing.msi'))).toBe(null);
  });

  it('reads text files by name or declared type, and spots web pages', () => {
    expect(ext(fileKind(text('a,b\n1,2'), 'text/plain', 'x.csv'))).toBe('csv');
    expect(ext(fileKind(text('{"a":1}'), 'application/json; charset=utf-8', 'download'))).toBe('json');
    expect(ext(fileKind(text('TY  - JOUR'), 'application/x-research-info-systems', null))).toBe('ris');
    expect(ext(fileKind(text('just words'), '', null))).toBe('txt');
    expect(fileKind(text('  <!DOCTYPE html><html>'), 'application/octet-stream', 'data.csv')).toBe('page');
    expect(fileKind(text('a,b'), 'text/html; charset=utf-8', 'data.csv')).toBe('page');
    expect(fileKind(bytes(0x4d, 0x5a, 0x90, 0x00), '', 'setup.exe')).toBeNull();
    expect(fileKind(bytes(0xc3, 0x28, 0x41, 0x41, 0x41, 0x41), '', null)).toBeNull(); // not UTF-8
  });

  it('names the file from the site, with its kind’s extension', () => {
    expect(downloadName('attachment; filename="a b.csv"', new URL('https://x.example/get'))).toBe('a b.csv');
    expect(downloadName("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf", new URL('https://x.example/get'))).toBe('résumé.pdf');
    expect(downloadName(null, new URL('https://x.example/files/data%202024.zip?dl=1'))).toBe('data 2024.zip');
    expect(downloadName(null, new URL('https://x.example/'))).toBeNull();
    const csv = { ext: 'csv', mime: 'text/csv' };
    expect(nameWithKind('data', csv)).toBe('data.csv');
    expect(nameWithKind('export.php', csv)).toBe('export.csv');
    expect(nameWithKind(null, csv)).toBe('download.csv');
    expect(nameWithKind('photo.jpeg', { ext: 'jpg', mime: 'image/jpeg' })).toBe('photo.jpeg');
    expect(nameWithKind('data.tar.gz', { ext: 'gz', mime: 'application/gzip' })).toBe('data.tar.gz');
  });
});
