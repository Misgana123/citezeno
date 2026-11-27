import { inflateSync } from 'node:zlib';

/* A small PDF reader with no dependencies, enough to recognise an uploaded
   paper and index its text: page count, title, DOI (from the metadata, the
   first page's DOI link, an arXiv stamp, or the first page's text), and the
   text of every page in order.

   It reads the PDF's objects (including compressed object streams), walks the
   page tree, inflates Flate-compressed content, and maps glyph codes to letters
   through each font's ToUnicode table. It does not measure glyphs, so spacing
   on unusual layouts can be rough. Scanned PDFs (pictures of pages) have no text. */

import type { PdfText } from '../pdf-text/types';

export type PdfInfo = PdfText;

const MAX_TEXT = 2_000_000;
const MAX_OBJECTS = 200_000;

/* ---------- strings ---------- */

function literalBytes(s: string): number[] {
  const out: number[] = [];
  const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') {
      out.push(s.charCodeAt(i) & 0xff);
      continue;
    }
    const n = s[++i];
    if (n === undefined) break;
    if (n in simple) out.push(simple[n]);
    else if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(s[i + 1] ?? '')) oct += s[++i];
      out.push(parseInt(oct, 8) & 0xff);
    } else if (n === '\r') {
      if (s[i + 1] === '\n') i++;
    } else if (n !== '\n') out.push(n.charCodeAt(0) & 0xff);
  }
  return out;
}

function hexBytes(h: string): number[] {
  const clean = h.replace(/[^0-9a-f]/gi, '');
  const padded = clean.length % 2 ? clean + '0' : clean;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 2) out.push(parseInt(padded.slice(i, i + 2), 16));
  return out;
}

/* Metadata strings: UTF-16BE with a byte-order mark, or PDFDocEncoding (≈ Latin-1). */
function textString(bytes: number[]): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  return Buffer.from(bytes).toString('latin1');
}

const STRING_SRC = String.raw`\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\))*\)|<[0-9a-fA-F\s]*>`;

/* The string value of /Key in a dictionary's text. */
function dictString(dict: string, key: string): string | null {
  const m = dict.match(new RegExp(String.raw`/${key}\s*(${STRING_SRC})`));
  if (!m) return null;
  const v = m[1];
  return textString(v[0] === '(' ? literalBytes(v.slice(1, -1)) : hexBytes(v.slice(1, -1))).trim() || null;
}

/* ---------- objects ---------- */

type Obj = { dict: string; data?: Buffer };

function decodeStream(dict: string, body: Buffer): Buffer | undefined {
  const filter = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] ?? '';
  if (!filter) return body;
  if (!/^(\/FlateDecode|\[\s*\/FlateDecode\s*\])$/.test(filter.trim())) return undefined; // images and rare filters: not text
  try {
    return inflateSync(body);
  } catch {
    try {
      return inflateSync(body, { finishFlush: 2 }); // Z_SYNC_FLUSH: accept a truncated stream
    } catch {
      return undefined;
    }
  }
}

/* The dictionary at the start of an object body (balanced << >>). */
function leadingDict(s: string): string {
  const start = s.indexOf('<<');
  if (start < 0) return s.trim();
  let depth = 0;
  for (let i = start; i < s.length - 1; i++) {
    if (s[i] === '<' && s[i + 1] === '<') {
      depth++;
      i++;
    } else if (s[i] === '>' && s[i + 1] === '>') {
      depth--;
      i++;
      if (depth === 0) return s.slice(start, i + 1);
    } else if (s[i] === '(') {
      // skip strings, which may contain brackets
      let d = 1;
      for (i++; i < s.length && d > 0; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === '(') d++;
        else if (s[i] === ')') d--;
      }
      i--;
    }
  }
  return s.slice(start);
}

function readObjects(raw: Buffer): Map<number, Obj> {
  const latin = raw.toString('latin1');
  const objects = new Map<number, Obj>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) && objects.size < MAX_OBJECTS) {
    const num = Number(m[1]);
    const from = m.index + m[0].length;
    const end = latin.indexOf('endobj', from);
    if (end < 0) break;
    let body = latin.slice(from, end);
    const s = body.search(/\bstream\r?\n/);
    let obj: Obj;
    if (s >= 0) {
      const dict = leadingDict(body.slice(0, s));
      const dataStart = from + s + (body.slice(s).match(/^stream\r?\n/)?.[0].length ?? 7);
      let dataEnd = latin.indexOf('endstream', dataStart);
      if (dataEnd < 0 || dataEnd > end) dataEnd = end;
      obj = { dict, data: decodeStream(dict, raw.subarray(dataStart, dataEnd)) };
      body = dict;
    } else obj = { dict: body.trim() };
    objects.set(num, obj); // later objects (incremental updates) replace earlier ones
    re.lastIndex = end + 6;
  }
  // objects packed inside object streams
  for (const obj of [...objects.values()]) {
    if (!obj.data || !/\/Type\s*\/ObjStm/.test(obj.dict)) continue;
    const n = Number(obj.dict.match(/\/N\s+(\d+)/)?.[1] ?? 0);
    const first = Number(obj.dict.match(/\/First\s+(\d+)/)?.[1] ?? 0);
    const text = obj.data.toString('latin1');
    const nums = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n && i * 2 + 1 < nums.length; i++) {
      const num = nums[i * 2];
      if (objects.has(num) && !objects.get(num)!.dict.includes('/ObjStm')) continue;
      const a = first + nums[i * 2 + 1];
      const b = i + 1 < n ? first + nums[i * 2 + 3] : text.length;
      objects.set(num, { dict: text.slice(a, b).trim() });
    }
  }
  return objects;
}

const refNum = (s: string | undefined) => (s ? Number(s.match(/^\s*(\d+)\s+\d+\s+R/)?.[1] ?? NaN) : NaN);

/* The value of /Key in a dictionary: a nested dictionary, an array, a reference, or a simple value. */
function dictValue(dict: string, key: string): string | null {
  const re = new RegExp(String.raw`/${key}(?![\w.#-])\s*`, 'g');
  let depth = 0;
  for (let m = re.exec(dict); m; m = re.exec(dict)) {
    // only keys of this dictionary, not of one nested inside it
    depth = 0;
    for (let i = 2; i < m.index; i++) {
      if (dict[i] === '<' && dict[i + 1] === '<') (depth++, i++);
      else if (dict[i] === '>' && dict[i + 1] === '>') (depth--, i++);
    }
    if (depth > 0) continue;
    const rest = dict.slice(m.index + m[0].length);
    if (rest.startsWith('<<')) return leadingDict(rest);
    if (rest.startsWith('[')) {
      let d = 0;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '[') d++;
        else if (rest[i] === ']' && --d === 0) return rest.slice(0, i + 1);
      }
      return rest;
    }
    const ref = rest.match(/^\d+\s+\d+\s+R/);
    if (ref) return ref[0];
    return rest.match(/^[^\s/<>[\]()]+|^\/[^\s/<>[\]()]+/)?.[0] ?? null;
  }
  return null;
}

/* ---------- ToUnicode maps ---------- */

type CMap = { one: Map<number, string>; two: Map<number, string> };
const emptyCMap = (): CMap => ({ one: new Map(), two: new Map() });

function utf16(hex: string): string {
  const b = hexBytes(hex);
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return s;
}

function parseCMap(t: string, into: CMap = emptyCMap()): CMap {
  const put = (codeHex: string, value: string) => (codeHex.length <= 2 ? into.one : into.two).set(parseInt(codeHex, 16), value);
  for (const block of t.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) put(m[1], utf16(m[2]));
  }
  for (const block of t.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]+>|\[[^\]]*\])/gi)) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff);
      const width = m[1].length;
      if (m[3].startsWith('[')) {
        [...m[3].matchAll(/<([0-9a-f]+)>/gi)].forEach((x, i) => lo + i <= hi && put((lo + i).toString(16).padStart(width, '0'), utf16(x[1])));
      } else {
        const base = utf16(m[3].slice(1, -1));
        for (let c = lo; c <= hi; c++) put(c.toString(16).padStart(width, '0'), base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo)));
      }
    }
  }
  return into;
}

function decodeShown(bytes: number[], cmap: CMap, hex: boolean): string {
  const twoByte = cmap.two.size > 0 && bytes.length % 2 === 0 && (hex || cmap.one.size === 0 || bytes.some((b, i) => i % 2 === 0 && b === 0));
  if (twoByte) {
    let s = '';
    let known = 0;
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const v = cmap.two.get((bytes[i] << 8) | bytes[i + 1]);
      if (v != null) known++;
      s += v ?? '';
    }
    if (known * 2 >= bytes.length / 2) return s;
  }
  let s = '';
  for (const b of bytes) s += cmap.one.get(b) ?? (b >= 32 && b !== 127 ? String.fromCharCode(b) : b === 9 ? ' ' : '');
  return s;
}

/* ---------- content ---------- */

const TOKEN = new RegExp(String.raw`${STRING_SRC}|\[|\]|\/[^\s/\[\]()<>{}%]+|-?\d*\.?\d+|[A-Za-z'"*]+`, 'g');
const KEEP = new Set(['Tf', 'TL', 'Tc', 'Tw', 'Tz', 'Ts', 'Tr', 'BT', 'cm', 'q', 'Q', 'gs', 'g', 'G', 'rg', 'RG', 'k', 'K', 'cs', 'CS', 'sc', 'scn', 'SC', 'SCN']);

/* Text shown by one content stream. `fonts` maps resource names to their glyph tables. */
function contentText(stream: string, fonts: Map<string, CMap>, fallback: CMap): string {
  if (!/T[Jj*'"]/.test(stream)) return '';
  let out = '';
  let pending = '';
  let inArray = false;
  let cmap = fallback;
  let lastName = '';
  const nums: number[] = [];
  let lineY: number | null = null;
  const br = (newline: boolean) => {
    if (out && !/\s$/.test(out)) out += newline ? '\n' : ' ';
  };
  for (const [t] of stream.matchAll(TOKEN)) {
    if (t === '[') {
      inArray = true;
      pending = '';
    } else if (t === ']') inArray = false;
    else if (t[0] === '(' || t[0] === '<') {
      pending += t[0] === '(' ? decodeShown(literalBytes(t.slice(1, -1)), cmap, false) : decodeShown(hexBytes(t.slice(1, -1)), cmap, true);
    } else if (t[0] === '/') lastName = t.slice(1);
    else if (/^-?\d*\.?\d+$/.test(t)) {
      if (inArray && Number(t) < -180 && pending && !pending.endsWith(' ')) pending += ' ';
      else if (!inArray) {
        nums.push(Number(t));
        if (nums.length > 6) nums.shift();
      }
    } else {
      switch (t) {
        case 'Tf':
          cmap = fonts.get(lastName) ?? fallback;
          break;
        case 'Tj':
        case 'TJ':
          out += pending;
          break;
        case "'":
        case '"':
          br(true);
          out += pending;
          break;
        case 'Td':
        case 'TD':
          br(Math.abs(nums[nums.length - 1] ?? 1) > 0.01);
          break;
        case 'T*':
          br(true);
          break;
        case 'Tm': {
          const y = nums[nums.length - 1];
          br(lineY == null || Math.abs((y ?? 0) - lineY) > 0.5);
          lineY = y ?? null;
          break;
        }
        case 'ET':
          br(true);
          break;
      }
      if (!KEEP.has(t)) nums.length = 0;
      pending = '';
    }
  }
  return out;
}

/* ---------- document ---------- */

const DOI_RE = /^10\.\d{4,9}\/\S+$/;

export function findDoi(text: string): string | null {
  for (const m of text.matchAll(/(?:doi(?:\.org)?\s*[:/]\s*|https?:\/\/(?:dx\.)?doi\.org\/|\b)(10\.\d{4,9}\/[^\s"'<>,;]+)/gi)) {
    const doi = m[1].replace(/[.)\]}]+$/, '');
    if (DOI_RE.test(doi)) return doi.toLowerCase();
  }
  return null;
}

/* arXiv's margin stamp: "arXiv:1706.03762v7 [cs.CL] 2 Aug 2023" → its DOI. */
export function findArxivDoi(text: string): string | null {
  const m = text.match(/arXiv:(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?\s*\[[\w.-]+\]/);
  return m ? `10.48550/arxiv.${m[1].toLowerCase()}` : null;
}

const JUNK_TITLE = /^(untitled|microsoft word|title|document\d*|slide \d+|\S+\.(pdf|docx?|tex|dvi|ps|indd|qxd))\b/i;
const goodTitle = (t: string | null | undefined): string | null => {
  const s = t?.replace(/\s+/g, ' ').trim();
  return s && s.length >= 8 && s.length <= 400 && !JUNK_TITLE.test(s) && /[a-z]/i.test(s) ? s : null;
};

function xmpValue(xmp: string, tag: string): string | null {
  const block = xmp.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!block) return null;
  const li = block[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
  return (li ? li[1] : block[1]).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() || null;
}

/* The first line on page one that reads like a title. */
const NOT_TITLE = /(journal|volume|vol\.|issn|doi|https?:|www\.|copyright|©|licen[cs]e|permission|received|accepted|published|preprint|proceedings|conference|abstract|keywords|university|@|arxiv)/i;
export function titleFromText(firstPage: string): string | null {
  for (const raw of firstPage.slice(0, 4000).split('\n')) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (l.length >= 15 && l.length <= 250 && /^[\p{Lu}\d]/u.test(l) && l.split(' ').length >= 3 && !NOT_TITLE.test(l) && !/[,;]$/.test(l)) return l;
  }
  return null;
}

export function readPdfBasic(bytes: Uint8Array): PdfInfo {
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin = raw.toString('latin1');
  const objects = readObjects(raw);
  const get = (ref: string | null | undefined) => objects.get(refNum(ref ?? undefined));
  const deref = (v: string | null) => (v && /^\d+\s+\d+\s+R$/.test(v) ? (get(v)?.dict ?? null) : v);

  // every ToUnicode table, merged: used when a font can't be told apart
  const merged = emptyCMap();
  const cmapCache = new Map<number, CMap>();
  const cmapOf = (fontDict: string): CMap | null => {
    const ref = dictValue(fontDict, 'ToUnicode');
    const num = refNum(ref ?? undefined);
    if (Number.isNaN(num)) return null;
    if (!cmapCache.has(num)) {
      const data = objects.get(num)?.data;
      cmapCache.set(num, data ? parseCMap(data.toString('latin1')) : emptyCMap());
    }
    return cmapCache.get(num)!;
  };
  for (const o of objects.values()) {
    if (!o.data) continue;
    const t = o.data.toString('latin1');
    if (t.includes('begincmap')) parseCMap(t, merged);
  }

  // the page tree, in order (inherited resources pass down)
  type Page = { dict: string; resources: string | null };
  const pages: Page[] = [];
  const root = get(latin.match(/\/Root\s+(\d+\s+\d+\s+R)/g)?.pop()?.replace('/Root', '').trim());
  const walk = (node: Obj | undefined, inherited: string | null, depth: number) => {
    if (!node || depth > 32 || pages.length > 5000) return;
    const resources = deref(dictValue(node.dict, 'Resources')) ?? inherited;
    const kids = deref(dictValue(node.dict, 'Kids'));
    if (/\/Type\s*\/Pages\b/.test(node.dict) || kids) {
      for (const r of kids?.match(/\d+\s+\d+\s+R/g) ?? []) walk(get(r), resources, depth + 1);
    } else pages.push({ dict: node.dict, resources });
  };
  if (root) walk(get(dictValue(root.dict, 'Pages')), null, 0);

  const pageText = (p: Page): string => {
    const fonts = new Map<string, CMap>();
    const fontDict = deref(dictValue(p.resources ?? '', 'Font')) ?? '';
    for (const m of fontDict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+\s+\d+\s+R)/g)) {
      const f = get(m[2]);
      const cm = f ? cmapOf(f.dict) : null;
      if (cm) fonts.set(m[1], cm);
    }
    const parts: string[] = [];
    // /Contents is one stream, an array of streams, or a reference to such an array
    const value = dictValue(p.dict, 'Contents') ?? '';
    const target = /^\d+\s+\d+\s+R$/.test(value) ? get(value) : undefined;
    const refs = target?.data ? [value] : ((target ? target.dict : value).match(/\d+\s+\d+\s+R/g) ?? []);
    for (const r of refs) {
      const d = get(r)?.data;
      if (d) parts.push(d.toString('latin1'));
    }
    let text = contentText(parts.join('\n'), fonts, merged);
    // form XObjects drawn on the page (stamps, headers)
    const xobjects = deref(dictValue(p.resources ?? '', 'XObject')) ?? '';
    for (const m of xobjects.matchAll(/\/[^\s/<>[\]()]+\s+(\d+\s+\d+\s+R)/g)) {
      const x = get(m[1]);
      if (x?.data && /\/Subtype\s*\/Form/.test(x.dict)) text += `\n${contentText(x.data.toString('latin1'), fonts, merged)}`;
    }
    return text;
  };

  const texts: string[] = [];
  let total = 0;
  if (pages.length) {
    for (const p of pages) {
      if (total >= MAX_TEXT) break;
      const t = pageText(p);
      texts.push(t);
      total += t.length;
    }
  } else {
    // no readable page tree: every content-like stream, in file order
    for (const o of objects.values()) {
      if (!o.data || total >= MAX_TEXT || /\/(Type\s*\/(XRef|ObjStm)|Subtype\s*\/Image)/.test(o.dict)) continue;
      const t = contentText(o.data.toString('latin1'), new Map(), merged);
      if (t.trim()) {
        texts.push(t);
        total += t.length;
      }
    }
  }
  const tidy = (t: string) => t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const firstPage = tidy(texts[0] ?? '');
  const text = tidy(texts.join('\n\n')).slice(0, MAX_TEXT);

  // metadata: XMP, then the Info dictionary
  const xmp = [...objects.values()].map((o) => (o.data && /\/Type\s*\/Metadata/.test(o.dict) ? o.data.toString('utf8') : '')).find((s) => s.includes('rdf:')) ?? '';
  const info = get(latin.match(/\/Info\s+(\d+\s+\d+\s+R)/g)?.pop()?.replace('/Info', '').trim())?.dict ?? '';
  const metaDoi = findDoi([xmpValue(xmp, 'prism:doi'), xmpValue(xmp, 'dc:identifier'), xmpValue(xmp, 'pdfx:doi'), dictString(info, 'doi'), dictString(info, 'Subject')].filter(Boolean).join(' '));

  // the first page's links (publishers link the paper's own DOI there)
  let linkDoi: string | null = null;
  if (pages[0]) {
    const annots = deref(dictValue(pages[0].dict, 'Annots')) ?? '';
    for (const r of annots.match(/\d+\s+\d+\s+R/g) ?? []) {
      const a = get(r)?.dict ?? '';
      const action = deref(dictValue(a, 'A')) ?? '';
      const uri = dictString(action, 'URI') ?? dictString(a, 'URI');
      const doi = uri && /doi\.org\//i.test(uri) ? findDoi(uri) : null;
      if (doi) {
        linkDoi = doi;
        break;
      }
    }
  }

  const doi = metaDoi ?? linkDoi ?? findArxivDoi(firstPage) ?? findDoi(firstPage);
  const title = goodTitle(xmpValue(xmp, 'dc:title')) ?? goodTitle(dictString(info, 'Title')) ?? goodTitle(titleFromText(firstPage));
  return { pageCount: pages.length || null, title, doi, text };
}
