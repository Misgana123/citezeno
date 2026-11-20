import { saveFoundPaper } from '@/lib/shelf/service/save-found';
import { changeItem } from '@/lib/shelf/service/update-item';
import type { ReaderDeps } from '../deps';
import { ReaderError } from '../errors';
import {
  addHighlight,
  addPageNote,
  listHighlights,
  listPageNotes,
  removeHighlight,
  removePageNote,
  updateHighlight,
  updatePageNote,
  type Highlight,
  type HighlightPatch,
  type PageNote,
} from '../store/annotations';
import { loadPaper, type LoadedPaper, type ReaderPaper } from './paper';

/* Highlights and notes: one service for the reader's buttons and the research
   assistant's tools. A paper that isn't on the shelf yet is saved there on the
   user's first highlight or note, so their work is never lost; the answer says
   so (autoSaved), and the reader offers Undo. */

export type AutoSaved = { itemId: string } | null;

async function keepOnShelf(deps: ReaderDeps, userId: string, loaded: LoadedPaper): Promise<AutoSaved> {
  if (loaded.item) return null;
  try {
    const { item } = await saveFoundPaper({ db: deps.db, sources: deps.sources() }, userId, { paperId: loaded.paper.id, via: 'search' });
    // they are reading it
    await changeItem(deps.db, userId, item.id, { readingStatus: 'reading' }).catch(() => {});
    return { itemId: item.id };
  } catch (e) {
    // already there (another tab saved it), or the paper source is down: the note is kept either way
    if ((e as { code?: string })?.code !== 'duplicate') console.warn('[citezeno] reader: could not save the paper to the shelf', (e as Error)?.message);
    return null;
  }
}

export type NewHighlight = Pick<Highlight, 'page' | 'quote' | 'prefix' | 'suffix' | 'rects' | 'color' | 'note' | 'pdfKey'>;

export async function createHighlight(deps: ReaderDeps, userId: string, rawId: string, input: NewHighlight): Promise<{ highlight: Highlight; autoSaved: AutoSaved }> {
  const loaded = await loadPaper(deps, userId, rawId);
  const highlight = await addHighlight(deps.db, userId, { ...input, paperId: loaded.paper.id });
  return { highlight, autoSaved: await keepOnShelf(deps, userId, loaded) };
}

export async function createPageNote(deps: ReaderDeps, userId: string, rawId: string, input: Pick<PageNote, 'page' | 'x' | 'y' | 'text'>): Promise<{ note: PageNote; autoSaved: AutoSaved }> {
  const loaded = await loadPaper(deps, userId, rawId);
  const note = await addPageNote(deps.db, userId, { ...input, paperId: loaded.paper.id });
  return { note, autoSaved: await keepOnShelf(deps, userId, loaded) };
}

export async function annotations(deps: Pick<ReaderDeps, 'db'>, userId: string, paperId: string): Promise<{ highlights: Highlight[]; notes: PageNote[] }> {
  const [highlights, notes] = await Promise.all([listHighlights(deps.db, userId, paperId), listPageNotes(deps.db, userId, paperId)]);
  return { highlights, notes };
}

export async function changeHighlight(deps: Pick<ReaderDeps, 'db'>, userId: string, id: string, patch: HighlightPatch): Promise<Highlight> {
  const h = await updateHighlight(deps.db, userId, id, patch);
  if (!h) throw new ReaderError('not_found', 'That highlight no longer exists.');
  return h;
}

export async function changePageNote(deps: Pick<ReaderDeps, 'db'>, userId: string, id: string, patch: { text?: string; x?: number; y?: number }): Promise<PageNote> {
  const n = await updatePageNote(deps.db, userId, id, patch);
  if (!n) throw new ReaderError('not_found', 'That note no longer exists.');
  return n;
}

export async function dropAnnotation(deps: Pick<ReaderDeps, 'db'>, userId: string, kind: 'highlight' | 'note', id: string): Promise<void> {
  const ok = kind === 'highlight' ? await removeHighlight(deps.db, userId, id) : await removePageNote(deps.db, userId, id);
  if (!ok) throw new ReaderError('not_found', 'That note no longer exists.');
}

/* ---------- export ---------- */

type Entry = { page: number; y: number; kind: 'highlight'; h: Highlight } | { page: number; y: number; kind: 'note'; n: PageNote };

function entries(highlights: Highlight[], notes: PageNote[]): Entry[] {
  return [
    ...highlights.map((h): Entry => ({ page: h.page, y: h.rects[0]?.y ?? 0, kind: 'highlight', h })),
    ...notes.map((n): Entry => ({ page: n.page, y: n.y, kind: 'note', n })),
  ].sort((a, b) => a.page - b.page || a.y - b.y);
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function byline(p: ReaderPaper): string {
  const authors = p.authors.map((a) => a.name);
  const who = authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ');
  return [who, p.year ? `(${p.year})` : null, p.doi ? `https://doi.org/${p.doi}` : null].filter(Boolean).join(' ');
}

/* All highlights and notes for a paper, in page order, each with its page number. */
export function exportAnnotations(paper: ReaderPaper, highlights: Highlight[], notes: PageNote[], format: 'md' | 'txt'): string {
  const list = entries(highlights, notes);
  const out: string[] = [];
  if (format === 'md') {
    out.push(`# Highlights and notes: ${oneLine(paper.title)}`, '');
    const by = byline(paper);
    if (by) out.push(by, '');
    let page = 0;
    for (const e of list) {
      if (e.page !== page) {
        page = e.page;
        out.push(`## Page ${page}`, '');
      }
      if (e.kind === 'highlight') {
        out.push(`> ${oneLine(e.h.quote)}`, '');
        if (e.h.note?.trim()) out.push(`**Note:** ${e.h.note.trim()}`, '');
      } else out.push(`**Page note:** ${e.n.text.trim()}`, '');
    }
    if (!list.length) out.push('_No highlights or notes yet._', '');
  } else {
    out.push(`Highlights and notes: ${oneLine(paper.title)}`);
    const by = byline(paper);
    if (by) out.push(by);
    out.push('');
    for (const e of list) {
      if (e.kind === 'highlight') {
        out.push(`[p. ${e.page}] "${oneLine(e.h.quote)}"`);
        if (e.h.note?.trim()) out.push(`    Note: ${e.h.note.trim()}`);
      } else out.push(`[p. ${e.page}] Page note: ${e.n.text.trim()}`);
      out.push('');
    }
    if (!list.length) out.push('No highlights or notes yet.');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export async function exportFor(deps: ReaderDeps, userId: string, rawId: string, format: 'md' | 'txt'): Promise<{ text: string; fileName: string }> {
  const { paper } = await loadPaper(deps, userId, rawId);
  const { highlights, notes } = await annotations(deps, userId, paper.id);
  const base = oneLine(paper.title).replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'paper';
  return { text: exportAnnotations(paper, highlights, notes, format), fileName: `${base} - notes.${format}` };
}
