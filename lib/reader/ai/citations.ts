/* Checking the AI's passage citations before anything is shown or saved.
   A citation is a passage ID in square brackets after a claim: "… 1,200 nurses [p3-2]."
   (several: [p3-2, p4-1]). Only IDs that were sent may stay:
   - a claim citing only IDs that weren't sent is dropped
   - unknown IDs are removed from a marker
   - an answer left with no valid citation is "not in this paper" */

export const ID_RE = /^p\d{1,5}-\d{1,4}$/;
const MARKER = /\[\s*(p\d{1,5}-\d{1,4}(?:\s*[,;]\s*p\d{1,5}-\d{1,4})*)\s*\]/g;

export const NOT_IN_PAPER = 'This paper doesn’t say.';
/* The AI says this when the passages don't cover the question. */
const SAYS_NOT_COVERED = /\b(this paper|the paper|the passages?)\s+(doesn[’']t|does not|do not|don[’']t)\s+(say|cover|mention|address|discuss|report|state)/i;

export const idsIn = (text: string): string[] => [...text.matchAll(MARKER)].flatMap((m) => m[1].split(/[,;]/).map((s) => s.trim()));

/* Split into sentences, keeping each sentence's trailing citation markers with it. */
export function claims(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?\n]+(?:[.!?]+(?:\s*\[[^\]]*\])*|\n|$)/g;
  for (const m of text.match(re) ?? []) if (m.trim()) out.push(m);
  return out;
}

export type CheckedAnswer = { text: string; passageIds: string[]; dropped: number; notInPaper: boolean };

/* Check a finished answer (or one sentence of a streamed one) against the IDs sent. */
export function checkAnswer(text: string, sent: Set<string>): CheckedAnswer {
  let dropped = 0;
  const kept: string[] = [];
  // paragraph breaks and list lines are kept: check line by line, then sentence by sentence
  const lines = text.split(/(\n+)/);
  for (const line of lines) {
    if (/^\n+$/.test(line)) {
      kept.push(line);
      continue;
    }
    const parts = claims(line);
    const out: string[] = [];
    for (const c of parts) {
      const ids = idsIn(c);
      if (ids.length && !ids.some((id) => sent.has(id))) {
        dropped++;
        continue;
      }
      out.push(c.replace(MARKER, (_m, inner: string) => {
        const valid = inner.split(/[,;]/).map((s) => s.trim()).filter((id) => sent.has(id));
        return valid.length ? `[${valid.join(', ')}]` : '';
      }));
    }
    kept.push(out.join(''));
  }
  const cleaned = kept.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  const passageIds = [...new Set(idsIn(cleaned))];
  const notInPaper = !passageIds.length;
  return { text: notInPaper ? (SAYS_NOT_COVERED.test(cleaned) && cleaned.length < 400 ? cleaned : NOT_IN_PAPER) : cleaned, passageIds, dropped, notInPaper };
}

/* JSON from a model's answer: the first {...} block, code fences ignored. */
export function parseJsonObject(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* One finished sentence of a streamed answer: dropped when it cites only
   unsent passages, unknown IDs removed from its markers. */
export function checkSentence(sentence: string, sent: Set<string>): string {
  const ids = idsIn(sentence);
  if (ids.length && !ids.some((id) => sent.has(id))) return '';
  return sentence.replace(MARKER, (_m, inner: string) => {
    const valid = inner.split(/[,;]/).map((s) => s.trim()).filter((id) => sent.has(id));
    return valid.length ? `[${valid.join(', ')}]` : '';
  });
}

/* Checks a streamed answer sentence by sentence: text is passed on once its
   sentence (and the citation markers after it) is complete. */
export class SentenceGate {
  private buf = '';
  constructor(
    private readonly sent: Set<string>,
    private readonly out: (text: string) => void,
  ) {}
  push(delta: string) {
    this.buf += delta;
    // a sentence ends at . ! ? (plus any markers) followed by space and more text, or at a line break
    const re = /[.!?]+["”’)]*(?:\s*\[[^\]]*\])*(?=\s+\S)|\n/g;
    let end = -1;
    for (let m = re.exec(this.buf); m; m = re.exec(this.buf)) end = m.index + m[0].length;
    if (end <= 0) return;
    const ready = this.buf.slice(0, end);
    this.buf = this.buf.slice(end);
    const checked = ready.split(/(\n)/).map((part) => (part === '\n' ? part : claims(part).map((c) => checkSentence(c, this.sent)).join(''))).join('');
    if (checked) this.out(checked);
  }
  flush() {
    if (this.buf) {
      const checked = claims(this.buf).map((c) => checkSentence(c, this.sent)).join('');
      this.buf = '';
      if (checked) this.out(checked);
    }
  }
}
