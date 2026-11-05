/* Turns the rendered manuscript HTML into a neutral block model that the
   Word and PDF writers both consume. Runs in the browser (uses DOMParser). */

export type Run = {
  text: string;
  i?: boolean;
  b?: boolean;
  sup?: boolean;
  href?: string;
  /* a footnote reference mark; the number of the note */
  noteRef?: number;
};

export type Block =
  | { kind: 'para'; runs: Run[] }
  | { kind: 'heading'; runs: Run[] }
  | { kind: 'ref'; label?: string; runs: Run[] }
  | { kind: 'annot'; runs: Run[] }
  | { kind: 'note'; n: number; runs: Run[]; foot: boolean }
  | { kind: 'rule' };

export type DocOptions = {
  title: string;
  author: string;
  titleBlock: boolean;
  paper: 'a4' | 'letter';
  fontSize: 11 | 12;
  spacing: 1 | 1.5 | 2;
  contents: 'full' | 'refs';
};

export const DEFAULT_DOC: DocOptions = {
  title: '',
  author: '',
  titleBlock: true,
  paper: 'a4',
  fontSize: 12,
  spacing: 2,
  contents: 'full',
};

export type DocModel = {
  blocks: Block[];
  /* footnote number → runs, for writers that support real footnotes */
  footnotes: Map<number, Run[]>;
};

function inline(node: Node, style: Omit<Run, 'text'>, out: Run[]) {
  node.childNodes.forEach((ch) => {
    if (ch.nodeType === 3) {
      const t = (ch.textContent || '').replace(/\s+/g, ' ');
      if (t) out.push({ ...style, text: t });
      return;
    }
    if (ch.nodeType !== 1) return;
    const el = ch as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const next = { ...style };
    if (tag === 'i' || tag === 'em') next.i = !style.i;
    if (tag === 'b' || tag === 'strong') next.b = true;
    if (tag === 'sup') next.sup = true;
    if (tag === 'a') next.href = el.getAttribute('href') || undefined;
    if (el.classList.contains('rn')) return; // reference numbers are handled as labels
    inline(el, next, out);
  });
}

function runsOf(el: Element, footnoteMode = false): Run[] {
  let src: Element = el;
  if (footnoteMode) {
    // swap each superscript cite for a sentinel, then split runs on it
    src = el.cloneNode(true) as Element;
    src.querySelectorAll('sup.cite').forEach((sup) => {
      sup.replaceWith(src.ownerDocument.createTextNode(`\u0001${(sup.textContent || '').trim()}\u0001`));
    });
  }
  const raw: Run[] = [];
  inline(src, {}, raw);
  const out: Run[] = [];
  raw.forEach((r) => {
    if (!r.text.includes('\u0001')) return out.push(r);
    r.text.split(/\u0001/).forEach((piece, k) => {
      if (k % 2 === 1) out.push({ text: piece, noteRef: parseInt(piece, 10) });
      else if (piece) out.push({ ...r, text: piece });
    });
  });
  if (out.length) {
    out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, '') };
    const l = out.length - 1;
    out[l] = { ...out[l], text: out[l].text.replace(/\s+$/, '') };
  }
  return out.filter((r) => r.text || r.noteRef);
}

export function buildModel(html: string, contents: 'full' | 'refs', realFootnotes: boolean): DocModel {
  const dom = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = dom.getElementById('root')!;
  const blocks: Block[] = [];
  const footnotes = new Map<number, Run[]>();
  let inRefs = false;

  root.childNodes.forEach((node) => {
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const cls = el.classList;
    if (cls.contains('mode-hint') || cls.contains('empty-note')) return;
    if (el.tagName === 'H3') {
      const isNotes = /^notes$/i.test((el.textContent || '').trim());
      if (!isNotes) inRefs = true;
      if (contents === 'refs' && !inRefs) return;
      blocks.push({ kind: 'heading', runs: runsOf(el) });
      return;
    }
    if (contents === 'refs' && !inRefs) return;
    if (cls.contains('fnotes') || cls.contains('endnotes')) {
      const foot = cls.contains('fnotes');
      const notes = [...el.querySelectorAll('.note')].map((n) => {
        const num = parseInt(n.querySelector('.nn')?.textContent || '0', 10);
        const body = n.querySelectorAll('span')[1];
        return { n: num, runs: body ? runsOf(body) : [] };
      });
      if (foot && realFootnotes) {
        notes.forEach((x) => footnotes.set(x.n, x.runs));
        return;
      }
      if (foot) blocks.push({ kind: 'rule' });
      notes.forEach((x) => blocks.push({ kind: 'note', n: x.n, runs: x.runs, foot }));
      return;
    }
    if (el.tagName === 'P') {
      if (cls.contains('ref')) {
        const label = el.querySelector('.rn')?.textContent || undefined;
        blocks.push({ kind: 'ref', label, runs: runsOf(el) });
      } else if (cls.contains('annot')) blocks.push({ kind: 'annot', runs: runsOf(el) });
      else blocks.push({ kind: 'para', runs: runsOf(el, realFootnotes) });
    }
  });
  return { blocks, footnotes };
}

export const plainRuns = (runs: Run[]) => runs.map((r) => r.text).join('');

export function suggestTitle(text: string) {
  const first = (text.trim().split(/(?<=[.!?])\s/)[0] || '').replace(/[.!?]+$/, '');
  const words = first.split(/\s+/).slice(0, 9).join(' ');
  return words || 'Untitled manuscript';
}

export function saveBlob(data: Uint8Array | string, mime: string, filename: string) {
  const blob = new Blob([data as unknown as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'manuscript';
