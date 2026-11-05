/* Text analysis: sentence splitting, key-phrase extraction and claim scoring. */
import type { Analysis, Sentence, Source } from './types';

const STOP = new Set(
  (
    'a about above after again against all also am an and any are aren as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers herself him himself his how however i if in into is it its itself just let me more most much must my myself no nor not now of off on once only or other ought our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through thus to too under until up upon very via was we were what when where which while who whom why will with within without would you your yours yourself yourselves ' +
    "one two three many may might often also across among around become becomes became make makes made use used uses using new well like way ways able get gets got including include includes based however therefore moreover furthermore although though even yet still since per rather whether either neither every another something anything everything thing things lot lots really quite important significant significantly various several overall generally typically usually increasingly widely particularly especially essential key crucial major plays play played role roles help helps helped need needs needed provide provides provided allow allows allowed according said says say people today world time times year years first last within beyond toward towards etc known seen similar possible remain remains now able shown found can't don't it's"
  ).split(/\s+/),
);

const CITE_CUES =
  /\b(stud(y|ies)|research|evidence|found|finds|show(n|s|ed)?|demonstrat|report(s|ed)?|survey|data|percent|%|according|estimate|increase|decrease|reduc|associated|linked|caus|effect|impact|risk|rate|trial|analysis|analyses|scientists?|researchers?|experts?|measured|observed|proven|suggests?|indicates?|million|billion|century|history|historically|invented|discovered|developed|introduced|established|founded)\b/i;

function stem(w: string): string {
  w = w.toLowerCase();
  if (w.length > 5)
    w = w.replace(
      /(ational|ations?|izations?|ings?|ments?|ness|ities|ity|ically|ical|ally|ies|ied|es|ed|ly|s)$/,
      (m) => (m === 'ies' || m === 'ied' ? 'y' : ''),
    );
  else if (w.length > 3) w = w.replace(/s$/, '');
  return w;
}

export function words(str: string): string[] {
  return str.match(/[A-Za-z][A-Za-z\-']*[A-Za-z]|[A-Za-z]|\d+(?:\.\d+)?%?/g) || [];
}

function contentWords(str: string) {
  return words(str).filter((w) => !STOP.has(w.toLowerCase()) && (w.length > 2 || /\d/.test(w)));
}

export function tokens(str: string): string[] {
  return contentWords(str).filter((w) => !/^\d/.test(w)).map(stem);
}

const ABBR =
  /(?:\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Fig|No|al|approx|ca|U\.S|U\.K|Inc|Ltd|Co|Corp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.)$/i;

export function splitSentences(text: string) {
  const paras = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  const out: Sentence[] = [];
  paras.forEach((para, pi) => {
    const re = /[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g;
    let m: RegExpExecArray | null;
    let buf = '';
    const pieces: string[] = [];
    while ((m = re.exec(para)) !== null) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      buf += m[0];
      const trimmed = buf.trim();
      const next = para.slice(re.lastIndex).trimStart();
      if (
        ABBR.test(trimmed) ||
        /\b[A-Z]\.$/.test(trimmed) ||
        (/\d\.$/.test(trimmed) && /^\d/.test(next)) ||
        (next && /^[a-z]/.test(next))
      ) {
        if (re.lastIndex < para.length) continue;
      }
      if (trimmed) pieces.push(trimmed);
      buf = '';
    }
    if (buf.trim()) pieces.push(buf.trim());
    pieces.forEach((s) => out.push({ text: s, para: pi, index: 0 }));
  });
  out.forEach((s, i) => (s.index = i));
  return { sentences: out, paraCount: paras.length };
}

function weigh(sentences: Sentence[]) {
  const df = new Map<string, number>();
  const tfs = sentences.map((s) => {
    const tf = new Map<string, number>();
    tokens(s.text).forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1));
    return tf;
  });
  const N = sentences.length || 1;
  const idf = (t: string) => Math.log(1 + N / (df.get(t) || 1));
  return { tfs, idf };
}

type W = { w: string; weight: number; pos: number };

function keyPhrases(sentence: string, idf: (t: string) => number, max: number, topicSet: Set<string>) {
  const raw = sentence.replace(/["“”‘’()[\]]/g, ' ');
  const parts = raw.split(/\s+/).filter(Boolean);
  const chunks: W[][] = [];
  let cur: W[] = [];
  const flush = () => {
    if (cur.length) chunks.push(cur);
    cur = [];
  };
  parts.forEach((tok, idx) => {
    const w = tok.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9%]+$/g, '').replace(/'s$/i, '');
    const lw = w.toLowerCase();
    if (!w || STOP.has(lw) || /^\d/.test(w) || (w.length <= 2 && !/^[A-Z]{2}$/.test(w))) {
      flush();
      return;
    }
    let weight = 1 + 0.5 * idf(stem(w)) + Math.min(w.length, 12) / 12 + (topicSet.has(stem(w)) ? 0.6 : 0);
    if (/^[A-Z]{2,}$/.test(w)) weight += 1.2;
    else if (/^[A-Z]/.test(w) && idx > 0) weight += 0.8;
    if (/ly$/i.test(w) && w.length > 4) weight -= 1.4;
    if (/(ing|ed|ise|ize|ises|izes)$/i.test(w) && !/^[A-Z]/.test(w)) weight -= 0.45;
    cur.push({ w, weight, pos: idx });
    if (/[,;:.!?]$/.test(tok)) flush();
  });
  flush();
  const scored = chunks.map((c) => {
    let best = c;
    if (c.length > 4) {
      let bs = -1;
      for (let k = 0; k + 4 <= c.length; k++) {
        const sc = c.slice(k, k + 4).reduce((a, x) => a + x.weight, 0);
        if (sc > bs) {
          bs = sc;
          best = c.slice(k, k + 4);
        }
      }
    }
    const mean = best.reduce((a, x) => a + x.weight, 0) / best.length;
    return { words: best, score: mean * (1 + 0.38 * (best.length - 1)), pos: best[0].pos };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: typeof scored = [];
  let count = 0;
  for (const ch of scored) {
    if (count >= max) break;
    if (count + ch.words.length > max + 1) continue;
    picked.push(ch);
    count += ch.words.length;
  }
  picked.sort((a, b) => a.pos - b.pos);
  return picked.flatMap((ch) => ch.words.map((x) => x.w));
}

function citeworthiness(s: Sentence, tf: Map<string, number>, idf: (t: string) => number) {
  const n = words(s.text).length;
  if (n < 6) return 0;
  let score = 0;
  tf.forEach((c, t) => (score += c * idf(t)));
  score = score / Math.sqrt(n);
  if (CITE_CUES.test(s.text)) score += 1.2;
  if (/\d/.test(s.text)) score += 0.8;
  if (/\?$/.test(s.text)) score -= 1.5;
  if (/^(in conclusion|in summary|overall|ultimately|to sum up|this essay|this article|in this)/i.test(s.text)) score -= 1.2;
  if (/\b(I|we|you|my|our)\b/.test(s.text)) score -= 0.6;
  if (n > 60) score -= 0.5;
  return Math.max(score, 0.01);
}

export function analyse(text: string): Analysis {
  const { sentences, paraCount } = splitSentences(text);
  const { tfs, idf } = weigh(sentences);
  const all = new Map<string, { word: string; c: number }>();
  sentences.forEach((s) =>
    contentWords(s.text).forEach((w) => {
      if (/^\d/.test(w)) return;
      const k = stem(w);
      const e = all.get(k) || { word: w, c: 0 };
      e.c++;
      all.set(k, e);
    }),
  );
  const top = [...all.entries()].filter(([, e]) => e.c > 1).sort((a, b) => b[1].c - a[1].c).slice(0, 6);
  const topicSet = new Set(top.map(([k]) => k));
  sentences.forEach((s, i) => {
    s.tokens = new Set(tokens(s.text));
    s.score = citeworthiness(s, tfs[i], idf);
    s.keywords = keyPhrases(s.text, idf, 6, topicSet);
    s.query = s.keywords.join(' ');
  });
  return { sentences, paraCount, topic: top.map(([, e]) => e.word.toLowerCase()), wordCount: words(text).length };
}

export const isEligible = (s: Sentence) => (s.score || 0) > 0.3 && (s.keywords || []).length >= 2;

export function chooseClaims(sentences: Sentence[], k: number): Sentence[] {
  const eligible = sentences.filter(isEligible);
  if (!eligible.length) return sentences.filter((s) => (s.keywords || []).length).slice(0, k);
  if (eligible.length <= k) return eligible;
  const picked: Sentence[] = [];
  const pool = eligible.slice();
  while (picked.length < k && pool.length) {
    let best: Sentence = pool[0];
    let bestVal = -Infinity;
    for (const s of pool) {
      const nearest = picked.length ? Math.min(...picked.map((p) => Math.abs(p.index - s.index))) : 99;
      const val = (s.score || 0) - (nearest === 0 ? 99 : nearest === 1 ? 0.6 : 0);
      if (val > bestVal) {
        bestVal = val;
        best = s;
      }
    }
    picked.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return picked.sort((a, b) => a.index - b.index);
}

/* How well a candidate source matches a claim (0–1).
   Rewards shared terms in the title, shared two-word phrases, how much of the claim
   it covers, and how well it fits the topic of the whole draft. */
export function relevance(claimTokens: Set<string>, src: Source, ctx?: { claimText?: string; topic?: Set<string> }): number {
  const titleSeq = tokens(src.title || '');
  const bodySeq = tokens((src.abstract || '') + ' ' + (src.keywords || []).join(' '));
  const titleT = new Set(titleSeq);
  const absT = new Set(bodySeq);
  let hitT = 0;
  let hitA = 0;
  claimTokens.forEach((t) => {
    if (titleT.has(t)) hitT++;
    else if (absT.has(t)) hitA++;
  });
  const denom = Math.max(3, Math.min(claimTokens.size, 10));
  let s = (hitT * 1.5 + hitA * 0.7) / denom;

  // coverage: a good source shares several distinct terms with the claim
  const matched = hitT + hitA;
  if (claimTokens.size >= 3 && matched < 2) s *= 0.45;
  else if (claimTokens.size >= 5 && matched < 3) s *= 0.75;

  // phrase matches: adjacent claim terms that also appear next to each other in the source
  if (ctx && ctx.claimText) {
    const cl = tokens(ctx.claimText);
    const pairs = new Set<string>();
    for (let i = 0; i + 1 < cl.length; i++) pairs.add(cl[i] + ' ' + cl[i + 1]);
    const srcPairs = new Set<string>();
    [titleSeq, bodySeq].forEach((seq) => {
      for (let i = 0; i + 1 < seq.length; i++) srcPairs.add(seq[i] + ' ' + seq[i + 1]);
    });
    let ph = 0;
    pairs.forEach((p) => srcPairs.has(p) && ph++);
    s += Math.min(0.27, ph * 0.09);
  }

  // topic fit: the source should belong to the subject of the whole draft
  if (ctx && ctx.topic && ctx.topic.size) {
    let tf = 0;
    ctx.topic.forEach((t) => (titleT.has(t) || absT.has(t)) && tf++);
    const frac = tf / ctx.topic.size;
    s += 0.16 * frac;
    if (frac === 0) s -= 0.08;
  }

  if (titleT.size && hitT / titleT.size > 0.5) s += 0.1;
  s += Math.min(0.15, Math.log10((src.citedBy || 0) + 1) * 0.04);
  if (!src.abstract) s -= 0.04;
  if (!src.authors || !src.authors.length) s -= 0.08;
  if (!src.year) s -= 0.1;
  return Math.max(0, Math.min(1, s));
}

/* Stemmed terms that describe the draft as a whole. */
export function topicTokens(analysis: Analysis): Set<string> {
  return new Set(analysis.topic.map((w) => tokens(w)[0]).filter(Boolean).slice(0, 5));
}

export type Span = { start: number; end: number; index: number };

/* Character ranges of each analysed sentence within the raw text. */
export function locate(value: string, sentences: Sentence[]): Span[] {
  const out: Span[] = [];
  let cursor = 0;
  for (const s of sentences) {
    const re = new RegExp(s.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g');
    re.lastIndex = cursor;
    const m = re.exec(value);
    if (!m) continue;
    out.push({ start: m.index, end: m.index + m[0].length, index: s.index });
    cursor = m.index + m[0].length;
  }
  return out;
}

/* Search keywords for a passage the user picked by hand. */
export function keywordsFor(passage: string): string[] {
  const a = analyse(passage);
  const ranked = a.sentences.slice().sort((x, y) => (y.score || 0) - (x.score || 0));
  const out: string[] = [];
  for (const s of ranked) for (const k of s.keywords || []) if (!out.includes(k) && out.length < 6) out.push(k);
  if (out.length < 2) {
    contentWords(passage).forEach((w) => {
      if (out.length < 6 && !out.includes(w) && !/^\d/.test(w)) out.push(w);
    });
  }
  return out;
}
