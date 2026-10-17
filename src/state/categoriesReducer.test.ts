import { describe, it, expect } from 'vitest';
import { categoriesReducer } from './categoriesReducer';
import type { Category } from '../types';

describe('categoriesReducer', () => {
  it('adds a category with the given id', () => {
    const next = categoriesReducer([], { type: 'add', id: 'cat-id', catalogId: 'c1', name: 'Boissons', color: '#3b82f6' });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Boissons', color: '#3b82f6' });
    expect(next[0]).toMatchObject({ id: 'cat-id', catalogId: 'c1' });
  });

  it('edits name and color by id', () => {
    const seeded: Category[] = [{ id: 'c1', catalogId: 'k', name: 'Old', color: '#000000' }];
    const next = categoriesReducer(seeded, { type: 'edit', id: 'c1', name: 'New', color: '#ffffff' });
    expect(next[0]).toEqual({ id: 'c1', catalogId: 'k', name: 'New', color: '#ffffff' });
  });

  it('edit on unknown id is a no-op', () => {
    const seeded: Category[] = [{ id: 'c1', catalogId: 'k', name: 'A', color: '#000000' }];
    const next = categoriesReducer(seeded, { type: 'edit', id: 'x', name: 'B', color: '#fff' });
    expect(next).toBe(seeded);
  });

  it('deletes a category by id', () => {
    const seeded: Category[] = [
      { id: 'c1', catalogId: 'k', name: 'A', color: '#111' },
      { id: 'c2', catalogId: 'k', name: 'B', color: '#222' }
    ];
    const next = categoriesReducer(seeded, { type: 'delete', id: 'c1' });
    expect(next.map((c) => c.id)).toEqual(['c2']);
  });

  it('hydrates from persisted state', () => {
    const next = categoriesReducer([], {
      type: 'hydrate',
      categories: [{ id: 'c1', catalogId: 'k', name: 'A', color: '#111' }]
    });
    expect(next).toHaveLength(1);
  });

  it('upsert inserts or replaces by id', () => {
    const c: Category = { id: 'c1', catalogId: 'k', name: 'A', color: '#111' };
    const inserted = categoriesReducer([], { type: 'upsert', category: c });
    expect(inserted).toEqual([c]);
    const replaced = categoriesReducer(inserted, { type: 'upsert', category: { ...c, name: 'B' } });
    expect(replaced).toHaveLength(1);
    expect(replaced[0].name).toBe('B');
  });

  it('remove filters by id', () => {
    const seeded: Category[] = [
      { id: 'c1', catalogId: 'k', name: 'A', color: '#111' },
      { id: 'c2', catalogId: 'k', name: 'B', color: '#222' }
    ];
    expect(categoriesReducer(seeded, { type: 'remove', id: 'c1' }).map((c) => c.id)).toEqual(['c2']);
  });
});
