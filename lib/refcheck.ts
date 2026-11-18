/* "Check existing citations": find the references already in a draft and judge
   how well each one matches a real record. Pure functions; the lookups that
   feed them live in lib/refcheck-run.ts. */
import { wordOverlap } from './reattach';
import type { Source } from './types';

export type RefEntry = {
  id: number;
  raw: string;
  /* where it sits in the draft */
  start: number;
  end: number;
  /* in the reference list (true) or a bare DOI in the text (false) */
  inList: boolean;
  /* its number in a numbered list ([3] or 3.) */
  number?: number;
  doi?: string;
  title?: string;
  year?: number;
  /* family names, lower-case, accents removed, in order */
  authors: string[];
  /* family names as written, for messages */
  authorsShown: string[];
};

export type InText = {
  raw: string;
  start: number;
  end: number;
  kind: 'author-year' | 'numeric';
  authors?: string[];
  year?: number;
  numbers?: number[];
  /* ids of the reference entries it points to; empty = no matching entry */
  entries: number[];
};

export type Detected = {
  entries: RefEntry[];
  intext: InText[];
  /* where the reference list starts (-1 when there is none) */
  listStart: number;
  /* in-text citations that match no entry */
  orphans: InText[];
  /* reference-list entries no in-text citation points to */
  uncited: RefEntry[];
};

export type Status = 'verified' | 'partial' | 'notfound' | 'retracted' | 'corrected' | 'error';
export type Notice = { kind: 'retraction' | 'correction' | 'concern'; label: string; doi?: string };
export type Verdict = {
  status: Status;
  /* the record it was compared with */
  match?: Source;
  /* what differs, in plain words ("year is 2019, not 2020") */
  diffs: string[];
  notices: Notice[];
  /* for errors and "not found": why */
  note?: string;
};

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .trim();

const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>]+/g;
const trimDoi = (d: string) => d.replace(/[.,;:)\]}>]+$/, '');
const YEAR_RE = /\b(1[5-9]\d\d|20\d\d)[a-z]?\b/;
const HEADING_RE = /^[ \t]*(?:#{1,6}[ \t]*)?(references|reference list|bibliography|works cited|sources|literature cited|cited works|citations)[ \t]*:?[ \t]*$/gim;

/* Family names from an author string: "Smith, J., & Lee, K." · "J. Smith and K. Lee" · "Smith J, Lee K" */
export function familyNames(s: string): string[] {
  const clean = s
    .replace(/\bet al\.?/gi, '')
    .replace(/\b(eds?|editors?|trans)\.?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:\s]+$/, '');
  if (!clean) return [];
  const isInitials = (w: string) => /^(?:\p{Lu}\.?-?){1,3}$/u.test(w) || /^(?:\p{Lu}\.\s?)+$/u.test(w);
  // one name with no separators and no initials: "World Health Organization", "Rita Felski"
  if (!/[,;&]|\band\b/i.test(clean) && clean.split(/\s+/).length >= 2 && !clean.split(/\s+/).some(isInitials)) return [clean];
  // "Smith, J., & Lee, K." → pairs of family, initials
  const parts = clean.split(/\s*(?:;|&|\band\b|,)\s*/i).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/).filter(Boolean);
    const named = words.filter((w) => !isInitials(w) && /\p{L}{2,}/u.test(w));
    if (!named.length) continue;
    // "J. Smith" → Smith; "Smith J" → Smith; "van der Berg" → van der Berg
    const lastIsInitials = words.length > 1 && isInitials(words[words.length - 1]);
    const firstIsInitials = words.length > 1 && isInitials(words[0]);
    let fam: string;
    if (lastIsInitials) fam = words.slice(0, -1).filter((w) => !isInitials(w)).join(' ');
    else if (firstIsInitials) fam = words.filter((w) => !isInitials(w)).join(' ');
    else fam = named.length > 1 && !/^(van|von|de|der|del|da|di|du|la|le)$/i.test(named[named.length - 2]) ? named[named.length - 1] : named.join(' ');
    if (fam) out.push(fam.replace(/[.,]+$/, ''));
  }
  return out;
}

/* Pull title, authors, year and DOI out of one reference-list entry, whatever the style. */
export function parseEntry(raw: string): Pick<RefEntry, 'number' | 'doi' | 'title' | 'year' | 'authors' | 'authorsShown'> {
  let t = raw.replace(/\s+/g, ' ').trim();
  let number: number | undefined;
  const num = /^(?:\[(\d{1,3})\]|(\d{1,3})[.)])\s+/.exec(t);
  if (num) {
    number = Number(num[1] || num[2]);
    t = t.slice(num[0].length);
  }
  const doiM = t.match(DOI_RE);
  const doi = doiM ? trimDoi(doiM[0]) : undefined;
  const body = t.replace(/https?:\/\/\S+/g, ' ').replace(DOI_RE, ' ').replace(/\bdoi:\s*/gi, ' ');

  let title: string | undefined;
  let authorPart = '';
  let year: number | undefined;

  const paren = /\((1[5-9]\d\d|20\d\d)[a-z]?(?:,[^)]*)?\)\.?/.exec(body) || /\((n\.d\.)\)\.?/.exec(body);
  const quoted = /[“"]([^”"]{8,})[”"]/.exec(body);
  if (paren) {
    // APA / Harvard: Author (2020). Title. Source.
    authorPart = body.slice(0, paren.index);
    year = /\d{4}/.test(paren[1]) ? Number(paren[1]) : undefined;
    const after = body.slice(paren.index + paren[0].length).trim();
    title = quoted && quoted.index > paren.index ? quoted[1] : /^(.+?[.?!])(\s|$)/.exec(after)?.[1] || after;
  } else if (quoted) {
    // IEEE / MLA / Chicago: Author, “Title,” Source, 2020.
    authorPart = body.slice(0, quoted.index);
    title = quoted[1];
    const y = YEAR_RE.exec(body.slice(quoted.index + quoted[0].length)) || YEAR_RE.exec(body);
    year = y ? Number(y[1]) : undefined;
  } else {
    // Vancouver and the rest: Author A, Author B. Title. Journal. 2020;…
    const segs = body.split(/(?<=[.?!])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
    authorPart = segs[0] || '';
    title = segs.length > 1 ? segs[1] : undefined;
    // when the first segment doesn't look like authors, it is the title
    if (segs.length && familyNames(authorPart).length === 0) {
      title = segs[0];
      authorPart = '';
    }
    const y = YEAR_RE.exec(segs.slice(2).join(' ')) || YEAR_RE.exec(body);
    year = y ? Number(y[1]) : undefined;
  }
  title = title?.replace(/^[\s"“”'‘’]+|[\s,.;:"“”'‘’]+$/g, '').trim() || undefined;
  if (title && title.length < 4) title = undefined;
  const shown = familyNames(authorPart);
  return { number, doi, title, year, authors: shown.map(fold), authorsShown: shown };
}

/* ------------------------------------------------------------------ */
/* Finding references and citations in a draft                         */
/* ------------------------------------------------------------------ */

function referenceList(text: string): { start: number; entries: { raw: string; start: number; end: number }[] } | null {
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  HEADING_RE.lastIndex = 0;
  while ((m = HEADING_RE.exec(text))) last = m;
  if (!last) return null;
  const from = last.index + last[0].length;
  const tail = text.slice(from);
  const lines: { s: string; start: number }[] = [];
  let pos = from;
  for (const line of tail.split('\n')) {
    lines.push({ s: line, start: pos });
    pos += line.length + 1;
  }
  const numbered = lines.filter((l) => /^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+\S/.test(l.s)).length >= 2;
  const out: { raw: string; start: number; end: number }[] = [];
  let cur: { raw: string; start: number; end: number } | null = null;
  for (const l of lines) {
    const s = l.s.trim();
    if (/^#{1,6}\s/.test(s) || /^(appendix|notes|acknowledg(e)?ments?|about the author)\b/i.test(s)) break;
    if (!s) {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    const startsNew = numbered ? /^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s+/.test(l.s) : true;
    const lead = l.s.length - l.s.trimStart().length;
    if (startsNew || !cur) {
      if (cur) out.push(cur);
      cur = { raw: s.replace(/^[-*•]\s+/, ''), start: l.start + lead, end: l.start + l.s.trimEnd().length };
    } else {
      cur.raw += ' ' + s;
      cur.end = l.start + l.s.trimEnd().length;
    }
  }
  if (cur) out.push(cur);
  return { start: last.index, entries: out.filter((e) => e.raw.length > 12) };
}

const expandNumbers = (s: string) =>
  s.split(/\s*,\s*/).flatMap((part) => {
    const r = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part.trim());
    if (r) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      return b >= a && b - a < 50 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a, b];
    }
    return /^\d+$/.test(part.trim()) ? [Number(part)] : [];
  });

/* In-text citations in the body (before the reference list). */
export function findInText(text: string, end = text.length, numericParens = false): Omit<InText, 'entries'>[] {
  const body = text.slice(0, end);
  const out: Omit<InText, 'entries'>[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);

  // (Smith, 2020) · (Smith & Lee, 2020, p. 4; Chen et al., 2019) · (see Smith 2020a)
  for (const m of body.matchAll(/\(([^()]{4,240})\)/g)) {
    const inner = m[1];
    if (!YEAR_RE.test(inner)) continue;
    let offset = m.index! + 1;
    let any = false;
    for (const part of inner.split(';')) {
      const y = YEAR_RE.exec(part);
      const partStart = offset + (part.length - part.trimStart().length);
      offset += part.length + 1;
      if (!y) continue;
      const who = part.slice(0, y.index).replace(/^\s*(see also|see|e\.g\.,?|cf\.|i\.e\.,?)\s+/i, '').replace(/[,\s]+$/, '');
      if (!/^\p{Lu}/u.test(who.trim())) continue;
      const names = familyNames(who);
      if (!names.length) continue;
      out.push({ raw: part.trim(), start: partStart, end: partStart + part.trim().length, kind: 'author-year', authors: names.map(fold), year: Number(y[1]) });
      any = true;
    }
    if (any) taken.push([m.index!, m.index! + m[0].length]);
  }
  // Smith (2020) · Smith and Lee (2020) · Smith et al. (2020)
  for (const m of body.matchAll(/(\p{Lu}[\p{L}’'-]+)(?:\s+(?:and|&)\s+(\p{Lu}[\p{L}’'-]+)|\s+et al\.?)?\s+\((1[5-9]\d\d|20\d\d)[a-z]?(?:,[^)]*)?\)/gu)) {
    const a = m.index!;
    const b = a + m[0].length;
    if (!free(a, b)) continue;
    const names = [m[1], m[2]].filter(Boolean).map((x) => fold(x!));
    out.push({ raw: m[0], start: a, end: b, kind: 'author-year', authors: names, year: Number(m[3]) });
  }
  // [3] · [1, 2] · [4–6]
  for (const m of body.matchAll(/\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/g)) {
    out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length, kind: 'numeric', numbers: expandNumbers(m[1]) });
  }
  // (1) · (1,2) · (3–5): only when the reference list is numbered, as Vancouver does
  if (numericParens) {
    // after a space or at a line start, so "(00)" inside a DOI isn't one
    for (const m of body.matchAll(/(?<=^|[\s\p{L}.,;:])\((\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\)(?![\w/-])/gmu)) {
      out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length, kind: 'numeric', numbers: expandNumbers(m[1]) });
    }
  }
  // de-duplicate (a narrative match inside a parenthetical)
  const seen = new Set<string>();
  return out
    .sort((x, y) => x.start - y.start)
    .filter((c) => {
      const k = `${c.start}:${c.kind}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function detectReferences(text: string): Detected {
  const list = referenceList(text);
  const entries: RefEntry[] = (list?.entries || []).map((e, i) => ({ id: i, raw: e.raw, start: e.start, end: e.end, inList: true, ...parseEntry(e.raw) }));
  const listStart = list ? list.start : -1;
  const explicit = entries.filter((e) => e.number != null).length >= Math.max(1, entries.length / 2);
  // numbered lists without explicit numbers are numbered in order
  entries.forEach((e, i) => e.number == null && (e.number = i + 1));
  // DOIs elsewhere in the text, not already in the list
  const known = new Set(entries.map((e) => e.doi?.toLowerCase()).filter(Boolean));
  const bodyEnd = listStart >= 0 ? listStart : text.length;
  for (const m of text.slice(0, bodyEnd).matchAll(DOI_RE)) {
    const doi = trimDoi(m[0]);
    if (known.has(doi.toLowerCase())) continue;
    known.add(doi.toLowerCase());
    entries.push({ id: entries.length, raw: doi, start: m.index!, end: m.index! + doi.length, inList: false, doi, authors: [], authorsShown: [] });
  }

  const intext: InText[] = findInText(text, bodyEnd, explicit).map((c) => {
    let ids: number[] = [];
    if (c.kind === 'numeric') {
      ids = (c.numbers || []).map((n) => entries.find((e) => e.inList && e.number === n)?.id).filter((x): x is number => x != null);
      if (ids.length < (c.numbers || []).length) ids = []; // any missing number makes it an orphan
    } else {
      const first = c.authors![0];
      const sameYear = entries.filter((e) => e.inList && e.year === c.year);
      const hit = sameYear.find((e) => e.authors[0] === first) || sameYear.find((e) => e.authors.includes(first)) || sameYear.find((e) => e.authors.some((a) => a.endsWith(` ${first}`) || first.endsWith(` ${a}`)));
      if (hit) ids = [hit.id];
    }
    return { ...c, entries: ids };
  });
  const citedIds = new Set(intext.flatMap((c) => c.entries));
  // numeric markers only count when the list is numbered and they point inside it
  const relevant = intext.filter((c) => c.kind === 'author-year' || entries.some((e) => e.inList));
  return {
    entries,
    intext: relevant,
    listStart,
    orphans: relevant.filter((c) => !c.entries.length),
    uncited: entries.filter((e) => e.inList && !citedIds.has(e.id)),
  };
}

/* ------------------------------------------------------------------ */
/* Comparing a reference with a record                                 */
/* ------------------------------------------------------------------ */

/* 0–1: how alike two titles are; a title that is the start of the other (a missing subtitle) counts as close */
export function titleScore(a: string, b: string) {
  const x = fold(a).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const y = fold(b).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  if (short.split(' ').length >= 4 && long.startsWith(short)) return 0.92;
  return wordOverlap(x, y);
}

const famOf = (s: Source) => s.authors.map((a) => fold(a.family || ''));

/* Compare one reference with the best record found for it. */
export function compare(e: RefEntry, s: Source, viaDoi: boolean): { status: 'verified' | 'partial' | 'none'; diffs: string[]; score: number } {
  const diffs: string[] = [];
  const t = e.title ? titleScore(e.title, s.title) : viaDoi ? 1 : 0;
  if (!viaDoi && t < 0.6) return { status: 'none', diffs, score: t };
  if (e.title && t < 0.85) diffs.push(viaDoi ? `the DOI belongs to a different title: “${s.title}”` : `title is “${s.title}”`);
  const fams = famOf(s);
  if (e.authors.length && fams.length) {
    const first = e.authors[0];
    const at = fams.findIndex((f) => f === first || f.endsWith(` ${first}`) || first.endsWith(` ${f}`));
    if (at < 0) diffs.push(`first author is ${s.authors[0].family}, not ${e.authorsShown[0]}`);
    else if (at > 0) diffs.push(`${e.authorsShown[0]} is author ${at + 1}, not the first (${s.authors[0].family})`);
  }
  if (e.year && s.year && e.year !== s.year) diffs.push(`year is ${s.year}, not ${e.year}`);
  return { status: diffs.length ? 'partial' : 'verified', diffs, score: t };
}

/* The best of several candidate records for one reference. */
export function bestMatch(e: RefEntry, found: Source[]) {
  let best: { s: Source; r: ReturnType<typeof compare> } | null = null;
  for (const s of found) {
    const r = compare(e, s, false);
    if (r.status === 'none') continue;
    const rank = (x: ReturnType<typeof compare>) => (x.status === 'verified' ? 2 : 1) + x.score - x.diffs.length * 0.01;
    if (!best || rank(r) > rank(best.r)) best = { s, r };
  }
  return best;
}

/* Combine what the lookups returned into one verdict. */
export function verdict(
  e: RefEntry,
  o: { doiRecord?: Source | null; notices?: Notice[]; retracted?: boolean; found?: Source[]; failed: boolean },
): Verdict {
  const notices = [...(o.notices || [])];
  if (o.retracted && !notices.some((n) => n.kind === 'retraction')) notices.unshift({ kind: 'retraction', label: 'OpenAlex lists this work as retracted' });
  let match: Source | undefined;
  let status: Status;
  let diffs: string[] = [];
  if (o.doiRecord) {
    const r = compare(e, o.doiRecord, true);
    match = o.doiRecord;
    status = r.status === 'verified' ? 'verified' : 'partial';
    diffs = r.diffs;
  } else {
    const b = bestMatch(e, o.found || []);
    if (b) {
      match = b.s;
      status = b.r.status === 'verified' ? 'verified' : 'partial';
      diffs = b.r.diffs;
    } else if (o.failed) {
      return { status: 'error', diffs: [], notices, note: 'A database didn’t answer (busy or timed out), so this wasn’t checked. Try again later.' };
    } else {
      return {
        status: 'notfound',
        diffs: [],
        notices,
        note: e.doi && e.doi === e.raw ? 'This DOI isn’t registered with Crossref or OpenAlex.' : e.doi ? 'Its DOI isn’t registered, and no record matches it.' : 'No record in these databases matches its title and authors.',
      };
    }
  }
  if (notices.some((n) => n.kind === 'retraction')) status = 'retracted';
  else if (notices.length && status === 'verified') status = 'corrected';
  return { status, match, diffs, notices };
}

/* A journal-style reference (volume/issue, "vol.", "no.", "2000;356(…)") won't be in a book catalogue. */
export const looksLikeArticle = (raw: string) => /\b\d+\s*\(\d+\)|\bvol\.\s*\d|\bno\.\s*\d|;\s*\d+\s*[(:]|\b\d+\s*:\s*\d+\s*[-–]\s*\d+/i.test(raw);

export const STATUS_LABEL: Record<Status, string> = {
  verified: 'Verified',
  partial: 'Partly matches',
  notfound: 'Not found, possibly fake',
  retracted: 'Retracted',
  corrected: 'Corrected',
  error: 'Could not check',
};
