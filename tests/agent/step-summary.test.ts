import { describe, expect, it } from 'vitest';
import { tally } from '@/lib/agent/tools/types';

describe('step summaries', () => {
  it('says "No …" for zero, singular for one and plural with separators for more', () => {
    expect(tally(0, 'paper')).toBe('No papers');
    expect(tally(1, 'paper')).toBe('1 paper');
    expect(tally(1240, 'paper')).toBe('1,240 papers');
    expect(tally(0, 'match', 'matches')).toBe('No matches');
    expect(tally(3, 'match', 'matches')).toBe('3 matches');
  });
});
