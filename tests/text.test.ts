import { describe, expect, it } from 'vitest';
import { analyse, chooseClaims, splitSentences } from '@/lib/text';

const draft =
  'Urban areas are often several degrees warmer than the surrounding countryside. This is known as the urban heat island effect. ' +
  'In 2019, global carbon dioxide emissions reached a record 36.4 billion tonnes. What should cities do about it?';

describe('claim detection', () => {
  it('splits sentences', () => {
    expect(splitSentences(draft).sentences.length).toBeGreaterThanOrEqual(4);
  });
  it('ranks factual statements above questions', () => {
    const a = analyse(draft);
    const q = a.sentences.find((s) => s.text.endsWith('?'))!;
    const stat = a.sentences.find((s) => s.text.includes('36.4'))!;
    expect(stat.score ?? 0).toBeGreaterThan(q.score ?? 0);
    const picked = chooseClaims(a.sentences, 2).map((s) => s.text);
    expect(picked).not.toContain(q.text);
  });
});
