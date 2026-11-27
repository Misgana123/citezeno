import { describe, expect, it } from 'vitest';
import { topWords } from '@/lib/shelf/store/stats';

describe('the words titles use most', () => {
  it('counts each word once per title, skipping short and common words', () => {
    const titles = ['Sleep and memory in rats', 'Sleep, sleep and more sleep: a review', 'Memory of flood risk', 'Self-reported sleep quality'];
    expect(topWords(titles, 3)).toEqual([
      { name: 'sleep', count: 3 },
      { name: 'memory', count: 2 },
      { name: 'flood', count: 1 },
    ]);
    expect(topWords(titles, 50).map((w) => w.name)).toEqual(expect.arrayContaining(['self-reported', 'rats']));
    expect(topWords(titles, 50).map((w) => w.name)).not.toEqual(expect.arrayContaining(['and', 'of', 'review', 'a']));
  });
});
