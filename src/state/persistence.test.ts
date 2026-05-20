import { describe, it, expect, beforeEach } from 'vitest';
import { loadJSON, saveJSON } from './persistence';

beforeEach(() => {
  localStorage.clear();
});

describe('saveJSON / loadJSON', () => {
  it('round-trips a value', () => {
    saveJSON('k', { a: 1 });
    expect(loadJSON('k', { a: 0 })).toEqual({ a: 1 });
  });

  it('returns the fallback when nothing is stored', () => {
    expect(loadJSON('missing', 42)).toBe(42);
  });

  it('returns the fallback when stored JSON is corrupt', () => {
    localStorage.setItem('bad', '{not json');
    expect(loadJSON('bad', 'fallback')).toBe('fallback');
  });
});
