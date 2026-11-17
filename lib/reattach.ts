/* Keeping citations on their sentences when the draft is edited.
   1. A claim whose sentence is still there word for word stays on it.
   2. Otherwise it moves to the most similar unclaimed sentence, if that sentence
      is at least REATTACH_MIN_SIMILARITY alike (ties go to the nearer position).
   3. Anything left is "detached": kept aside for the user to re-attach or remove,
      never dropped silently. One citation never lands on two sentences. */
import type { Analysis, Claim, DetachedClaim } from './types';

/* how alike a reworded sentence must be (0–1) to keep its citation automatically */
export const REATTACH_MIN_SIMILARITY = 0.75;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const wordList = (s: string) => norm(s).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];

/* Dice overlap of the two sentences' word multisets (0–1). */
export function wordOverlap(a: string, b: string) {
  const wa = wordList(a);
  const wb = wordList(b);
  if (!wa.length || !wb.length) return wa.length === wb.length ? 1 : 0;
  const counts = new Map<string, number>();
  wa.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  let shared = 0;
  wb.forEach((w) => {
    const n = counts.get(w) || 0;
    if (n) {
      shared++;
      counts.set(w, n - 1);
    }
  });
  return (2 * shared) / (wa.length + wb.length);
}

/* 1 − (character edit distance ÷ longer length), on the normalised text. */
export function editRatio(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  const max = Math.max(x.length, y.length);
  if (!max) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[y.length] / max;
}

/* How alike two sentences are (0–1): the mean of word overlap and edit-distance ratio.
   Pairs that clearly differ skip the (slower) edit distance. */
export function similarity(a: string, b: string) {
  if (norm(a) === norm(b)) return 1;
  const w = wordOverlap(a, b);
  const la = norm(a).length;
  const lb = norm(b).length;
  // even a perfect edit ratio could not lift these to the threshold
  if ((w + Math.min(la, lb) / Math.max(la, lb, 1)) / 2 < REATTACH_MIN_SIMILARITY) return w / 2;
  return (w + editRatio(a, b)) / 2;
}

export type Reattached = {
  claims: Claim[];
  detached: DetachedClaim[];
  /* new sentence index → how it was matched */
  how: Map<number, 'exact' | 'similar'>;
};

/* Move `claims` (made against `prev`) onto the sentences of `next`. */
export function reattach(prev: Analysis, claims: Claim[], next: Analysis): Reattached {
  const oldText = new Map(prev.sentences.map((s) => [s.index, s.text]));
  const oldPos = new Map(prev.sentences.map((s, k) => [s.index, prev.sentences.length > 1 ? k / (prev.sentences.length - 1) : 0]));
  const newPos = new Map(next.sentences.map((s, k) => [s.index, next.sentences.length > 1 ? k / (next.sentences.length - 1) : 0]));
  const dist = (c: Claim, sid: number) => Math.abs((oldPos.get(c.sid) ?? 0) - (newPos.get(sid) ?? 0));

  const taken = new Set<number>();
  const placed = new Map<Claim, number>();
  const how = new Map<number, 'exact' | 'similar'>();

  // 1. identical sentences, nearest position first when a sentence repeats
  const exact: { c: Claim; sid: number; d: number }[] = [];
  claims.forEach((c) => {
    const t = oldText.get(c.sid);
    if (t == null) return;
    next.sentences.forEach((s) => s.text === t && exact.push({ c, sid: s.index, d: dist(c, s.index) }));
  });
  exact.sort((a, b) => a.d - b.d);
  exact.forEach(({ c, sid }) => {
    if (placed.has(c) || taken.has(sid)) return;
    placed.set(c, sid);
    taken.add(sid);
    how.set(sid, 'exact');
  });

  // 2. the most similar free sentence, if it is similar enough
  const near: { c: Claim; sid: number; sim: number; d: number }[] = [];
  claims.forEach((c) => {
    if (placed.has(c)) return;
    const t = oldText.get(c.sid) ?? c.text;
    next.sentences.forEach((s) => {
      if (taken.has(s.index)) return;
      const sim = similarity(t, s.text);
      if (sim >= REATTACH_MIN_SIMILARITY) near.push({ c, sid: s.index, sim, d: dist(c, s.index) });
    });
  });
  near.sort((a, b) => b.sim - a.sim || a.d - b.d);
  near.forEach(({ c, sid }) => {
    if (placed.has(c) || taken.has(sid)) return;
    placed.set(c, sid);
    taken.add(sid);
    how.set(sid, 'similar');
  });

  // 3. move the placed claims; the rest are detached
  const byIndex = new Map(next.sentences.map((s) => [s.index, s]));
  const out: Claim[] = [];
  const detached: DetachedClaim[] = [];
  claims.forEach((c) => {
    const sid = placed.get(c);
    const was = oldText.get(c.sid) ?? c.text;
    if (sid == null) {
      if (c.ids.length) detached.push({ ...c, was });
      return;
    }
    const s = byIndex.get(sid)!;
    // a claim made for the whole sentence follows its new wording; a hand-picked passage keeps its own
    const whole = c.text.trim() === was.trim();
    out.push({ ...c, sid, text: whole ? s.text : c.text, anchor: c.anchor && s.text.includes(c.anchor) ? c.anchor : undefined });
  });
  out.sort((a, b) => a.sid - b.sid);
  return { claims: out, detached, how };
}
