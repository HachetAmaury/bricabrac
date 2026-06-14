import { describe, it, expect } from 'vitest';
import { categoriesReducer } from './categoriesReducer';
import type { Category } from '../types';

describe('categoriesReducer', () => {
  it('adds a category with a generated id', () => {
    const next = categoriesReducer([], { type: 'add', name: 'Boissons', color: '#3b82f6' });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Boissons', color: '#3b82f6' });
    expect(next[0].id).toBeTruthy();
  });

  it('edits name and color by id', () => {
    const seeded: Category[] = [{ id: 'c1', name: 'Old', color: '#000000' }];
    const next = categoriesReducer(seeded, { type: 'edit', id: 'c1', name: 'New', color: '#ffffff' });
    expect(next[0]).toEqual({ id: 'c1', name: 'New', color: '#ffffff' });
  });

  it('edit on unknown id is a no-op', () => {
    const seeded: Category[] = [{ id: 'c1', name: 'A', color: '#000000' }];
    const next = categoriesReducer(seeded, { type: 'edit', id: 'x', name: 'B', color: '#fff' });
    expect(next).toBe(seeded);
  });

  it('deletes a category by id', () => {
    const seeded: Category[] = [
      { id: 'c1', name: 'A', color: '#111' },
      { id: 'c2', name: 'B', color: '#222' }
    ];
    const next = categoriesReducer(seeded, { type: 'delete', id: 'c1' });
    expect(next.map((c) => c.id)).toEqual(['c2']);
  });

  it('hydrates from persisted state', () => {
    const next = categoriesReducer([], {
      type: 'hydrate',
      categories: [{ id: 'c1', name: 'A', color: '#111' }]
    });
    expect(next).toHaveLength(1);
  });
});
