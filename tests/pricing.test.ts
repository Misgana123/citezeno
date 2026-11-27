import { describe, expect, it } from 'vitest';
import { creditsForCost } from '@/lib/pricing';

describe('cost to credits', () => {
  it('charges nothing for nothing', () => {
    expect(creditsForCost(0)).toBe(0);
    expect(creditsForCost(-1)).toBe(0);
    expect(creditsForCost(Number.NaN)).toBe(0);
  });
  it('charges at least one credit for anything that cost money', () => {
    expect(creditsForCost(0.000001)).toBe(1);
    expect(creditsForCost(0.003)).toBe(1);
  });
  it('rounds up at $0.003 a credit, ignoring floating-point noise', () => {
    expect(creditsForCost(0.0030001)).toBe(2);
    expect(creditsForCost(0.006000000000001)).toBe(2);
    expect(creditsForCost(0.008)).toBe(3);
    expect(creditsForCost(0.1)).toBe(34);
  });
});
