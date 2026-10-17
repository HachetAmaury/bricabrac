import { describe, expect, it } from 'vitest';
import type { Category, Catalog, Item, Sale, SaleEvent } from '../types';
import {
  catalogFromRow,
  catalogToRow,
  categoryFromRow,
  categoryToRow,
  eventFromRows,
  eventToRow,
  itemFromRow,
  itemToRow,
  saleFromRow,
  saleToRow,
} from './mappers';

const sale: Sale = {
  id: 's1',
  timestamp: 1760000000000,
  sellerId: 'u1',
  lines: [{ itemId: 'i1', name: 'Crêpe', price: 250, qty: 2 }],
  total: 500,
  cashGiven: 1000,
  change: 500,
};

describe('mappers', () => {
  it('round-trips items', () => {
    const full: Item = { id: 'i1', catalogId: 'c1', name: 'Crêpe', price: 250, archived: false, icon: '🥞', categoryId: 'k1' };
    const bare: Item = { id: 'i2', catalogId: 'c1', name: 'Eau', price: 100, archived: true, categoryId: null };
    expect(itemFromRow({ ...itemToRow(full), created_at: '', updated_at: '' })).toEqual(full);
    expect(itemFromRow({ ...itemToRow(bare), created_at: '', updated_at: '' })).toEqual(bare);
    expect(itemToRow({ ...bare, categoryId: undefined }).category_id).toBeNull();
  });

  it('round-trips categories and catalogs', () => {
    const cat: Category = { id: 'k1', catalogId: 'c1', name: 'Boissons', color: '#ef4444' };
    const catalog: Catalog = { id: 'c1', name: 'Tournoi' };
    expect(categoryFromRow({ ...categoryToRow(cat), created_at: '', updated_at: '' })).toEqual(cat);
    expect(catalogFromRow({ ...catalogToRow(catalog), created_at: '', updated_at: '', created_by: null })).toEqual(catalog);
  });

  it('round-trips sales with and without cash fields', () => {
    expect(saleFromRow({ ...saleToRow(sale, 'e1'), created_at: '' })).toEqual(sale);
    const card: Sale = { id: 's2', timestamp: 1, sellerId: 'u1', lines: [], total: 0 };
    const row = saleToRow(card, 'e1');
    expect(row.cash_given).toBeNull();
    expect(row.event_id).toBe('e1');
    const back = saleFromRow({ ...row, created_at: '' });
    expect(back).toEqual(card);
    expect('cashGiven' in back).toBe(false);
  });

  it('maps a locked event', () => {
    const iso = '2026-10-17T10:00:00.000Z';
    const ev = eventFromRows(
      { id: 'e1', catalog_id: 'c1', name: 'Fête', kind: 'tournoi', created_at: iso, updated_at: iso, created_by: null, locked_at: iso, cash_float: 5000, cash_count: { '500': 2 } },
      ['i1'],
      [sale],
    );
    expect(ev.lockedAt).toBe(Date.parse(iso));
    expect(ev.locked).toBe(true);
    expect(ev.createdAt).toBe(Date.parse(iso));
    expect(ev.cashFloat).toBe(5000);
    expect(ev.cashCount).toEqual({ '500': 2 });
    expect(ev.enabledItemIds).toEqual(['i1']);
    expect(ev.sales).toEqual([sale]);
  });

  it('maps an unlocked event and round-trips it', () => {
    const iso = '2026-10-17T10:00:00.000Z';
    const ev = eventFromRows(
      { id: 'e1', catalog_id: 'c1', name: 'Fête', kind: 'autre', created_at: iso, updated_at: iso, created_by: null, locked_at: null, cash_float: null, cash_count: null },
      [],
      [],
    );
    expect(ev.lockedAt).toBeNull();
    expect(ev.locked).toBe(false);
    expect('cashFloat' in ev).toBe(false);
    const expected: SaleEvent = { id: 'e1', catalogId: 'c1', name: 'Fête', kind: 'autre', createdAt: Date.parse(iso), enabledItemIds: [], sales: [], locked: false, lockedAt: null };
    expect(ev).toEqual(expected);
    const row = eventToRow(ev);
    expect(row.created_at).toBe(iso);
    expect(row.locked_at).toBeNull();
    expect(eventFromRows({ ...row, updated_at: iso }, [], [])).toEqual(ev);
  });
});
