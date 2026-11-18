import { describe, expect, it } from 'vitest';
import { REATTACH_MIN_SIMILARITY, editRatio, reattach, similarity, wordOverlap } from '@/lib/reattach';
import { analyse } from '@/lib/text';
import type { Claim } from '@/lib/types';

const P1 = 'Urban heat islands make cities several degrees warmer than the surrounding countryside. Dark roofs and asphalt absorb sunlight during the day and release it at night.';
const P2 = 'Street trees can lower surface temperatures by up to twelve degrees in summer. Reflective roofs reduce indoor cooling demand in hot climates by about twenty percent.';
const DRAFT = `${P1}\n\n${P2}`;

/* one citation on each sentence of the draft, source id = sentence number */
function traced(text = DRAFT) {
  const a = analyse(text);
  const claims: Claim[] = a.sentences.map((s) => ({ sid: s.index, text: s.text, ids: [`src${s.index}`], cands: [{ id: `src${s.index}`, score: 0.7 }] }));
  return { a, claims };
}
const owner = (r: ReturnType<typeof reattach>, next: ReturnType<typeof analyse>) =>
  Object.fromEntries(r.claims.map((c) => [c.ids[0], next.sentences.find((s) => s.index === c.sid)!.text]));

describe('similarity', () => {
  it('scores identical, reworded and unrelated sentences', () => {
    const a = 'Urban heat islands make cities several degrees warmer than the surrounding countryside.';
    expect(similarity(a, a)).toBe(1);
    expect(similarity(a, 'Urban heat islands make cities a few degrees warmer than the surrounding countryside.')).toBeGreaterThanOrEqual(REATTACH_MIN_SIMILARITY);
    expect(similarity(a, 'The printing press spread literacy across Europe within a century.')).toBeLessThan(0.3);
    expect(wordOverlap('a b c', 'c b a')).toBe(1);
    expect(editRatio('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7);
    expect(REATTACH_MIN_SIMILARITY).toBe(0.75);
  });
});

describe('reattach', () => {
  it('keeps exact sentences where they are', () => {
    const { a, claims } = traced();
    const r = reattach(a, claims, analyse(DRAFT));
    expect(r.detached).toEqual([]);
    expect(r.claims.map((c) => c.sid)).toEqual([0, 1, 2, 3]);
    expect([...r.how.values()].every((h) => h === 'exact')).toBe(true);
  });

  it('follows small edits', () => {
    const { a, claims } = traced();
    const edited = DRAFT.replace('several degrees warmer', 'a few degrees warmer')
      .replace('Street trees can lower', 'Street trees may lower')
      .replace('by about twenty percent', 'by roughly 20 percent');
    const next = analyse(edited);
    const r = reattach(a, claims, next);
    expect(r.detached).toEqual([]);
    const o = owner(r, next);
    expect(o.src0).toContain('a few degrees warmer');
    expect(o.src2).toContain('Street trees may lower');
    expect(o.src3).toContain('roughly 20 percent');
    // the moved claim takes the new wording
    expect(r.claims.find((c) => c.ids[0] === 'src0')!.text).toContain('a few degrees');
    expect(r.how.get(r.claims.find((c) => c.ids[0] === 'src0')!.sid)).toBe('similar');
  });

  it('detaches a deleted sentence instead of dropping it', () => {
    const { a, claims } = traced();
    const next = analyse(DRAFT.replace(' Dark roofs and asphalt absorb sunlight during the day and release it at night.', ''));
    const r = reattach(a, claims, next);
    expect(r.claims).toHaveLength(3);
    expect(r.detached).toHaveLength(1);
    expect(r.detached[0].ids).toEqual(['src1']);
    expect(r.detached[0].was).toContain('Dark roofs and asphalt');
  });

  it('a sentence split in two keeps its citation on the half that is still the claim, or detaches it', () => {
    const { a, claims } = traced();
    // a short clause split off: the main sentence is still recognisably the same
    const minor = DRAFT.replace(
      'Reflective roofs reduce indoor cooling demand in hot climates by about twenty percent.',
      'Reflective roofs reduce indoor cooling demand in hot climates by about twenty percent. That is a lot.',
    );
    let next = analyse(minor);
    let r = reattach(a, claims, next);
    expect(r.detached).toEqual([]);
    expect(owner(r, next).src3).toBe('Reflective roofs reduce indoor cooling demand in hot climates by about twenty percent.');

    // split down the middle: neither half is the original claim any more
    const half = DRAFT.replace(
      'Dark roofs and asphalt absorb sunlight during the day and release it at night.',
      'Dark roofs and asphalt absorb sunlight during the day. They release that heat at night.',
    );
    next = analyse(half);
    r = reattach(a, claims, next);
    expect(r.detached.map((d) => d.ids[0])).toEqual(['src1']);
    // and nothing landed on either half by accident
    const halves = next.sentences.filter((s) => /Dark roofs|release that heat/.test(s.text)).map((s) => s.index);
    expect(r.claims.some((c) => halves.includes(c.sid))).toBe(false);
  });

  it('follows reordered paragraphs', () => {
    const { a, claims } = traced();
    const next = analyse(`${P2}\n\n${P1}`);
    const r = reattach(a, claims, next);
    expect(r.detached).toEqual([]);
    const o = owner(r, next);
    expect(o.src0).toContain('Urban heat islands');
    expect(o.src2).toContain('Street trees');
    expect(r.claims.map((c) => c.sid)).toEqual([0, 1, 2, 3]);
    expect(r.claims.map((c) => c.ids[0])).toEqual(['src2', 'src3', 'src0', 'src1']);
  });

  it('never puts one citation on two sentences, even when a sentence is repeated', () => {
    const { a, claims } = traced();
    const next = analyse(`${P1}\n\n${P1}\n\n${P2}`);
    const r = reattach(a, claims, next);
    const sids = r.claims.map((c) => c.sid);
    expect(new Set(sids).size).toBe(sids.length);
    expect(r.claims).toHaveLength(4);
    // the copies stay uncited
    expect(r.claims.filter((c) => c.ids[0] === 'src0')).toHaveLength(1);
  });

  it('two claims competing for one reworded sentence: only the closest wins', () => {
    const a = analyse('Cities are warmer than the countryside at night. Cities are warmer than the countryside by day.');
    const claims: Claim[] = a.sentences.map((s) => ({ sid: s.index, text: s.text, ids: [`s${s.index}`], cands: [] }));
    const next = analyse('Cities are warmer than the countryside at night time.');
    const r = reattach(a, claims, next);
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0].ids).toEqual(['s0']);
    expect(r.detached.map((d) => d.ids[0])).toEqual(['s1']);
  });

  it('keeps a hand-picked passage and drops an anchor that no longer fits', () => {
    const a = analyse(DRAFT);
    const claims: Claim[] = [{ sid: 0, text: 'Urban heat islands make cities several degrees warmer', anchor: 'Urban heat islands make cities several degrees warmer', ids: ['x'], cands: [] }];
    const next = analyse(DRAFT.replace('several degrees warmer', 'a few degrees warmer'));
    const r = reattach(a, claims, next);
    expect(r.claims[0].text).toBe('Urban heat islands make cities several degrees warmer');
    expect(r.claims[0].anchor).toBeUndefined();
  });
});
