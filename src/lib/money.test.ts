import { describe, it, expect } from 'vitest';
import { formatCents, parseAmount, addCents, sumLines } from './money';

describe('formatCents', () => {
  it('formats whole euros', () => {
    expect(formatCents(500)).toBe('5,00 €');
  });
  it('formats sub-euro values', () => {
    expect(formatCents(42)).toBe('0,42 €');
  });
  it('formats large values', () => {
    expect(formatCents(123456)).toBe('1234,56 €');
  });
  it('handles zero', () => {
    expect(formatCents(0)).toBe('0,00 €');
  });
  it('handles negative values', () => {
    expect(formatCents(-150)).toBe('-1,50 €');
  });
});

describe('parseAmount', () => {
  it('parses "5"', () => {
    expect(parseAmount('5')).toBe(500);
  });
  it('parses "5,50"', () => {
    expect(parseAmount('5,50')).toBe(550);
  });
  it('parses "5.50"', () => {
    expect(parseAmount('5.50')).toBe(550);
  });
  it('parses "0,05"', () => {
    expect(parseAmount('0,05')).toBe(5);
  });
  it('returns null for empty', () => {
    expect(parseAmount('')).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(parseAmount('abc')).toBeNull();
  });
  it('truncates (not rounds) "1,234" to 123 cents', () => {
    expect(parseAmount('1,234')).toBe(123);
  });
});

describe('addCents', () => {
  it('adds two values', () => {
    expect(addCents(100, 250)).toBe(350);
  });
});

describe('sumLines', () => {
  it('sums price*qty across lines', () => {
    expect(
      sumLines([
        { price: 500, qty: 2 },
        { price: 150, qty: 3 }
      ])
    ).toBe(1450);
  });
  it('returns 0 for empty array', () => {
    expect(sumLines([])).toBe(0);
  });
});

describe('formatCents (edge cases)', () => {
  it('returns em-dash for NaN', () => {
    expect(formatCents(Number.NaN)).toBe('—');
  });
  it('returns em-dash for Infinity', () => {
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('parseAmount (edge cases)', () => {
  it('parses smallest cent "0,01"', () => {
    expect(parseAmount('0,01')).toBe(1);
  });
  it('trims surrounding whitespace', () => {
    expect(parseAmount('  5,50  ')).toBe(550);
  });
  it('rejects leading decimal ".5"', () => {
    expect(parseAmount('.5')).toBeNull();
  });
  it('rejects trailing decimal "5."', () => {
    expect(parseAmount('5.')).toBeNull();
  });
  it('rejects thousands separator "1 000,00"', () => {
    expect(parseAmount('1 000,00')).toBeNull();
  });
  it('rejects negative "-5"', () => {
    expect(parseAmount('-5')).toBeNull();
  });
  it('rejects negative "-5,50"', () => {
    expect(parseAmount('-5,50')).toBeNull();
  });
  it('truncates (not rounds) "1,235" to 123 cents', () => {
    expect(parseAmount('1,235')).toBe(123);
  });
  it('parses no float drift at "0,29"', () => {
    expect(parseAmount('0,29')).toBe(29);
  });
  it('parses no float drift at "1,05"', () => {
    expect(parseAmount('1,05')).toBe(105);
  });
  it('parses no float drift at "2,05"', () => {
    expect(parseAmount('2,05')).toBe(205);
  });
});
