import { z } from 'zod';
import { cleanDoi, parseReferences } from '@/lib/bibimport';
import type { Paper } from '@/lib/papers/types';
import { merge } from '@/lib/sources';
import { duplicateReason, normalizeTitle, titleSimilarity } from '@/lib/shelf/dedupe/similar';
import { ShelfError } from '@/lib/shelf/errors';
import { lookupDois } from '@/lib/shelf/lookup/batch';
import { lookupPaper } from '@/lib/shelf/service/lookup';
import { bibtex, csljson, disambiguate, plain, ris, sortKey, STYLES } from '@/lib/styles';
import type { Source } from '@/lib/types';
import type { AgentContext } from '../context';
import { shelfOf } from '../context';
import { paperBrief } from './format';
import { readText, textSource } from './text-input';
import { defineTool, tally } from './types';

/* Reference files the user brings (BibTeX, RIS, or a pasted reference list):
   cleaned up and merged into one file, or checked against the paper
   database. The same reader and writers as the Studio's import and export. */

export const STYLE_IDS = ['apa', 'mla', 'chicago', 'chicagoad', 'harvard', 'turabian', 'asa', 'ieee', 'vancouver', 'ama', 'acs', 'cse'] as const;
const FILE_FORMATS = ['bibtex', 'ris', 'csl_json'] as const;
export const REFERENCE_FORMATS = [...FILE_FORMATS, ...STYLE_IDS] as const;
type RefFormat = (typeof REFERENCE_FORMATS)[number];

const FILE_OUT: Record<(typeof FILE_FORMATS)[number], { ext: string; mime: string; label: string }> = {
  bibtex: { ext: 'bib', mime: 'application/x-bibtex', label: 'BibTeX' },
  ris: { ext: 'ris', mime: 'application/x-research-info-systems', label: 'RIS' },
  csl_json: { ext: 'json', mime: 'application/json', label: 'CSL-JSON' },
};
const isFileFormat = (f: RefFormat): f is (typeof FILE_FORMATS)[number] => (FILE_FORMATS as readonly string[]).includes(f);
const formatLabel = (f: RefFormat) => (isFileFormat(f) ? FILE_OUT[f].label : STYLES[f].name);

const ENTRIES_MAX = 2000;
const LISTED_MAX = 20;
const PREVIEW_CHARS = 3000;

/* Two references for the same work: same DOI, or a very similar title and the same year (the shelf's rule). */
const sameWork = (a: Source, b: Source) => !!duplicateReason({ title: a.title, year: a.year, doi: a.doi ?? null, sharedId: null }, { title: b.title, year: b.year, doi: b.doi ?? null, sharedId: null });

/* Duplicates merged into the first copy, which keeps every detail either one had. */
export function mergeDuplicates(list: Source[]): { kept: Source[]; merged: Source[] } {
  const kept: Source[] = [];
  const merged: Source[] = [];
  for (const s of list) {
    const at = kept.findIndex((k) => sameWork(k, s));
    if (at < 0) kept.push(s);
    else {
      kept[at] = { ...merge(kept[at], s), id: kept[at].id };
      merged.push(s);
    }
  }
  return { kept, merged };
}

/* The references as a file's text: BibTeX, RIS, CSL-JSON, or a reference list in a citation style. */
export function writeReferences(list: Source[], format: RefFormat): string {
  if (format === 'bibtex') return bibtex(list);
  if (format === 'ris') return ris(list);
  if (format === 'csl_json') return csljson(list);
  const style = STYLES[format];
  const numbered = style.family === 'numeric';
  const ctx = disambiguate(style, list);
  const ordered = numbered ? list : [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const lines = ordered.map((s, k) => `${numbered ? (style.marker === 'bracket' ? `[${k + 1}] ` : `${k + 1}. `) : ''}${plain(style.entry(s, ctx))}`);
  return `${style.listTitle}\n\n${lines.join('\n\n')}\n`;
}

/* What a reference is missing for a full citation. */
function gaps(s: Source): string[] {
  return [...(!s.authors.length ? ['authors'] : []), ...(s.year == null ? ['year'] : []), ...(!s.container && !s.publisher && s.type !== 'web' ? ['journal or publisher'] : [])];
}

const brief = (s: Source) => ({ title: s.title, year: s.year, ...(s.doi ? { doi: s.doi } : {}) });

export const cleanReferences = defineTool({
  name: 'clean_references',
  description: `Clean up reference files the user attached or pasted (BibTeX or RIS): merge several into one, remove duplicates (same DOI, or a very similar title and the same year; details from both copies are kept), and write the result as BibTeX, RIS, CSL-JSON, or a reference list in a citation style (${STYLE_IDS.join(', ')}). Gives a file to download and lists what was merged, what couldn't be read and which entries are missing details. Works on the files as given; it doesn't look anything up.`,
  input: z.object({
    sources: z.array(textSource).min(1).max(10).describe('The reference files or pasted text, in order.'),
    format: z.enum(REFERENCE_FORMATS).describe('bibtex, ris, csl_json, or a citation style for a formatted reference list.'),
    dedupe: z.boolean().optional().describe('Merge duplicates (default true).'),
    filename: z.string().trim().min(1).max(120).optional().describe('The file’s name, without the extension (default "references").'),
  }),
  kind: 'read',
  step: 'make',
  label: (i) => `Cleaning up references as ${formatLabel(i.format)}`,
  done: (i) => ({ did: 'Cleaned up references', about: formatLabel(i.format) }),
  async run(ctx, i) {
    const all: Source[] = [];
    const failed: { file: string; label: string; reason: string }[] = [];
    for (const src of i.sources) {
      const { name, text } = await readText(ctx, src);
      const parsed = parseReferences(text);
      if (parsed.format === 'unknown') throw new ShelfError('bad_request', `"${name}" isn’t BibTeX or RIS. For a pasted list of formatted references, use check_references.`);
      all.push(...parsed.sources);
      failed.push(...parsed.failed.map((f) => ({ file: name, ...f })));
    }
    if (!all.length) throw new ShelfError('bad_request', 'No references could be read from these files.');
    const read = all.slice(0, ENTRIES_MAX).map((s, k) => ({ ...s, id: `r${k + 1}` }));
    const { kept, merged } = i.dedupe === false ? { kept: read, merged: [] } : mergeDuplicates(read);
    const text = writeReferences(kept, i.format);
    const ext = isFileFormat(i.format) ? FILE_OUT[i.format].ext : 'txt';
    const mime = isFileFormat(i.format) ? FILE_OUT[i.format].mime : 'text/plain';
    const name = `${(i.filename ?? 'references').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'references'}.${ext}`;
    const incomplete = kept.map((s) => ({ s, missing: gaps(s) })).filter((x) => x.missing.length);
    return {
      result: {
        fileName: name,
        read: all.length,
        ...(all.length > read.length ? { leftOut: all.length - read.length } : {}),
        kept: kept.length,
        ...(merged.length ? { duplicatesMerged: merged.length, merged: merged.slice(0, LISTED_MAX).map(brief) } : {}),
        ...(failed.length ? { unreadable: failed.length, unreadableEntries: failed.slice(0, LISTED_MAX) } : {}),
        ...(incomplete.length ? { missingDetails: incomplete.length, missingDetailsEntries: incomplete.slice(0, LISTED_MAX).map((x) => ({ ...brief(x.s), missing: x.missing })) } : {}),
        ...(!isFileFormat(i.format) ? { preview: text.slice(0, PREVIEW_CHARS) } : {}),
      },
      display: { file: { name, mime, text }, summary: `${tally(kept.length, 'reference')}${merged.length ? `, ${merged.length} merged` : ''}` },
    };
  },
});

/* ---------- checking references ---------- */

const CHECK_MAX = 100;
const TITLE_SEARCHES_MAX = 10;
const TITLE_MATCH = 0.8;

type Entry = { label: string; title: string | null; year: number | null; doi: string | null; /* a pasted line: matched by whether it holds the found title */ line: string | null };
export type CheckStatus = 'ok' | 'mismatch' | 'doi_not_found' | 'found_by_title' | 'not_found' | 'unchecked';

/* A pasted list of formatted references, numbering stripped: one per paragraph
   when blank lines separate them (so a reference may wrap), else one per line. */
export function referenceLines(text: string): Entry[] {
  return text
    .split(/\r?\n\s*\r?\n/.test(text.trim()) ? /\r?\n\s*\r?\n/ : /\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim().replace(/^(?:\[\d+\]|\d+[.)])\s+/, ''))
    .filter((l) => l.length >= 25 && /\p{L}/u.test(l))
    .map((line) => ({ label: line.slice(0, 80), title: null, year: Number(/\b(1[89]\d\d|20\d\d)\b/.exec(line)?.[1]) || null, doi: cleanDoi(line) ?? null, line }));
}

function entriesOf(text: string): Entry[] {
  const parsed = parseReferences(text);
  if (parsed.format === 'unknown') return referenceLines(text);
  return parsed.sources.map((s) => ({ label: s.title.slice(0, 80), title: s.title, year: s.year, doi: s.doi ?? null, line: null }));
}

/* Does this paper match the reference? Its issues when it doesn't quite. */
export function compare(e: Entry, p: Paper): { matches: boolean; issues: string[] } {
  const issues: string[] = [];
  let matches: boolean;
  if (e.line != null) matches = normalizeTitle(e.line).includes(normalizeTitle(p.title).slice(0, 60));
  else matches = !!e.title && titleSimilarity(e.title, p.title) >= TITLE_MATCH;
  if (!matches) issues.push(`the DOI belongs to “${p.title}”`);
  // the print and online years often differ by one
  if (e.year != null && p.year != null && Math.abs(e.year - p.year) > 1) issues.push(`year is ${e.year}, the paper’s is ${p.year}`);
  if (p.isRetracted) issues.push('retracted');
  return { matches, issues };
}

export const checkReferences = defineTool({
  name: 'check_references',
  description: `Check a reference list against the paper database: a BibTeX or RIS file, or a pasted list of formatted references (one per line). Each DOI is looked up (free) and its title and year compared; retracted papers are flagged. With searchTitles, references without a DOI are also searched by title (at most ${TITLE_SEARCHES_MAX}, each one search toward the daily limit). Checks at most ${CHECK_MAX} references. Report each problem plainly; never fix a reference with details the check didn’t return.`,
  input: z.object({ source: textSource, searchTitles: z.boolean().optional() }),
  kind: 'read',
  step: 'papers',
  label: () => 'Checking references',
  done: () => ({ did: 'Checked references' }),
  async run(ctx, i) {
    const { text } = await readText(ctx, i.source);
    const all = entriesOf(text);
    if (!all.length) throw new ShelfError('bad_request', 'No references could be read from this text.');
    const entries = all.slice(0, CHECK_MAX);
    const found = await lookupDois(ctx.sources().primary, entries.flatMap((e) => (e.doi ? [e.doi] : [])));

    let searches = 0;
    const papers: Paper[] = [];
    const checked: { reference: string; status: CheckStatus; issues?: string[]; paper?: ReturnType<typeof paperBrief> }[] = [];
    for (const e of entries) {
      const hit = e.doi ? found.get(e.doi.toLowerCase()) : undefined;
      if (hit) {
        const { matches, issues } = compare(e, hit);
        papers.push(hit);
        checked.push({ reference: e.label, status: matches && !issues.length ? 'ok' : 'mismatch', ...(issues.length ? { issues } : {}), paper: paperBrief(hit) });
        continue;
      }
      if (i.searchTitles && searches < TITLE_SEARCHES_MAX && (e.title ?? e.line)) {
        searches++;
        const query = (e.title ?? e.line!).slice(0, 300);
        const r = await lookupPaper({ db: ctx.db, sources: ctx.sources(), reserveSearches: ctx.reserveSearches }, shelfOf(ctx), query);
        const best = r.papers.find((p) => compare(e, p).matches);
        if (best) {
          const { issues } = compare(e, best);
          papers.push(best);
          checked.push({ reference: e.label, status: 'found_by_title', issues: [...(e.doi ? [`the DOI ${e.doi} wasn’t found`] : ['no DOI given']), ...issues], paper: paperBrief(best) });
          continue;
        }
        checked.push({ reference: e.label, status: 'not_found', issues: [e.doi ? `the DOI ${e.doi} wasn’t found` : 'no DOI given, and no paper with this title was found'] });
        continue;
      }
      checked.push(e.doi ? { reference: e.label, status: 'doi_not_found', issues: [`the DOI ${e.doi} wasn’t found`] } : { reference: e.label, status: 'unchecked', issues: ['no DOI to check'] });
    }

    const problems = checked.filter((c) => c.status !== 'ok' && c.status !== 'unchecked').length;
    const unchecked = checked.filter((c) => c.status === 'unchecked').length;
    return {
      result: { checked: checked.length, ...(all.length > entries.length ? { leftOut: all.length - entries.length } : {}), problems, ...(unchecked ? { unchecked } : {}), references: checked },
      display: { papers, summary: `${tally(checked.length, 'reference')} checked, ${problems ? tally(problems, 'problem') : 'no problems'}` },
    };
  },
});

export const REFERENCE_TOOLS = [cleanReferences, checkReferences];
