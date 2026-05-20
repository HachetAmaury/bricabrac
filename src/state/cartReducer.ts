import type { CartLine } from '../types';

export type CartAction =
  | { type: 'add'; itemId: string }
  | { type: 'remove'; itemId: string }
  | { type: 'dropItem'; itemId: string }
  | { type: 'clear' };

export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const idx = state.findIndex((l) => l.itemId === action.itemId);
      if (idx < 0) return [...state, { itemId: action.itemId, qty: 1 }];
      const next = state.slice();
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    }
    case 'remove': {
      const idx = state.findIndex((l) => l.itemId === action.itemId);
      if (idx < 0) return state;
      const current = state[idx];
      if (current.qty <= 1) return state.filter((_, i) => i !== idx);
      const next = state.slice();
      next[idx] = { ...current, qty: current.qty - 1 };
      return next;
    }
    case 'dropItem':
      return state.filter((l) => l.itemId !== action.itemId);
    case 'clear':
      return [];
  }
}
