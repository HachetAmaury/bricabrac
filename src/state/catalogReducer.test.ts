import { describe, it, expect } from 'vitest';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import type { Item } from '../types';

const empty: Item[] = [];

describe('catalogReducer', () => {
  it('adds a new item', () => {
    const next = catalogReducer(empty, { type: 'add', id: 'mug-id', catalogId: 'c1', name: 'Mug', price: 500 });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Mug', price: 500, archived: false });
    expect(next[0]).toMatchObject({ id: 'mug-id', catalogId: 'c1' });
  });

  it('edits an existing item by id', () => {
    const seeded: Item[] = [{ id: 'a', catalogId: 'c1', name: 'Old', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'edit', id: 'a', name: 'New', price: 250 });
    expect(next[0]).toMatchObject({ id: 'a', catalogId: 'c1', name: 'New', price: 250, archived: false });
  });

  it('archives an item (soft delete)', () => {
    const seeded: Item[] = [{ id: 'a', catalogId: 'c1', name: 'X', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'archive', id: 'a' });
    expect(next[0].archived).toBe(true);
  });

  it('restores an archived item', () => {
    const seeded: Item[] = [{ id: 'a', catalogId: 'c1', name: 'X', price: 100, archived: true }];
    const next = catalogReducer(seeded, { type: 'restore', id: 'a' });
    expect(next[0].archived).toBe(false);
  });

  it('replaces the entire list (hydrate)', () => {
    const next = catalogReducer(empty, {
      type: 'hydrate',
      items: [{ id: '1', catalogId: 'c1', name: 'A', price: 100, archived: false }]
    });
    expect(next).toHaveLength(1);
  });

  it('stores icon and categoryId on add', () => {
    const next = catalogReducer(empty, {
      type: 'add',
      id: 'x',
      catalogId: 'c1',
      name: 'Bière',
      price: 300,
      icon: '🍺',
      categoryId: 'cat-drinks'
    });
    expect(next[0]).toMatchObject({ icon: '🍺', categoryId: 'cat-drinks' });
  });

  it('defaults categoryId to null when omitted on add', () => {
    const next = catalogReducer(empty, { type: 'add', id: 'x', catalogId: 'c1', name: 'X', price: 1 });
    expect(next[0].categoryId).toBeNull();
  });

  it('clearCategory unsets categoryId only on matching items', () => {
    const seeded: Item[] = [
      { id: 'a', catalogId: 'c1', name: 'A', price: 1, archived: false, categoryId: 'c1' },
      { id: 'b', catalogId: 'c1', name: 'B', price: 1, archived: false, categoryId: 'c2' }
    ];
    const next = catalogReducer(seeded, { type: 'clearCategory', categoryId: 'c1' });
    expect(next[0].categoryId).toBeNull();
    expect(next[1].categoryId).toBe('c2');
  });

  it('returns the same state for unknown ids on edit', () => {
    const seeded: Item[] = [{ id: 'a', catalogId: 'c1', name: 'X', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'edit', id: 'b', name: 'Y', price: 200 });
    expect(next).toBe(seeded);
  });

  it('accepts the documented action shapes', () => {
    const actions: CatalogAction[] = [
      { type: 'add', id: 'x', catalogId: 'c1', name: 'x', price: 1 },
      { type: 'edit', id: 'x', name: 'y', price: 1 },
      { type: 'archive', id: 'x' },
      { type: 'restore', id: 'x' },
      { type: 'upsert', item: { id: 'x', catalogId: 'c1', name: 'x', price: 1, archived: false } },
      { type: 'remove', id: 'x' },
      { type: 'hydrate', items: [] }
    ];
    expect(actions.length).toBe(7);
  });

  it('upsert inserts a new item and replaces an existing one by id', () => {
    const a: Item = { id: 'a', catalogId: 'c1', name: 'A', price: 1, archived: false };
    const inserted = catalogReducer(empty, { type: 'upsert', item: a });
    expect(inserted).toEqual([a]);
    const replaced = catalogReducer(inserted, { type: 'upsert', item: { ...a, name: 'A2' } });
    expect(replaced).toHaveLength(1);
    expect(replaced[0].name).toBe('A2');
  });

  it('remove filters the item out by id', () => {
    const seeded: Item[] = [
      { id: 'a', catalogId: 'c1', name: 'A', price: 1, archived: false },
      { id: 'b', catalogId: 'c1', name: 'B', price: 1, archived: false }
    ];
    expect(catalogReducer(seeded, { type: 'remove', id: 'a' }).map((i) => i.id)).toEqual(['b']);
  });
});
