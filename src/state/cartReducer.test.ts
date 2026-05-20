import { describe, it, expect } from 'vitest';
import { cartReducer } from './cartReducer';
import type { CartLine } from '../types';

const empty: CartLine[] = [];

describe('cartReducer', () => {
  it('adds a new line at qty 1', () => {
    expect(cartReducer(empty, { type: 'add', itemId: 'a' })).toEqual([{ itemId: 'a', qty: 1 }]);
  });

  it('increments existing line', () => {
    expect(cartReducer([{ itemId: 'a', qty: 1 }], { type: 'add', itemId: 'a' })).toEqual([
      { itemId: 'a', qty: 2 }
    ]);
  });

  it('decrements existing line', () => {
    expect(cartReducer([{ itemId: 'a', qty: 2 }], { type: 'remove', itemId: 'a' })).toEqual([
      { itemId: 'a', qty: 1 }
    ]);
  });

  it('removes line when qty reaches zero', () => {
    expect(cartReducer([{ itemId: 'a', qty: 1 }], { type: 'remove', itemId: 'a' })).toEqual([]);
  });

  it('remove on missing item is a no-op', () => {
    const state: CartLine[] = [{ itemId: 'a', qty: 1 }];
    expect(cartReducer(state, { type: 'remove', itemId: 'b' })).toBe(state);
  });

  it('clear returns an empty cart', () => {
    expect(cartReducer([{ itemId: 'a', qty: 1 }], { type: 'clear' })).toEqual([]);
  });

  it('dropItem removes any matching line regardless of qty', () => {
    expect(
      cartReducer(
        [
          { itemId: 'a', qty: 5 },
          { itemId: 'b', qty: 2 }
        ],
        { type: 'dropItem', itemId: 'a' }
      )
    ).toEqual([{ itemId: 'b', qty: 2 }]);
  });
});
