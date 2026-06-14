import type { CashCount } from '../types';

// Euro denominations expressed in cents, largest first.
export const DENOMINATIONS: { value: number; kind: 'note' | 'coin' }[] = [
  { value: 50000, kind: 'note' },
  { value: 20000, kind: 'note' },
  { value: 10000, kind: 'note' },
  { value: 5000, kind: 'note' },
  { value: 2000, kind: 'note' },
  { value: 1000, kind: 'note' },
  { value: 500, kind: 'note' },
  { value: 200, kind: 'coin' },
  { value: 100, kind: 'coin' },
  { value: 50, kind: 'coin' },
  { value: 20, kind: 'coin' },
  { value: 10, kind: 'coin' },
  { value: 5, kind: 'coin' },
  { value: 2, kind: 'coin' },
  { value: 1, kind: 'coin' }
];

// Total value (cents) of a denomination count.
export function cashCountTotal(count: CashCount | undefined): number {
  if (!count) return 0;
  return DENOMINATIONS.reduce((acc, d) => acc + d.value * (count[String(d.value)] ?? 0), 0);
}
