/* PDF writer. Lays out the document model with Times (one of the PDF base-14
   fonts, so nothing is embedded), measuring text with the browser's
   metric-compatible Times New Roman. Supports italics, bold, superscripts,
   hanging indents, clickable links and page numbers. */
import type { Block, DocModel, DocOptions, Run } from './docmodel';

/* ---------- WinAnsi (cp1252) encoding ---------- */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function winAnsi(ch: string): string {
  const c = ch.codePointAt(0)!;
  if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) return ch;
  if (CP1252[c]) return ch;
  if (c === 0x2010 || c === 0x2011 || c === 0x2212) return '-';
  if (c === 0x202f || c === 0x2009 || c === 0x200a || c === 0x2002 || c === 0x2003) return ' ';
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (base && base !== ch && [...base].every((b) => b.codePointAt(0)! < 0x100)) return base;
  return '?';
}
const clean = (s: string) => [...s].map(winAnsi).join('');

function pdfString(s: string) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const b = CP1252[c] ?? c;
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (b < 0x20 || b > 0x7e) out += '\\' + b.toString(8).padStart(3, '0');
    else out += ch;
  }
  return `(${out})`;
}

function utf16Hex(s: string) {
  let h = 'FEFF';
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${h}>`;
}

/* ---------- measurement ---------- */
type Face = { i?: boolean; b?: boolean };
let ctx2d: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
function width(text: string, face: Face, size: number) {
  const key = `${face.i ? 1 : 0}${face.b ? 1 : 0}|${text}`;
  let w1000 = cache.get(key);
  if (w1000 == null) {
    if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
    if (ctx2d) {
      ctx2d.font = `${face.i ? 'italic ' : ''}${face.b ? 'bold ' : ''}1000px "Times New Roman", Times, "Liberation Serif", "Nimbus Roman", "Tinos", serif`;
      w1000 = ctx2d.measureText(text).width;
    } else w1000 = text.length * 480;
    cache.set(key, w1000);
  }
  return (w1000 * size) / 1000;
}

const fontOf = (f: Face) => (f.b ? (f.i ? 'F4' : 'F3') : f.i ? 'F2' : 'F1');

/* ---------- layout ---------- */
type Seg = { text: string; face: Face; size: number; rise: number; x: number; w: number; href?: string };
type Line = { segs: Seg[] };

function layout(runs: Run[], size: number, maxW: number, firstIndent: number, restIndent: number): Line[] {
  type Piece = { text: string; face: Face; sup?: boolean; href?: string };
  // words are runs of non-space text; a word may mix styles (e.g. italic journal name + comma)
  const words: { pieces: Piece[]; spaceBefore: boolean; spaceFace: Face }[] = [];
  let pendingSpace = false;
  let spaceFace: Face = {};
  runs.forEach((r) => {
    const t = clean(r.noteRef ? String(r.noteRef) : r.text);
    t.split(/( +)/).forEach((part) => {
      if (!part) return;
      if (part.startsWith(' ')) {
        pendingSpace = true;
        spaceFace = { i: r.i, b: r.b };
        return;
      }
      const piece: Piece = { text: part, face: { i: r.i, b: r.b }, sup: r.sup || !!r.noteRef, href: r.href };
      const last = words[words.length - 1];
      if (last && !pendingSpace) last.pieces.push(piece);
      else words.push({ pieces: [piece], spaceBefore: pendingSpace && words.length > 0, spaceFace });
      pendingSpace = false;
    });
  });

  const szOf = (p: Piece) => (p.sup ? size * 0.62 : size);
  const riseOf = (p: Piece) => (p.sup ? size * 0.36 : 0);
  const wOf = (p: Piece) => width(p.text, p.face, szOf(p));

  const lines: Line[] = [];
  let cur: Seg[] = [];
  let x = firstIndent;
  const flush = () => {
    lines.push({ segs: cur });
    cur = [];
    x = restIndent;
  };
  const place = (p: Piece) => {
    const w = wOf(p);
    cur.push({ text: p.text, face: p.face, size: szOf(p), rise: riseOf(p), x, w, href: p.href });
    x += w;
  };

  for (const word of words) {
    const ww = word.pieces.reduce((n, p) => n + wOf(p), 0);
    const sw = word.spaceBefore ? width(' ', word.spaceFace, size) : 0;
    if (cur.length && x + sw + ww > maxW) flush();
    else if (cur.length && sw) {
      cur.push({ text: ' ', face: word.spaceFace, size, rise: 0, x, w: sw });
      x += sw;
    }
    if (x + ww <= maxW || cur.length) {
      word.pieces.forEach(place);
      continue;
    }
    // a single word wider than the line (a long URL): break it, preferring slashes and dots
    for (const p of word.pieces) {
      let text = p.text;
      while (x + width(text, p.face, szOf(p)) > maxW && text.length > 1) {
        let lo = 1;
        let hi = text.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (x + width(text.slice(0, mid), p.face, szOf(p)) <= maxW) lo = mid;
          else hi = mid - 1;
        }
        const soft = Math.max(text.lastIndexOf('/', lo - 1), text.lastIndexOf('.', lo - 1), text.lastIndexOf('-', lo - 1));
        const cut = soft > lo * 0.5 ? soft + 1 : Math.max(1, lo);
        place({ ...p, text: text.slice(0, cut) });
        flush();
        text = text.slice(cut);
      }
      place({ ...p, text });
    }
  }
  if (cur.length) lines.push({ segs: cur });
  return lines;
}

/* ---------- writer ---------- */
async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const s = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  } catch {
    return null;
  }
}
const latin1 = (s: string) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};

export async function buildPdf(model: DocModel, o: DocOptions): Promise<Uint8Array> {
  const [W, H] = o.paper === 'a4' ? [595.28, 841.89] : [612, 792];
  const M = 72;
  const size = o.fontSize;
  const maxW = W - 2 * M;
  const bodyLead = size * 1.18 * o.spacing;
  const pages: { ops: string[]; links: { rect: number[]; uri: string }[] }[] = [];
  let page = { ops: [] as string[], links: [] as { rect: number[]; uri: string }[] };
  let y = H - M;
  const bottom = M + 18;
  const newPage = () => {
    pages.push(page);
    page = { ops: [], links: [] };
    y = H - M;
  };

  const drawLine = (line: Line, baseX: number, baseY: number, align: 'left' | 'center' = 'left') => {
    let shift = 0;
    if (align === 'center' && line.segs.length) {
      const last = line.segs[line.segs.length - 1];
      shift = (maxW - (last.x + last.w)) / 2;
    }
    for (const s of line.segs) {
      if (s.text === ' ' && !s.href) continue;
      const sx = baseX + s.x + shift;
      const sy = baseY + s.rise;
      const color = s.href ? '0.12 0.31 0.47 rg' : '0.07 0.09 0.14 rg';
      page.ops.push(`BT ${color} /${fontOf(s.face)} ${s.size.toFixed(2)} Tf 1 0 0 1 ${sx.toFixed(2)} ${sy.toFixed(2)} Tm ${pdfString(s.text)} Tj ET`);
      if (s.href && /^https?:\/\//.test(s.href)) {
        page.links.push({ rect: [sx, sy - s.size * 0.22, sx + s.w, sy + s.size * 0.8], uri: s.href });
        page.ops.push(`0.12 0.31 0.47 RG 0.4 w ${sx.toFixed(2)} ${(sy - 1.2).toFixed(2)} m ${(sx + s.w).toFixed(2)} ${(sy - 1.2).toFixed(2)} l S`);
      }
    }
  };

  const block = (runs: Run[], opts: { sz: number; lead: number; first: number; rest: number; after: number; align?: 'left' | 'center'; keep?: number; label?: string }) => {
    const lines = layout(runs, opts.sz, maxW, opts.first, opts.rest);
    if (opts.keep && y - opts.lead * opts.keep < bottom) newPage();
    lines.forEach((ln, k) => {
      if (y - opts.lead < bottom) newPage();
      y -= opts.lead;
      if (k === 0 && opts.label) {
        page.ops.push(`BT 0.07 0.09 0.14 rg /F1 ${opts.sz.toFixed(2)} Tf 1 0 0 1 ${M.toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(clean(opts.label))} Tj ET`);
      }
      drawLine(ln, M, y, opts.align);
    });
    y -= opts.after;
  };

  // title block
  if (o.titleBlock && o.title) {
    y -= 10;
    block([{ text: o.title, b: true }], { sz: size + 7, lead: (size + 7) * 1.25, first: 0, rest: 0, after: 6, align: 'center' });
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    block([{ text: [o.author, today].filter(Boolean).join(', ') }], { sz: size - 1, lead: size * 1.3, first: 0, rest: 0, after: size * 2.2, align: 'center' });
  }

  const hang = 36;
  model.blocks.forEach((b: Block) => {
    switch (b.kind) {
      case 'para':
        block(b.runs, { sz: size, lead: bodyLead, first: 36, rest: 0, after: 0 });
        break;
      case 'heading':
        // the reference list starts on a new page, as in a Word manuscript
        if (page.ops.length) newPage();
        else y -= size * 0.4;
        block(b.runs.map((r) => ({ ...r, b: true })), { sz: size + 1, lead: (size + 1) * 1.4, first: 0, rest: 0, after: size * 0.9, align: 'center', keep: 4 });
        break;
      case 'ref':
        block(b.runs, { sz: size, lead: bodyLead, first: b.label ? hang : 0, rest: hang, after: 0, label: b.label, keep: 2 });
        break;
      case 'annot':
        block(b.runs, { sz: size - 1, lead: (size - 1) * 1.2 * o.spacing, first: hang, rest: hang, after: size * 0.9 });
        break;
      case 'note':
        block(b.runs, { sz: size - 2, lead: (size - 2) * 1.3, first: 18, rest: 18, after: 3, label: `${b.n}.` });
        break;
      case 'rule':
        if (y - 20 < bottom) newPage();
        y -= 4;
        page.ops.push(`0.6 0.6 0.6 RG 0.5 w ${M} ${y.toFixed(2)} m ${(M + 144).toFixed(2)} ${y.toFixed(2)} l S`);
        y -= 2;
        break;
    }
  });
  pages.push(page);

  /* ---- serialise ---- */
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    pos += b.length;
  };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = pos;
    if (typeof body === 'string') push(latin1(`${n} 0 obj\n${body}\nendobj\n`));
    else {
      push(latin1(`${n} 0 obj\n`));
      body.forEach(push);
      push(latin1(`\nendobj\n`));
    }
  };

  push(latin1('%PDF-1.4\n%âãÏÓ\n'));
  const FONTS = ['Times-Roman', 'Times-Italic', 'Times-Bold', 'Times-BoldItalic'];
  // 1 catalog, 2 pages, 3-6 fonts, 7 info, then per page: page, content, annots...
  let next = 8;
  const pageNums: number[] = [];
  const pageObjs: { page: number; content: number; annots: number[] }[] = pages.map((p) => {
    const rec = { page: next++, content: next++, annots: p.links.map(() => next++) };
    pageNums.push(rec.page);
    return rec;
  });

  obj(1, `<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`);
  obj(2, `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`);
  FONTS.forEach((f, i) => obj(3 + i, `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  obj(7, `<< /Title ${utf16Hex(o.title || 'Manuscript')} /Author ${utf16Hex(o.author || '')} /Producer (Citezeno) /Creator (Citezeno) >>`);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const rec = pageObjs[i];
    const num = `BT 0.45 0.48 0.55 rg /F1 9 Tf 1 0 0 1 ${(W / 2 - width(String(i + 1), {}, 9) / 2).toFixed(2)} ${(M / 2).toFixed(2)} Tm (${i + 1}) Tj ET`;
    const raw = latin1([...p.ops, num].join('\n'));
    const z = await deflate(raw);
    obj(
      rec.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${rec.content} 0 R${rec.annots.length ? ` /Annots [${rec.annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`,
    );
    const data = z || raw;
    obj(rec.content, [latin1(`<< /Length ${data.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), data, latin1('\nendstream')]);
    p.links.forEach((l, k) => {
      const uri = l.uri.replace(/[()\\]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, (m) => encodeURIComponent(m));
      obj(rec.annots[k], `<< /Type /Annot /Subtype /Link /Rect [${l.rect.map((v) => v.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${uri}) >> >>`);
    });
  }

  const xrefAt = pos;
  let xref = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let n = 1; n < next; n++) xref += `${String(offsets[n] || 0).padStart(10, '0')} 00000 n \n`;
  push(latin1(`${xref}trailer\n<< /Size ${next} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));

  const out = new Uint8Array(pos);
  let p2 = 0;
  for (const c of chunks) {
    out.set(c, p2);
    p2 += c.length;
  }
  return out;
}
