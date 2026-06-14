import { describe, it, expect } from 'vitest';
import { DENOMINATIONS, cashCountTotal } from './cash';

describe('cashCountTotal', () => {
  it('returns 0 for undefined or empty', () => {
    expect(cashCountTotal(undefined)).toBe(0);
    expect(cashCountTotal({})).toBe(0);
  });

  it('sums notes and coins by denomination value (cents)', () => {
    // three 50€ notes + two 2€ coins + five 10c coins = 15000 + 400 + 50
    expect(cashCountTotal({ '5000': 3, '200': 2, '10': 5 })).toBe(15450);
  });

  it('ignores unknown denomination keys', () => {
    expect(cashCountTotal({ '9999': 4 })).toBe(0);
  });

  it('covers every euro denomination from 500€ down to 1c', () => {
    expect(DENOMINATIONS.map((d) => d.value)).toEqual([
      50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1
    ]);
  });
});
