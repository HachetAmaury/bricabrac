import { uuid } from '../lib/uuid';
import type { Item } from '../types';

export type CatalogAction =
  | { type: 'add'; name: string; price: number; icon?: string; categoryId?: string | null }
  | { type: 'edit'; id: string; name: string; price: number; icon?: string; categoryId?: string | null }
  | { type: 'archive'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'clearCategory'; categoryId: string }
  | { type: 'hydrate'; items: Item[] };

export function catalogReducer(state: Item[], action: CatalogAction): Item[] {
  switch (action.type) {
    case 'add':
      return [
        ...state,
        {
          id: uuid(),
          name: action.name,
          price: action.price,
          archived: false,
          icon: action.icon,
          categoryId: action.categoryId ?? null
        }
      ];
    case 'edit': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = {
        ...next[idx],
        name: action.name,
        price: action.price,
        icon: action.icon,
        categoryId: action.categoryId ?? null
      };
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
    case 'clearCategory':
      return state.map((i) => (i.categoryId === action.categoryId ? { ...i, categoryId: null } : i));
    case 'hydrate':
      return action.items;
  }
}
