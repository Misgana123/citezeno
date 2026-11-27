import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import { readText, textSource } from './text-input';
import { defineTool, tally } from './types';

/* Counting a piece of writing the user brings (a draft, an abstract, a
   chapter): words, sentences, reading time, readability, the phrases it
   repeats, its long sentences, and what changed from an earlier draft. */

const LONG_SENTENCE = 35;
const LISTED_MAX = 10;
const CHANGES_MAX = 20;
const WORDS_PER_MINUTE = 238;
/* sentences compared per draft (the comparison table grows with both lengths) */
const SENTENCES_MAX = 1500;

const COMMON = new Set(
  'a about above after again all also an and any are as at be because been before being below between both but by can could did do does doing during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your'.split(
    ' ',
  ),
);

// abbreviations whose full stop doesn't end a sentence
const ABBREV = /\b(e\.g|i\.e|et al|etc|vs|cf|fig|figs|eq|no|vol|pp|dr|mr|mrs|ms|prof|approx|ca|resp)\./gi;

/* Words, with "e.g." or "U.S." as one word. */
export const wordsOf = (s: string): string[] => s.normalize('NFKC').match(/[\p{L}\p{N}](?:[\p{L}\p{N}'’-]|\.(?=\p{L}))*/gu) ?? [];

export function paragraphsOf(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => wordsOf(p).length > 0);
}

export function sentencesOf(text: string): string[] {
  return paragraphsOf(text).flatMap((p) =>
    p
      .replace(ABBREV, (m) => m.replace(/\./g, '\u0000'))
      .split(/(?<=[.!?…])["”’)\]]*\s+(?=["“‘(\[]?[\p{Lu}\p{N}])/u)
      .map((s) => s.replace(/\u0000/g, '.').trim())
      .filter((s) => wordsOf(s).length > 0),
  );
}

/* Syllables in an English word, by its vowel groups (good enough for a readability score). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/* Most of the words are common English ones: the readability formulas only fit English. */
const looksEnglish = (words: string[]) => words.length >= 30 && words.filter((w) => COMMON.has(w.toLowerCase())).length / words.length > 0.25;

/* Phrases of 3 to 6 words used more than once, longest first; a phrase inside a longer repeated one isn't listed again. */
export function repeatedPhrases(sentences: string[], max = LISTED_MAX): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const w = wordsOf(s).map((x) => x.toLowerCase());
    for (let n = 3; n <= 6; n++) for (let i = 0; i + n <= w.length; i++) {
      const gram = w.slice(i, i + n);
      // phrases made only of common words ("it is one of") say nothing
      if (gram.every((x) => COMMON.has(x))) continue;
      const k = gram.join(' ');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const repeated = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[1] - a[1]);
  const kept: { phrase: string; count: number }[] = [];
  for (const [phrase, count] of repeated) if (!kept.some((k) => k.count >= count && ` ${k.phrase} `.includes(` ${phrase} `))) kept.push({ phrase, count });
  return kept.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length).slice(0, max);
}

export function textStats(text: string) {
  const words = wordsOf(text);
  const sentences = sentencesOf(text);
  const paragraphs = paragraphsOf(text);
  const perSentence = sentences.map((s) => wordsOf(s).length);
  const long = sentences.filter((_, i) => perSentence[i] > LONG_SENTENCE);
  const freq = new Map<string, number>();
  for (const w of words) {
    const k = w.toLowerCase();
    if (k.length > 2 && !COMMON.has(k) && !/^\d+$/.test(k)) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  let readability: { fleschReadingEase: number; gradeLevel: number } | null = null;
  if (sentences.length && looksEnglish(words)) {
    const wps = words.length / sentences.length;
    const spw = words.reduce((n, w) => n + syllables(w), 0) / words.length;
    readability = { fleschReadingEase: round(206.835 - 1.015 * wps - 84.6 * spw), gradeLevel: round(0.39 * wps + 11.8 * spw - 15.59) };
  }
  return {
    words: words.length,
    characters: text.replace(/\s+/g, ' ').trim().length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    averageSentenceWords: sentences.length ? round(words.length / sentences.length) : 0,
    readingMinutes: Math.max(words.length ? 1 : 0, Math.round(words.length / WORDS_PER_MINUTE)),
    readability,
    longSentences: { over: LONG_SENTENCE, count: long.length, examples: long.slice(0, 3).map((s) => clip(s, 240)) },
    topWords: [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, LISTED_MAX)
      .map(([word, count]) => ({ word, count })),
    repeatedPhrases: repeatedPhrases(sentences),
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const norm = (s: string) => wordsOf(s).join(' ').toLowerCase();

/* What changed between two drafts, sentence by sentence (longest common run of sentences). */
export function compareDrafts(before: string, after: string) {
  const a = sentencesOf(before).slice(0, SENTENCES_MAX);
  const b = sentencesOf(after).slice(0, SENTENCES_MAX);
  const na = a.map(norm);
  const nb = b.map(norm);
  // LCS table, one row at a time from the end
  const lcs: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = na[i] === nb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (na[i] === nb[j]) (i++, j++);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  removed.push(...a.slice(i));
  added.push(...b.slice(j));
  const same = lcs[0][0];
  const cut = Math.max(sentencesOf(before).length, sentencesOf(after).length) > SENTENCES_MAX;
  return {
    ...(cut ? { note: `Only the first ${SENTENCES_MAX} sentences of each draft were compared.` } : {}),
    wordsBefore: wordsOf(before).length,
    wordsAfter: wordsOf(after).length,
    sentencesUnchanged: same,
    sentencesRemoved: removed.length,
    sentencesAdded: added.length,
    changedPercent: Math.round((1 - same / Math.max(1, Math.max(a.length, b.length))) * 100),
    removed: removed.slice(0, CHANGES_MAX).map((s) => clip(s, 300)),
    added: added.slice(0, CHANGES_MAX).map((s) => clip(s, 300)),
  };
}

export const textStatsTool = defineTool({
  name: 'text_stats',
  description:
    'Count a piece of writing the user pasted or attached (a draft, an abstract, a chapter): words, characters, sentences, paragraphs, reading time, readability (Flesch reading ease and grade level, English only), long sentences, the most used words and the phrases it repeats. With compareTo (an earlier draft), also lists the sentences added and removed. Report the numbers exactly as returned.',
  input: z.object({ source: textSource, compareTo: textSource.optional().describe('An earlier draft to compare with.') }),
  kind: 'read',
  step: 'read',
  label: (i) => (i.compareTo ? 'Comparing two drafts' : 'Counting the text'),
  done: (i) => (i.compareTo ? { did: 'Compared two drafts' } : { did: 'Counted the text' }),
  async run(ctx, i) {
    const now = await readText(ctx, i.source);
    if (!wordsOf(now.text).length) throw new ShelfError('bad_request', `"${now.name}" has no words to count.`);
    const stats = textStats(now.text);
    if (!i.compareTo) return { result: stats, display: { summary: tally(stats.words, 'word') } };
    const before = await readText(ctx, i.compareTo);
    const changes = compareDrafts(before.text, now.text);
    return { result: { ...stats, changes }, display: { summary: `${changes.changedPercent}% changed` } };
  },
});

export const TEXT_TOOLS = [textStatsTool];
