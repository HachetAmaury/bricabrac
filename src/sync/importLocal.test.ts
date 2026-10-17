import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SaleLine } from '../types';
import { buildImport, clearLegacyData, hasLegacyData, runImport } from './importLocal';
import { LEGACY_KEYS } from '../state/persistence';

const U1 = '11111111-2222-4333-8444-555555555555';
const opts = { catalogId: 'cat-uuid-new', catalogName: 'Catalogue importé', sellerId: 'seller-uuid' };

// Legacy shapes: no catalogId / lockedAt / sellerId.
const legacy = (over: Record<string, unknown> = {}) =>
  ({
    catalog: [{ id: 'eau-cafe', name: 'Eau', price: 100, archived: false, categoryId: 'boissons' }],
    categories: [{ id: 'boissons', name: 'Boissons', color: '#fff' }],
    events: [
      {
        id: 'ev-1',
        name: 'Brocante',
        kind: 'bric-a-brac',
        createdAt: 1_700_000_000_000,
        locked: false,
        enabledItemIds: ['eau-cafe'],
        sales: [
          {
            id: 'sale-1',
            timestamp: 1_700_000_100_000,
            lines: [{ itemId: 'eau-cafe', name: 'Eau', price: 100, qty: 2 }],
            total: 200,
          },
        ],
        ...over,
      },
    ],
  }) as never;

describe('buildImport', () => {
  it('remaps slug ids to UUIDs and keeps references consistent', () => {
    const out = buildImport(legacy(), opts);
    const newId = out.items[0].id;
    expect(newId).not.toBe('eau-cafe');
    expect(newId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(out.eventItems).toEqual([{ event_id: out.events[0].id, item_id: newId }]);
    expect((out.sales[0].lines as unknown as SaleLine[])[0].itemId).toBe(newId);
    expect(out.items[0].category_id).toBe(out.categories[0].id);
    expect(out.categories[0].id).not.toBe('boissons');
    expect(out.sales[0].event_id).toBe(out.events[0].id);
    expect(out.events[0].id).not.toBe('ev-1');
    expect(out.sales[0].id).not.toBe('sale-1');
    expect(out.items[0].catalog_id).toBe(opts.catalogId);
    expect(out.categories[0].catalog_id).toBe(opts.catalogId);
    expect(out.events[0].catalog_id).toBe(opts.catalogId);
    expect(out.catalog).toEqual({ id: opts.catalogId, name: 'Catalogue importé' });
    expect(out.events[0].created_at).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('keeps existing UUID ids', () => {
    const l = legacy();
    (l as { catalog: { id: string }[] }).catalog[0].id = U1;
    (l as { events: { enabledItemIds: string[] }[] }).events[0].enabledItemIds = [U1];
    const out = buildImport(l, opts);
    expect(out.items[0].id).toBe(U1);
    expect(out.eventItems[0].item_id).toBe(U1);
  });

  it('converts locked:true to locked_at and stamps seller_id on every sale', () => {
    const l = legacy({ locked: true });
    (l as { events: { sales: Record<string, unknown>[] }[] }).events[0].sales[0].sellerId = 'someone-else';
    const out = buildImport(l, opts);
    expect(out.events[0].locked_at).toBeNull();
    expect(out.locks).toEqual([{ id: out.events[0].id, locked_at: new Date(1_700_000_000_000).toISOString() }]);
    expect(out.sales.every((s) => s.seller_id === 'seller-uuid')).toBe(true);
    expect('created_by' in out.events[0]).toBe(false);
  });

  it('leaves locked_at null on unlocked events', () => {
    const out = buildImport(legacy(), opts);
    expect(out.events[0].locked_at).toBeNull();
    expect(out.locks).toEqual([]);
  });

  it('drops enabledItemIds that point at unknown items', () => {
    const out = buildImport(legacy({ enabledItemIds: ['eau-cafe', 'ghost'] }), opts);
    expect(out.eventItems).toHaveLength(1);
    expect(out.eventItems[0].item_id).toBe(out.items[0].id);
  });
});

describe('legacy storage', () => {
  beforeEach(() => localStorage.clear());

  it('hasLegacyData is true only when events:list or catalog:items exist', () => {
    expect(hasLegacyData()).toBe(false);
    localStorage.setItem(LEGACY_KEYS.user, '"x"');
    localStorage.setItem(LEGACY_KEYS.categories, '[]');
    expect(hasLegacyData()).toBe(false);
    localStorage.setItem(LEGACY_KEYS.events, '[]');
    expect(hasLegacyData()).toBe(true);
    localStorage.clear();
    localStorage.setItem(LEGACY_KEYS.catalog, '[]');
    expect(hasLegacyData()).toBe(true);
  });

  it('clearLegacyData removes all four keys', () => {
    for (const k of Object.values(LEGACY_KEYS)) localStorage.setItem(k, '1');
    localStorage.setItem('other', '1');
    clearLegacyData();
    for (const k of Object.values(LEGACY_KEYS)) expect(localStorage.getItem(k)).toBeNull();
    expect(localStorage.getItem('other')).toBe('1');
  });
});

describe('runImport', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const k of Object.values(LEGACY_KEYS)) localStorage.setItem(k, '[]');
  });

  const fake = (failOn?: string) => {
    const calls: { table: string; rows: unknown }[] = [];
    const client = {
      from: (table: string) => ({
        insert: vi.fn(async (rows: unknown) => {
          calls.push({ table, rows });
          return { error: table === failOn ? { message: 'boom' } : null };
        }),
        update: (values: unknown) => ({
          eq: async (_c: string, id: string) => {
            calls.push({ table: `update:${table}`, rows: { values, id } });
            return { error: null };
          },
        }),
      }),
    };
    return { client: client as never, calls };
  };

  it('inserts in order and clears keys', async () => {
    const { client, calls } = fake();
    await runImport(client, legacy(), opts);
    expect(calls.map((c) => c.table)).toEqual([
      'catalogs',
      'categories',
      'items',
      'events',
      'event_items',
      'sales',
    ]);
    expect(calls[0].rows).toEqual({ id: opts.catalogId, name: 'Catalogue importé' });
    for (const k of Object.values(LEGACY_KEYS)) expect(localStorage.getItem(k)).toBeNull();
  });

  it('applies locks last, after sales', async () => {
    const { client, calls } = fake();
    await runImport(client, legacy({ locked: true }), opts);
    expect(calls.map((c) => c.table)).toEqual([
      'catalogs', 'categories', 'items', 'events', 'event_items', 'sales', 'update:events',
    ]);
    const ev = (calls[3].rows as { id: string; locked_at: unknown }[])[0];
    expect(ev.locked_at).toBeNull();
    expect(calls[6].rows).toEqual({
      values: { locked_at: new Date(1_700_000_000_000).toISOString() },
      id: ev.id,
    });
  });

  it('chunks sales by 500', async () => {
    const l = legacy();
    const sale = (l as { events: { sales: unknown[] }[] }).events[0].sales[0];
    (l as { events: { sales: unknown[] }[] }).events[0].sales = Array.from({ length: 1001 }, () => sale);
    const { client, calls } = fake();
    await runImport(client, l, opts);
    const sizes = calls.filter((c) => c.table === 'sales').map((c) => (c.rows as unknown[]).length);
    expect(sizes).toEqual([500, 500, 1]);
  });

  it('does not clear keys when an insert fails', async () => {
    const { client, calls } = fake('items');
    await expect(runImport(client, legacy(), opts)).rejects.toBeTruthy();
    expect(calls.map((c) => c.table)).toEqual(['catalogs', 'categories', 'items']);
    for (const k of Object.values(LEGACY_KEYS)) expect(localStorage.getItem(k)).not.toBeNull();
  });
});
