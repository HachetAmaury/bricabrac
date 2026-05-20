import { uuid } from '../lib/uuid';
import type { Item } from '../types';

export type CatalogAction =
  | { type: 'add'; name: string; price: number }
  | { type: 'edit'; id: string; name: string; price: number }
  | { type: 'archive'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'hydrate'; items: Item[] };

export function catalogReducer(state: Item[], action: CatalogAction): Item[] {
  switch (action.type) {
    case 'add':
      return [...state, { id: uuid(), name: action.name, price: action.price, archived: false }];
    case 'edit': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], name: action.name, price: action.price };
      return next;
    }
    case 'archive': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], archived: true };
      return next;
    }
    case 'restore': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], archived: false };
      return next;
    }
    case 'hydrate':
      return action.items;
  }
}
