import { describe, it, expect } from 'vitest';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import type { Item } from '../types';

const empty: Item[] = [];

describe('catalogReducer', () => {
  it('adds a new item', () => {
    const next = catalogReducer(empty, { type: 'add', name: 'Mug', price: 500 });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Mug', price: 500, archived: false });
    expect(next[0].id).toBeTruthy();
  });

  it('edits an existing item by id', () => {
    const seeded: Item[] = [{ id: 'a', name: 'Old', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'edit', id: 'a', name: 'New', price: 250 });
    expect(next[0]).toMatchObject({ id: 'a', name: 'New', price: 250, archived: false });
  });

  it('archives an item (soft delete)', () => {
    const seeded: Item[] = [{ id: 'a', name: 'X', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'archive', id: 'a' });
    expect(next[0].archived).toBe(true);
  });

  it('restores an archived item', () => {
    const seeded: Item[] = [{ id: 'a', name: 'X', price: 100, archived: true }];
    const next = catalogReducer(seeded, { type: 'restore', id: 'a' });
    expect(next[0].archived).toBe(false);
  });

  it('replaces the entire list (hydrate)', () => {
    const next = catalogReducer(empty, {
      type: 'hydrate',
      items: [{ id: '1', name: 'A', price: 100, archived: false }]
    });
    expect(next).toHaveLength(1);
  });

  it('returns the same state for unknown ids on edit', () => {
    const seeded: Item[] = [{ id: 'a', name: 'X', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'edit', id: 'b', name: 'Y', price: 200 });
    expect(next).toBe(seeded);
  });

  it('accepts the documented action shapes', () => {
    const actions: CatalogAction[] = [
      { type: 'add', name: 'x', price: 1 },
      { type: 'edit', id: 'x', name: 'y', price: 1 },
      { type: 'archive', id: 'x' },
      { type: 'restore', id: 'x' },
      { type: 'hydrate', items: [] }
    ];
    expect(actions.length).toBe(5);
  });
});
