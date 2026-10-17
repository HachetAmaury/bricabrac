import type { Category } from '../types';

export type CategoriesAction =
  | { type: 'add'; id: string; catalogId: string; name: string; color: string }
  | { type: 'edit'; id: string; name: string; color: string }
  | { type: 'delete'; id: string }
  | { type: 'upsert'; category: Category }
  | { type: 'remove'; id: string }
  | { type: 'hydrate'; categories: Category[] };

export function categoriesReducer(state: Category[], action: CategoriesAction): Category[] {
  switch (action.type) {
    case 'add':
      return [...state, { id: action.id, catalogId: action.catalogId, name: action.name, color: action.color }];
    case 'edit': {
      const idx = state.findIndex((c) => c.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], name: action.name, color: action.color };
      return next;
    }
    case 'delete':
      return state.filter((c) => c.id !== action.id);
    case 'upsert': {
      const idx = state.findIndex((c) => c.id === action.category.id);
      if (idx < 0) return [...state, action.category];
      const next = state.slice();
      next[idx] = action.category;
      return next;
    }
    case 'remove':
      return state.filter((c) => c.id !== action.id);
    case 'hydrate':
      return action.categories;
  }
}
