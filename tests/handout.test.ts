import { describe, expect, it } from 'vitest';
import { MAX_CLAIMS, SHARED_SOURCE_THRESHOLD, TraceError, assignSources, attachToSentence, pickedClaims, render, reattachDetached, removeDetached, sharedSourceMin, sharedWith, trace } from '@/lib/engine';
import { analyse, chooseClaims } from '@/lib/text';
import { DEFAULT_PREFS, type Candidate, type Result } from '@/lib/types';
import { alt, makeResult } from './fixtures/trace';

const c = (id: string, score: number): Candidate => ({ id, score });

describe('shared sources (one source for two claims)', () => {
  it('has one named threshold', () => {
    expect(SHARED_SOURCE_THRESHOLD).toEqual({ minScore: 0.55, aboveStrictness: 0.15 });
    expect(sharedSourceMin(0.22)).toBe(0.55);
    expect(sharedSourceMin(0.5)).toBeCloseTo(0.65);
  });

  it('first gives every claim its best unused source, exactly as before', () => {
    // both claims like A best; claim 1 gets B, its best unused
    const out = assignSources([[c('A', 0.9), c('B', 0.4)], [c('A', 0.5), c('B', 0.45)]], 2, 0.22);
    expect(out).toEqual([['A'], ['B']]);
  });

  it('reuses a source only on a strong match for the second claim', () => {
    // A is 0.7 for claim 1: above 0.55 and 0.15 over strictness 0.22 → shared
    let out = assignSources([[c('A', 0.9)], [c('A', 0.7), c('B', 0.3)]], 2, 0.22);
    expect(out).toEqual([['A'], ['B', 'A']]);
    // 0.54 is not enough
    out = assignSources([[c('A', 0.9)], [c('A', 0.54), c('B', 0.3)]], 2, 0.22);
    expect(out).toEqual([['A'], ['B']]);
    // with strictness 0.45 the bar is 0.60
    out = assignSources([[c('A', 0.9)], [c('A', 0.58)]], 2, 0.45);
    expect(out).toEqual([['A'], []]);
    out = assignSources([[c('A', 0.9)], [c('A', 0.61)]], 2, 0.45);
    expect(out).toEqual([['A'], ['A']]);
  });

  it('adds at most one shared source per claim and never over four sources', () => {
    const out = assignSources([[c('A', 0.9)], [c('B', 0.9)], [c('A', 0.8), c('B', 0.79), c('C', 0.3)]], 3, 0.22);
    expect(out[2]).toEqual(['C', 'A']);
    const full = assignSources([[c('A', 0.9)], [c('B', 0.9), c('C', 0.8), c('D', 0.7), c('E', 0.6), c('A', 0.85)]], 5, 0.22);
    expect(full[1]).toHaveLength(4);
    expect(full[1]).not.toContain('A');
  });

  it('a shared source is listed once, keeps one number and uses short notes on repeats', () => {
    const r = makeResult();
    const oke = r.claims[0].ids[0];
    const shared: Result = { ...r, claims: [r.claims[0], { ...r.claims[1], ids: [...r.claims[1].ids, oke] }] };
    expect(sharedWith(shared, oke)).toBe(2);

    const ieee = render(shared, 'ieee', 'intext', {});
    expect(ieee.list).toHaveLength(2);
    expect(ieee.refPlain.match(/energetic basis/g)).toHaveLength(1);
    expect(ieee.docPlain).toMatch(/countryside around them \[1\]/);
    expect(ieee.docPlain).toMatch(/reflective roofs \[1\], \[2\]/);
    for (const id of ['vancouver', 'ama', 'acs', 'cse']) expect(render(shared, id, 'intext', {}).list).toHaveLength(2);

    const chicago = render(shared, 'chicago', 'footnotes', {});
    const notes = chicago.docPlain.split('Footnotes')[1].split('Bibliography')[0];
    const full = notes.match(/^1\. .*$/m)![0];
    const repeat = notes.match(/^2\. .*$/m)![0];
    expect(full).toContain('“The energetic basis of the urban heat island,” Quarterly Journal');
    // the second note cites Oke again in the short form
    expect(repeat).toMatch(/; Oke, “The energetic basis of\.”$/);
    expect(repeat.match(/Quarterly Journal/g)).toBeNull();
  });
});

describe('picked sentences', () => {
  const text = 'Urban heat islands make cities several degrees warmer than the countryside. I like trees. Street trees can lower surface temperatures by up to twelve degrees in summer. It is hot.';
  const a = analyse(text);

  it('uses exactly the sentences picked, in draft order', () => {
    const p = pickedClaims(a, [2, 0]);
    expect(p.map((s) => s.index)).toEqual([0, 2]);
  });

  it('a sentence the scorer skipped still gets search words', () => {
    const skipped = a.sentences[1];
    expect(chooseClaims(a.sentences, 10).map((s) => s.index)).not.toContain(1);
    const p = pickedClaims(a, [1]);
    expect(p).toHaveLength(1);
    expect(p[0].text).toBe(skipped.text);
    expect((p[0].keywords || []).length).toBeGreaterThan(0);
  });

  it('refuses no picks or more than the maximum before charging anything', async () => {
    let charged = 0;
    const ev = { step: () => {}, progress: () => {}, log: () => {}, isCancelled: () => false, charge: async (n: number) => void (charged += n) };
    await expect(trace(text, DEFAULT_PREFS, {}, ev, [])).rejects.toBeInstanceOf(TraceError);
    const many = Array.from({ length: MAX_CLAIMS + 1 }, (_, i) => i);
    await expect(trace(text, DEFAULT_PREFS, {}, ev, many)).rejects.toThrow(`at most ${MAX_CLAIMS}`);
    expect(MAX_CLAIMS).toBe(40);
    expect(charged).toBe(0);
  });

  it('charges one credit per picked claim, through the existing charge hook', async () => {
    const charged: number[] = [];
    const ev = {
      step: () => {}, progress: () => {}, log: () => {}, isCancelled: () => false,
      // stop right after charging: this test never searches
      charge: async (n: number) => {
        charged.push(n);
        throw new Error('stop');
      },
    };
    await expect(trace(text, DEFAULT_PREFS, {}, ev, [0, 1, 2])).rejects.toThrow('stop');
    expect(charged).toEqual([3]);
  });
});

describe('detached citations', () => {
  it('can be re-attached to any sentence or removed', () => {
    const r = makeResult();
    const det: Result = { ...r, claims: [r.claims[0]], detached: [{ ...r.claims[1], was: 'An older sentence.' }] };
    const back = reattachDetached(det, 0, 0);
    expect(back.detached).toBeUndefined();
    expect(back.claims).toHaveLength(1);
    expect(back.claims[0].ids).toEqual([r.claims[0].ids[0], r.claims[1].ids[0]]);
    const onNew = reattachDetached(det, 0, 1);
    expect(onNew.claims.map((x) => x.sid)).toEqual([0, 1]);
    expect(removeDetached(det, 0).detached).toBeUndefined();
    expect(removeDetached(det, 0).claims).toHaveLength(1);
  });

  it('attaching a source to a sentence without a claim creates one', () => {
    const r = makeResult();
    const bare: Result = { ...r, claims: [r.claims[0]] };
    const { result, added } = attachToSentence(bare, [alt().id!], 1);
    expect(added).toBe(1);
    expect(result.claims.find((x) => x.sid === 1)!.ids).toEqual([alt().id]);
    // attaching the same source again changes nothing
    expect(attachToSentence(result, [alt().id!], 1).added).toBe(0);
  });
});
