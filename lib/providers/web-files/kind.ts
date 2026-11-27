/* What kind of file a download is, from its first bytes (what the site says it
   is, and the name in its link, only pick between kinds the bytes allow).
   Only kinds the app can use are kept: documents, spreadsheets, slides, data
   and reference files, pictures and archives. A web page is told apart so it
   can be read as a page instead; anything else is refused. */

export type FileKind = { ext: string; mime: string };
export type KindVerdict = FileKind | 'page' | null;

const K = (ext: string, mime: string): FileKind => ({ ext, mime });

/* Office and OpenDocument files are ZIPs inside: the name or the declared type says which. */
const IN_ZIP: Record<string, FileKind> = {
  docx: K('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  xlsx: K('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  pptx: K('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
  odt: K('odt', 'application/vnd.oasis.opendocument.text'),
  ods: K('ods', 'application/vnd.oasis.opendocument.spreadsheet'),
  odp: K('odp', 'application/vnd.oasis.opendocument.presentation'),
  epub: K('epub', 'application/epub+zip'),
};
/* Old Office files share one header. */
const OLE: Record<string, FileKind> = { doc: K('doc', 'application/msword'), xls: K('xls', 'application/vnd.ms-excel'), ppt: K('ppt', 'application/vnd.ms-powerpoint') };
const TEXT: Record<string, FileKind> = {
  csv: K('csv', 'text/csv'),
  tsv: K('tsv', 'text/tab-separated-values'),
  json: K('json', 'application/json'),
  bib: K('bib', 'application/x-bibtex'),
  ris: K('ris', 'application/x-research-info-systems'),
  txt: K('txt', 'text/plain'),
  md: K('md', 'text/markdown'),
  xml: K('xml', 'application/xml'),
  tex: K('tex', 'application/x-tex'),
  yaml: K('yaml', 'application/yaml'),
  yml: K('yml', 'application/yaml'),
};
const TEXT_BY_TYPE: [RegExp, string][] = [
  [/^text\/csv\b/i, 'csv'],
  [/^text\/tab-separated-values\b/i, 'tsv'],
  [/^application\/(.+\+)?json\b/i, 'json'],
  [/^application\/x-bibtex\b/i, 'bib'],
  [/^application\/x-research-info-systems\b/i, 'ris'],
  [/^text\/markdown\b/i, 'md'],
  [/^(application|text)\/xml\b/i, 'xml'],
];

const starts = (b: Uint8Array, ...sig: number[]) => sig.every((x, i) => b[i] === x);
const extOf = (name: string | null) => name?.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
const zipByType = (type: string) => Object.values(IN_ZIP).find((k) => type.toLowerCase().startsWith(k.mime));

export function fileKind(head: Uint8Array, contentType: string, name: string | null): KindVerdict {
  const ext = extOf(name);
  const latin = new TextDecoder('latin1').decode(head.subarray(0, 1024));
  if (latin.includes('%PDF-')) return K('pdf', 'application/pdf');
  if (starts(head, 0x50, 0x4b, 0x03, 0x04) || starts(head, 0x50, 0x4b, 0x05, 0x06)) return IN_ZIP[ext] ?? zipByType(contentType) ?? K('zip', 'application/zip');
  if (starts(head, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return OLE[ext] ?? null;
  if (starts(head, 0x89, 0x50, 0x4e, 0x47)) return K('png', 'image/png');
  if (starts(head, 0xff, 0xd8, 0xff)) return K('jpg', 'image/jpeg');
  if (latin.startsWith('GIF8')) return K('gif', 'image/gif');
  if (latin.startsWith('RIFF') && latin.slice(8, 12) === 'WEBP') return K('webp', 'image/webp');
  if (starts(head, 0x1f, 0x8b)) return K(ext === 'tgz' ? 'tgz' : 'gz', 'application/gzip');

  // text: no NUL bytes, and valid UTF-8 (a multi-byte character cut at the end of the window is fine)
  if (head.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.max(0, head.byteLength - 3)));
  } catch {
    return null;
  }
  const start = text.replace(/^﻿/, '').trimStart().slice(0, 600).toLowerCase();
  const html = /^text\/html\b|^application\/xhtml/i.test(contentType) || /^<!doctype html|^<html[\s>]|^<head[\s>]|^<body[\s>]/.test(start) || (/^<\?xml/.test(start) && start.includes('<html'));
  if (html) return 'page';
  if (TEXT[ext]) return TEXT[ext];
  const byType = TEXT_BY_TYPE.find(([re]) => re.test(contentType));
  return byType ? TEXT[byType[1]] : TEXT.txt;
}

/* The file name a download offers: Content-Disposition's, else the link's last part. */
export function downloadName(contentDisposition: string | null, url: URL): string | null {
  const cd = contentDisposition ?? '';
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/.exec(cd)?.[1];
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(cd)?.[1];
  let name: string | null = null;
  try {
    name = star ? decodeURIComponent(star.trim()) : plain ? plain.trim() : decodeURIComponent(url.pathname.split('/').pop() ?? '');
  } catch {
    name = plain?.trim() ?? null;
  }
  return name?.replace(/[\\/]/g, '').trim() || null;
}

/* The name with the extension its kind has ("data" → "data.csv", "report.php" → "report.pdf"). */
export function nameWithKind(name: string | null, kind: FileKind): string {
  const base = (name ?? '').trim() || 'download';
  const ext = extOf(base);
  if (ext === kind.ext || (kind.ext === 'jpg' && ext === 'jpeg') || (kind.ext === 'gz' && base.toLowerCase().endsWith('.tar.gz'))) return base;
  return `${/\.[a-z0-9]{1,5}$/i.test(base) ? base.replace(/\.[a-z0-9]{1,5}$/i, '') : base}.${kind.ext}`;
}
