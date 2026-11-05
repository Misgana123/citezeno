/* The tracing pipeline (read → search → rank) and the manuscript renderer. */
import { analyse, chooseClaims, keywordsFor, locate, relevance, tokens, topicTokens, words } from './text';
import { PROVIDERS, PROVIDER_KEYS, enrich, keyOf, merge, pool, search, type SearchOpts } from './sources';
import { STYLES, disambiguate, esc, numericMarker, plain, sortKey, bibtex, ris, csljson, type Ctx, type Style } from './styles';
import type { Analysis, ApiSettings, Candidate, Claim, Mode, Prefs, ProviderKey, Result, Source } from './types';

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export type Step = 'read' | 'search' | 'rank' | 'format';
export type StepState = 'idle' | 'active' | 'done' | 'error';
export type LogLine = { id: number; provider: string; query: string; n: number; error?: string };

export type TraceEvents = {
  step: (s: Step, state: StepState, msg: string) => void;
  progress: (fraction: number) => void;
  log: (line: LogLine) => void;
  isCancelled: () => boolean;
  /* Called once the claims are chosen, before any search. Throw to stop the trace. */
  charge?: (claims: number) => Promise<void>;
};

export class TraceError extends Error {}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function trace(text: string, prefs: Prefs, settings: ApiSettings, ev: TraceEvents): Promise<Result | null> {
  const active = PROVIDER_KEYS.filter((k) => prefs.providers[k]);
  if (words(text).length < 12) throw new TraceError('Paste at least two full sentences first.');
  if (!active.length) throw new TraceError('Switch on at least one database.');

  ev.step('read', 'active', 'Finding citable claims');
  const analysis = analyse(text);
  const claims = chooseClaims(analysis.sentences, Math.min(prefs.count, 40));
  if (!claims.length) throw new TraceError('No sentence in this draft makes a claim that can be cited.');
  if (ev.charge) await ev.charge(claims.length);
  await wait(280);
  ev.step('read', 'done', `${claims.length} of ${analysis.sentences.length} sentences chosen`);

  const opts: SearchOpts = { yearFrom: prefs.yearFrom, yearTo: prefs.yearTo, oaOnly: prefs.oaOnly, kind: prefs.kind, settings };
  const tasks: { ci: number; p: ProviderKey }[] = [];
  claims.forEach((_, ci) =>
    active.forEach((p) => {
      if (p === 'wikipedia' && (opts.kind === 'books' || opts.kind === 'scholarly')) return;
      if (opts.oaOnly && p === 'crossref') return; // Crossref has no reliable open-access flag
      tasks.push({ ci, p });
    }),
  );
  if (!tasks.length) throw new TraceError('None of the switched-on databases match these filters.');

  ev.step('search', 'active', `0 of ${tasks.length} queries`);
  let done = 0;
  let found = 0;
  let failed = 0;
  let logId = 0;
  const res = await pool(
    tasks.map((t) => () => {
      if (ev.isCancelled()) throw new Error('cancelled');
      return search(t.p, claims[t.ci].keywords || [], opts);
    }),
    5,
    (idx, r) => {
      if (ev.isCancelled()) return;
      done++;
      const t = tasks[idx];
      const query = (claims[t.ci].keywords || []).slice(0, PROVIDERS[t.p].words || 6).join(' ');
      if (r.ok) {
        found += r.value.length;
        ev.log({ id: logId++, provider: PROVIDERS[t.p].name, query, n: r.value.length });
      } else {
        failed++;
        ev.log({ id: logId++, provider: PROVIDERS[t.p].name, query, n: 0, error: (r as { error: Error }).error.message || 'failed' });
      }
      ev.step('search', 'active', `${done} of ${tasks.length} queries, ${found} hits`);
      ev.progress((done / tasks.length) * 0.85);
    },
  );
  if (ev.isCancelled()) return null;
  if (failed === tasks.length) {
    ev.step('search', 'error', 'No database answered');
    throw new TraceError('The databases could not be reached. Check your connection and trace again.');
  }
  ev.step('search', 'done', `${tasks.length} queries, ${found} hits${failed ? `, ${failed} failed` : ''}`);
  ev.step('rank', 'active', 'Scoring relevance');

  const topic = topicTokens(analysis);
  const db = new Map<string, Source>();
  const candKeys = claims.map(() => new Set<string>());
  res.forEach((r, idx) => {
    if (!r.ok) return;
    const { ci } = tasks[idx];
    r.value.forEach((src) => {
      const key = keyOf(src);
      const prev = db.get(key);
      db.set(key, prev ? merge(prev, src) : { ...src, id: key, providers: [src.provider] });
      candKeys[ci].add(key);
    });
  });

  const cands: Candidate[][] = claims.map((c, ci) =>
    [...candKeys[ci]]
      .map((id) => {
        const s = db.get(id)!;
        let score = relevance(c.tokens || new Set(), s, { claimText: c.text, topic });
        if (s.provider === 'Wikipedia' && (s.providers || []).length === 1) score -= 0.06;
        if ((s.providers || []).length > 1) score += 0.03;
        return { id, score: Math.max(0, Math.min(1, score)) };
      })
      .filter((x) => {
        const s = db.get(x.id)!;
        if (opts.kind === 'books' && !['book', 'chapter'].includes(s.type)) return false;
        if (opts.oaOnly && !s.oa) return false;
        if (s.retracted) return false; // never cite a retracted work automatically
        return x.score >= prefs.minRel;
      })
      .sort((a, b) => b.score - a.score),
  );

  const assigned = assign(cands, prefs.count);
  const total = assigned.reduce((n, a) => n + a.length, 0);
  let retracted = 0;
  db.forEach((s) => s.retracted && retracted++);
  ev.step('rank', 'done', `${db.size} unique works, ${total} selected${retracted ? `, ${retracted} retracted skipped` : ''}`);
  ev.step('format', 'active', 'Completing page numbers and volume details');
  await completeDetails(db, [...new Set(assigned.flat())], settings);
  if (ev.isCancelled()) return null;
  ev.progress(1);

  return {
    analysis,
    claims: claims.map((c, ci) => ({ sid: c.index, text: c.text, ids: assigned[ci], cands: cands[ci] })),
    db,
    extra: [],
    requested: prefs.count,
  };
}

/* Fetch missing pages, volume and issue from Crossref for the works that were chosen. */
export async function completeDetails(db: Map<string, Source>, ids: string[], settings: ApiSettings) {
  const todo = ids.filter((id) => {
    const s = db.get(id);
    return s && s.doi && s.type !== 'web' && (!s.pages || !s.volume || !s.container);
  });
  await pool(
    todo.map((id) => async () => {
      const s = db.get(id)!;
      db.set(id, await enrich(s, settings));
    }),
    4,
  );
}

/* ------------------------------------------------------------------ */
/* Citing one passage the user selected                                */
/* ------------------------------------------------------------------ */

export type Found = { db: Map<string, Source>; cands: Candidate[]; ids: string[] };

export async function traceClaim(passage: string, prefs: Prefs, settings: ApiSettings, n: number, exclude: Set<string>, topic?: Set<string>): Promise<Found> {
  const active = PROVIDER_KEYS.filter((k) => prefs.providers[k]);
  if (!active.length) throw new TraceError('Switch on at least one database.');
  const keywords = keywordsFor(passage);
  if (keywords.length < 1) throw new TraceError('Select a passage with a few meaningful words in it.');
  const opts: SearchOpts = { yearFrom: prefs.yearFrom, yearTo: prefs.yearTo, oaOnly: prefs.oaOnly, kind: prefs.kind, settings };
  const ps = active.filter((p) => !(p === 'wikipedia' && (opts.kind === 'books' || opts.kind === 'scholarly')) && !(opts.oaOnly && p === 'crossref'));
  const res = await pool(ps.map((p) => () => search(p, keywords, opts)), 4);
  if (res.every((r) => !r.ok)) throw new TraceError('The databases could not be reached. Check your connection and try again.');
  const db = new Map<string, Source>();
  res.forEach((r) => {
    if (!r.ok) return;
    r.value.forEach((src) => {
      const key = keyOf(src);
      const prev = db.get(key);
      db.set(key, prev ? merge(prev, src) : { ...src, id: key, providers: [src.provider] });
    });
  });
  const claimTokens = new Set(tokens(passage));
  const cands = [...db.keys()]
    .map((id) => {
      const s = db.get(id)!;
      let score = relevance(claimTokens, s, { claimText: passage, topic });
      if (s.provider === 'Wikipedia' && (s.providers || []).length === 1) score -= 0.06;
      if ((s.providers || []).length > 1) score += 0.03;
      return { id, score: Math.max(0, Math.min(1, score)) };
    })
    .filter((x) => {
      const s = db.get(x.id)!;
      if (opts.kind === 'books' && !['book', 'chapter'].includes(s.type)) return false;
      if (opts.oaOnly && !s.oa) return false;
      if (s.retracted) return false;
      return x.score > 0.05;
    })
    .sort((a, b) => b.score - a.score);
  const fresh = cands.filter((c) => !exclude.has(c.id));
  let ids = fresh.filter((c) => c.score >= prefs.minRel).slice(0, n).map((c) => c.id);
  if (!ids.length) ids = fresh.slice(0, Math.min(n, 2)).map((c) => c.id);
  await completeDetails(db, ids, settings);
  return { db, cands, ids };
}

/* Fold a hand-picked citation into the result, re-anchoring earlier claims if the draft changed. */
export function attachClaim(prev: Result | null, analysis: Analysis, sid: number, passage: string, found: Found, n: number): Result {
  const db = new Map(prev ? prev.db : []);
  found.db.forEach((s, k) => db.set(k, db.has(k) ? merge(db.get(k)!, s) : s));
  let claims: Claim[] = [];
  if (prev) {
    const byText = new Map<string, number>();
    analysis.sentences.forEach((s) => !byText.has(s.text) && byText.set(s.text, s.index));
    prev.claims.forEach((c) => {
      const old = prev.analysis.sentences.find((s) => s.index === c.sid);
      const nsid = old ? byText.get(old.text) : undefined;
      if (nsid != null) claims.push({ ...c, sid: nsid });
    });
  }
  const sentence = analysis.sentences.find((s) => s.index === sid);
  const flat = passage.replace(/\s+/g, ' ').trim();
  const anchor = sentence && sentence.text.includes(flat) && sentence.text.trim() !== flat ? flat : undefined;
  const at = claims.findIndex((c) => c.sid === sid);
  if (at >= 0) {
    const c = claims[at];
    const cands = [...c.cands];
    found.cands.forEach((x) => {
      const i = cands.findIndex((y) => y.id === x.id);
      if (i < 0) cands.push(x);
      else if (cands[i].score < x.score) cands[i] = x;
    });
    cands.sort((a, b) => b.score - a.score);
    claims[at] = { ...c, text: passage, anchor, ids: [...c.ids, ...found.ids.filter((id) => !c.ids.includes(id))], cands };
  } else {
    claims.push({ sid, text: passage, anchor, ids: found.ids, cands: found.cands });
  }
  claims = claims.sort((a, b) => a.sid - b.sid);
  return { analysis, claims, db, extra: prev ? prev.extra.filter((id) => db.has(id)) : [], requested: (prev ? prev.requested : 0) + n, pins: prev ? prev.pins : undefined };
}

/* Which sentence a selection belongs to: the last one it overlaps. */
export function sentenceForSelection(value: string, analysis: Analysis, start: number, end: number) {
  const spans = locate(value, analysis.sentences);
  const hit = spans.filter((s) => s.start < end && s.end > start);
  return hit.length ? hit[hit.length - 1].index : null;
}

/* Every claim gets its best unused source first; extras go to the strongest matches, max 4 per claim. */
function assign(cands: Candidate[][], wanted: number) {
  const used = new Set<string>();
  const out: string[][] = cands.map(() => []);
  const pairs: (Candidate & { ci: number })[] = [];
  cands.forEach((list, ci) => list.forEach((c) => pairs.push({ ci, ...c })));
  pairs.sort((a, b) => b.score - a.score);
  let total = 0;
  for (const p of pairs) {
    if (total >= wanted) break;
    if (out[p.ci].length || used.has(p.id)) continue;
    out[p.ci].push(p.id);
    used.add(p.id);
    total++;
  }
  for (let round = 2; round <= 4 && total < wanted; round++) {
    for (const p of pairs) {
      if (total >= wanted) break;
      if (out[p.ci].length >= round || used.has(p.id)) continue;
      out[p.ci].push(p.id);
      used.add(p.id);
      total++;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Editing helpers                                                     */
/* ------------------------------------------------------------------ */

export function citedSet(r: Result) {
  const s = new Set<string>();
  r.claims.forEach((c) => c.ids.forEach((id) => s.add(id)));
  r.extra.forEach((id) => s.add(id));
  return s;
}

export function citedOrder(r: Result) {
  const order: string[] = [];
  const seen = new Set<string>();
  r.claims
    .slice()
    .sort((a, b) => a.sid - b.sid)
    .forEach((c) => c.ids.forEach((id) => !seen.has(id) && (seen.add(id), order.push(id))));
  r.extra.forEach((id) => !seen.has(id) && (seen.add(id), order.push(id)));
  return order;
}

export function removeSource(r: Result, id: string): Result {
  return {
    ...r,
    claims: r.claims.map((c) => ({ ...c, ids: c.ids.filter((x) => x !== id), cands: c.cands.filter((x) => x.id !== id) })),
    extra: r.extra.filter((x) => x !== id),
  };
}

export function swapSource(r: Result, id: string): Result | null {
  const used = citedSet(r);
  const ci = r.claims.findIndex((x) => x.ids.includes(id));
  if (ci < 0) return null;
  const c = r.claims[ci];
  const next = c.cands.find((x) => !used.has(x.id));
  if (!next) return null;
  const ids = c.ids.map((x) => (x === id ? next.id : x));
  const cands = c.cands.filter((x) => x.id !== id).concat(c.cands.filter((x) => x.id === id));
  const claims = r.claims.slice();
  claims[ci] = { ...c, ids, cands };
  return { ...r, claims };
}

export function replaceSource(r: Result, oldId: string, newId: string): Result | null {
  const ci = r.claims.findIndex((x) => x.ids.includes(oldId));
  if (ci < 0 || citedSet(r).has(newId)) return null;
  const c = r.claims[ci];
  const claims = r.claims.slice();
  claims[ci] = { ...c, ids: c.ids.map((x) => (x === oldId ? newId : x)) };
  return { ...r, claims };
}

export function addSource(r: Result, s: Source, claimIndex: number): { result: Result; message: string } {
  s.id = keyOf(s);
  s.providers = [s.provider];
  const db = new Map(r.db);
  const merged = db.has(s.id) ? merge(db.get(s.id)!, s) : s;
  db.set(s.id, merged);
  if (citedSet(r).has(s.id)) return { result: { ...r, db }, message: 'That source is already in your list.' };
  if (claimIndex >= 0) {
    const claims = r.claims.slice();
    const c = claims[claimIndex];
    claims[claimIndex] = {
      ...c,
      ids: [...c.ids, s.id],
      cands: [...c.cands, { id: s.id, score: relevance(new Set(tokens(c.text)), merged) }],
    };
    return { result: { ...r, db, claims }, message: `Added to claim ${claimIndex + 1}.` };
  }
  return { result: { ...r, db, extra: [...r.extra, s.id] }, message: 'Added to the reference list.' };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export const shorten = (t: string, n: number) => {
  const w = String(t).split(/\s+/);
  return w.length > n ? w.slice(0, n).join(' ') + '…' : t;
};

export function defaultAnnotation(s: Source, claim: string) {
  let summary: string;
  if (s.type === 'book' && s.provider === 'Open Library') {
    const subj = (s.keywords || []).slice(0, 5).join(', ');
    summary = `Book${s.year ? ` first published in ${s.year}` : ''}${subj ? `, catalogued under ${subj}` : ''}.`;
  } else if (s.abstract) {
    const sentences = s.abstract.match(/[^.!?]+[.!?]+/g) || [s.abstract];
    let acc = '';
    for (const x of sentences) {
      if ((acc + x).split(/\s+/).length > 45 && acc) break;
      acc += x;
    }
    summary = shorten(acc.trim(), 50);
  } else summary = 'This record has no abstract. Open the source to summarise its argument.';
  return `${summary}${claim ? ` Used to support: “${shorten(claim, 16)}”` : ''}`;
}

/* Put the marker right after a passage inside the sentence, if the passage ends before the sentence does. */
function attachAnchored(sentence: string, anchor: string | undefined, marker: string, where: 'before' | 'after') {
  if (anchor) {
    const at = sentence.indexOf(anchor);
    const m = /([.!?…]+["'”’)\]]*)\s*$/.exec(sentence);
    const bodyEnd = m ? m.index : sentence.length;
    const cut = at + anchor.replace(/[\s.,;:!?…]+$/, '').length;
    if (at >= 0 && cut < bodyEnd - 1) {
      const head = sentence.slice(0, cut);
      const tail = sentence.slice(cut);
      return where === 'before' ? `${esc(head)} ${marker}${esc(tail)}` : `${esc(head)}${marker}${esc(tail)}`;
    }
  }
  return attach(sentence, marker, where);
}

function attach(sentence: string, marker: string, where: 'before' | 'after') {
  const m = /([.!?…]+["'”’)\]]*)\s*$/.exec(sentence);
  const body = m ? sentence.slice(0, m.index) : sentence;
  const punct = m ? m[1] : '';
  return where === 'before' ? `${esc(body)} ${marker}${esc(punct)}` : `${esc(body)}${esc(punct)}${marker}`;
}

const trimDot = (h: string) => h.replace(/\.(\s*)$/, '$1').replace(/\.(<\/a>)$/, '$1');

/* ---- pinpoint page numbers ("p. 437") ---- */
const locLabel = (pin: string) => (/[-–,]/.test(pin) ? 'pp.' : 'p.');
const cleanPin = (pin: string) => pin.trim().replace(/^(pp?\.?\s*)/i, '').replace(/-/g, '–');

function authorDateWithPins(style: Style, srcs: Source[], ctx: Ctx, pins: Record<string, string>) {
  const parts = srcs.map((s) => {
    const one = style.cite!([s], ctx);
    const inner = one.replace(/^\(/, '').replace(/\)$/, '');
    const pin = pins[s.id!] ? cleanPin(pins[s.id!]) : '';
    if (!pin) return inner;
    const id = Object.keys(STYLES).find((k) => STYLES[k] === style);
    if (id === 'mla') return `${inner} ${esc(pin)}`;
    if (id === 'asa') return `${inner}:${esc(pin)}`;
    if (id === 'chicagoad') return `${inner}, ${esc(pin)}`;
    return `${inner}, ${locLabel(pin)} ${esc(pin)}`;
  });
  return `(${parts.join('; ')})`;
}

function numericWithPins(style: Style, styleId: string, nums: number[], ids: string[], pins: Record<string, string>) {
  if (!ids.some((id) => pins[id])) return numericMarker(style, nums);
  const items = nums.map((n, k) => ({ n, pin: pins[ids[k]] ? cleanPin(pins[ids[k]]) : '' }));
  if (style.marker === 'bracket') return items.map((x) => (x.pin ? `[${x.n}, ${locLabel(x.pin)} ${esc(x.pin)}]` : `[${x.n}]`)).join(', ');
  if (style.marker === 'paren-num') return `(${items.map((x) => (x.pin ? `${x.n}, ${locLabel(x.pin)} ${esc(x.pin)}` : `${x.n}`)).join('; ')})`;
  if (styleId === 'ama') return items.map((x) => (x.pin ? `${x.n}(p${esc(x.pin)})` : `${x.n}`)).join(',');
  return numericMarker(style, nums);
}

export type Rendered = {
  docHtml: string;
  refHtml: string;
  docPlain: string;
  refPlain: string;
  list: Source[];
  listTitle: string;
  effectiveMode: Mode;
  modeNote: string;
  numbered: boolean;
  /* id → display number (1-based) */
  number: Map<string, number>;
  /* id → formatted reference entry (HTML) */
  entries: Map<string, string>;
};

export function render(r: Result, styleId: string, requestedMode: Mode, annotations: Record<string, string>): Rendered {
  const style = STYLES[styleId];
  const pins = r.pins || {};
  let mode = requestedMode;
  let modeNote = '';
  if (style.family === 'notes' && mode === 'intext') {
    mode = 'footnotes';
    modeNote = `${style.name} cites with notes rather than in-text citations, so footnotes are shown.`;
  }
  const order = citedOrder(r);
  const list = order.map((id) => r.db.get(id)!).filter(Boolean);
  const idx = new Map(order.map((id, k) => [id, k]));
  const ctx = disambiguate(style, list);
  const numbered = style.family === 'numeric';
  const listTitle =
    mode === 'annotated'
      ? 'Annotated Bibliography'
      : style.family === 'author-date' && (mode === 'footnotes' || mode === 'endnotes')
        ? 'Bibliography'
        : style.listTitle;

  const bySid = new Map(r.claims.filter((c) => c.ids.length).map((c) => [c.sid, c]));
  const showMarkers = mode === 'intext' || mode === 'footnotes' || mode === 'endnotes';
  const paras: (typeof r.analysis.sentences)[] = [];
  r.analysis.sentences.forEach((s) => (paras[s.para] = paras[s.para] || []).push(s));

  let noteNo = 0;
  const seenNote = new Set<string>();
  const endnotes: { n: number; refs: string; html: string }[] = [];
  let html = '';
  const plainOut: string[] = [];
  const notesPlain: string[] = [];
  const noteHTML = (n: { n: number; refs: string; html: string }) =>
    `<div class="note" data-ref="${n.refs}"><span class="nn">${n.n}</span><span>${n.html}</span></div>`;

  paras.forEach((sents) => {
    if (!sents) return;
    const pageNotes: typeof endnotes = [];
    const pieces = sents.map((s) => {
      const c: Claim | undefined = bySid.get(s.index);
      if (!c || !showMarkers) return c && mode !== 'list' ? `<span class="claim">${esc(s.text)}</span>` : esc(s.text);
      const srcs = c.ids.map((id) => r.db.get(id)!);
      const refs = c.ids.map((id) => idx.get(id)).join(' ');
      const weak = c.cands.filter((x) => c.ids.includes(x.id)).every((x) => x.score < 0.3);
      let inner: string;
      if (mode === 'intext') {
        if (numbered) {
          const mk = numericWithPins(style, styleId, c.ids.map((id) => idx.get(id)! + 1), c.ids, pins);
          inner =
            style.marker === 'sup'
              ? attachAnchored(s.text, c.anchor, `<sup class="cite" data-ref="${refs}">${mk}</sup>`, 'after')
              : attachAnchored(s.text, c.anchor, `<span class="cite" data-ref="${refs}">${mk}</span>`, 'before');
        } else {
          const ad = Object.keys(pins).length ? authorDateWithPins(style, srcs, ctx, pins) : style.cite!(srcs, ctx);
          inner = attachAnchored(s.text, c.anchor, `<span class="cite" data-ref="${refs}">${ad}</span>`, 'before');
        }
      } else {
        noteNo++;
        const parts = srcs.map((src, k) => {
          const first = !seenNote.has(src.id!);
          seenNote.add(src.id!);
          let h = style.note!(src, first, ctx);
          const pin = pins[src.id!] ? cleanPin(pins[src.id!]) : '';
          if (pin) h = `${trimDot(h)}, ${esc(pin)}.`;
          return k < srcs.length - 1 ? trimDot(h) : h;
        });
        const note = { n: noteNo, refs, html: parts.join('; ') };
        (mode === 'footnotes' ? pageNotes : endnotes).push(note);
        notesPlain.push(`${noteNo}. ${plain(note.html)}`);
        inner = attachAnchored(s.text, c.anchor, `<sup class="cite" data-ref="${refs}">${noteNo}</sup>`, 'after');
      }
      return `<span class="claim${weak ? ' weak' : ''}">${inner}</span>`;
    });
    const pHtml = pieces.join(' ');
    html += `<p>${pHtml}</p>`;
    plainOut.push(plain(pHtml));
    if (pageNotes.length) html += `<div class="fnotes">${pageNotes.map(noteHTML).join('')}</div>`;
  });
  if (endnotes.length) html += `<h3 class="list-title">Notes</h3><div class="endnotes">${endnotes.map(noteHTML).join('')}</div>`;

  const entries = list.map((s, k) => ({ s, k }));
  if (!numbered) entries.sort((a, b) => sortKey(a.s).localeCompare(sortKey(b.s)));
  const claimFor = (id: string) => r.claims.find((x) => x.ids.includes(id))?.text || '';
  const annot = (s: Source) => annotations[s.id!] ?? defaultAnnotation(s, claimFor(s.id!));
  const numLabel = (k: number) => (style.marker === 'bracket' ? `[${k + 1}]` : `${k + 1}.`);

  const refItems = entries.map(({ s, k }) => {
    const num = numbered ? `<span class="rn">${numLabel(k)}</span>` : '';
    let h = `<p class="ref${numbered ? ' num' : ''}" data-ref="${k}">${num}${style.entry(s, ctx)}</p>`;
    if (mode === 'annotated')
      h += `<p class="annot" contenteditable="true" spellcheck="true" data-id="${esc(s.id)}">${esc(annot(s))}</p>`;
    return h;
  });
  const refLines = entries.map(
    ({ s, k }) =>
      `${numbered ? numLabel(k) + ' ' : ''}${plain(style.entry(s, ctx))}${mode === 'annotated' ? '\n    ' + annot(s) : ''}`,
  );
  const listHTML = list.length
    ? `<h3 class="list-title">${listTitle}</h3>${refItems.join('')}`
    : `<p class="empty-note">No sources are selected. Add one from the Sources tab or trace again.</p>`;

  return {
    docHtml: html + listHTML,
    refHtml: listHTML,
    docPlain:
      plainOut.join('\n\n') +
      (notesPlain.length ? `\n\n${mode === 'endnotes' ? 'Notes' : 'Footnotes'}\n` + notesPlain.join('\n') : '') +
      (list.length ? `\n\n${listTitle}\n` + refLines.join('\n') : ''),
    refPlain: `${listTitle}\n` + refLines.join('\n'),
    list,
    listTitle,
    effectiveMode: mode,
    modeNote,
    numbered,
    number: new Map(order.map((id, k) => [id, k + 1])),
    entries: new Map(entries.map(({ s, k }) => [s.id!, (numbered ? numLabel(k) + ' ' : '') + style.entry(s, ctx)])),
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export type ExportFormat = 'bibtex' | 'ris' | 'csl' | 'text' | 'html';

export const EXPORTS: Record<ExportFormat, { label: string; ext: string; mime: string; hint: string }> = {
  bibtex: { label: 'BibTeX', ext: 'bib', mime: 'application/x-bibtex', hint: 'For Zotero, Mendeley, JabRef or a LaTeX bibliography.' },
  ris: { label: 'RIS', ext: 'ris', mime: 'application/x-research-info-systems', hint: 'For EndNote, Zotero, Mendeley or RefWorks.' },
  csl: { label: 'CSL-JSON', ext: 'json', mime: 'application/json', hint: 'For Zotero, Pandoc and other citeproc processors.' },
  text: { label: 'Plain text', ext: 'txt', mime: 'text/plain', hint: 'The whole manuscript with citations, notes and references.' },
  html: { label: 'HTML', ext: 'html', mime: 'text/html', hint: 'A standalone page of the formatted manuscript. Opens in Word or Google Docs.' },
};

export function exportText(fmt: ExportFormat, rd: Rendered) {
  if (fmt === 'bibtex') return bibtex(rd.list);
  if (fmt === 'ris') return ris(rd.list);
  if (fmt === 'csl') return csljson(rd.list);
  if (fmt === 'text') return rd.docPlain;
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${esc(rd.listTitle)}</title>\n<style>body{font:17px/1.7 Georgia,serif;max-width:760px;margin:40px auto;padding:0 20px}.ref{padding-left:2.2em;text-indent:-2.2em}.rn{display:inline-block;width:2.6em;text-indent:0}.note{font-size:14px}.nn{margin-right:.5em}.fnotes{border-top:1px solid #999;margin:0 0 1.2em}</style></head><body>\n${rd.docHtml.replace(/ contenteditable="true"/g, '')}\n</body></html>`;
}

/* Inline-styled copy of rendered HTML so pasted text keeps hanging indents. */
export function richHTML(html: string) {
  return `<div style="font-family:Georgia,serif">${html
    .replace(/<p class="ref( num)?"/g, '<p style="padding-left:2.2em;text-indent:-2.2em;margin:0 0 .8em" class="ref$1"')
    .replace(/<h3 class="list-title">/g, '<h3 style="text-align:center;font-weight:600">')
    .replace(/<div class="(fnotes|endnotes)">/g, '<div style="font-size:10pt;border-top:1px solid #999;padding-top:4pt;margin-bottom:12pt">')
    .replace(/ contenteditable="true"/g, ' style="margin-left:2.2em"')}</div>`;
}
