import { describe, it, expect } from 'vitest';
import { parseBackup } from './backup';
import type { Item, Category, SaleEvent } from '../types';

const catalog: Item[] = [{ id: 'i1', name: 'Mug', price: 500, archived: false }];
const categories: Category[] = [{ id: 'c1', name: 'Boissons', color: '#ef4444' }];
const events: SaleEvent[] = [
  { id: 'e1', name: 'Démo', kind: 'autre', createdAt: 1, enabledItemIds: ['i1'], sales: [] }
];

function exportText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: '0.2.0',
    exportedAt: '2026-06-15T00:00:00.000Z',
    catalog,
    categories,
    events,
    ...extra
  });
}

describe('parseBackup', () => {
  it('accepts a well-formed export payload', () => {
    const result = parseBackup(exportText());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.catalog).toEqual(catalog);
      expect(result.data.categories).toEqual(categories);
      expect(result.data.events).toEqual(events);
    }
  });

  it('round-trips the data unchanged', () => {
    const result = parseBackup(exportText());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ catalog, categories, events });
    }
  });

  it('rejects invalid JSON', () => {
    const result = parseBackup('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/);
  });

  it('rejects a non-object payload', () => {
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('42').ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
  });

  it('rejects a payload missing required arrays', () => {
    const result = parseBackup(JSON.stringify({ catalog, categories }));
    expect(result.ok).toBe(false);
  });

  it('rejects items with the wrong shape', () => {
    const result = parseBackup(
      JSON.stringify({ catalog: [{ id: 'x' }], categories, events })
    );
    expect(result.ok).toBe(false);
  });

  it('rejects categories with the wrong shape', () => {
    const result = parseBackup(
      JSON.stringify({ catalog, categories: [{ id: 'x', name: 'y' }], events })
    );
    expect(result.ok).toBe(false);
  });

  it('rejects events with the wrong shape', () => {
    const result = parseBackup(
      JSON.stringify({ catalog, categories, events: [{ id: 'x', name: 'y' }] })
    );
    expect(result.ok).toBe(false);
  });

  it('accepts empty collections', () => {
    const result = parseBackup(JSON.stringify({ catalog: [], categories: [], events: [] }));
    expect(result.ok).toBe(true);
  });
});
