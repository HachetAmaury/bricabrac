import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import type { Category, Item, Sale, SaleEvent } from '../types';
import { mirrorCatalog, mirrorCategories, mirrorEvents } from './writes';
import { createOutbox, OutboxOfflineError } from './outbox';
import type { EventsAction } from '../state/eventsReducer';

type Call = { table: string; method: string; args: unknown[] };

function fakeClient(error: unknown = null) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['upsert', 'update', 'delete', 'insert', 'eq', 'select']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error }).then(resolve, reject);
    return chain;
  });
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, calls, from };
}

const item: Item = { id: 'i1', catalogId: 'c1', name: 'Crêpe', price: 250, archived: false, categoryId: null };
const category: Category = { id: 'k1', catalogId: 'c1', name: 'Sucré', color: '#ef4444' };
const sale: Sale = {
  id: 's1',
  sellerId: 'u1',
  timestamp: 1000,
  lines: [{ itemId: 'i1', name: 'Crêpe', price: 250, qty: 2 }],
  total: 500,
  cashGiven: 1000,
  change: 500,
};
const event: SaleEvent = {
  id: 'e1',
  catalogId: 'c1',
  name: 'Tournoi',
  kind: 'tournoi',
  createdAt: Date.UTC(2026, 9, 17),
  enabledItemIds: ['i1'],
  sales: [sale],
  locked: false,
  lockedAt: null,
};

describe('mirrorCatalog', () => {
  it('catalog edit upserts the edited row', async () => {
    const { client, calls } = fakeClient();
    const edited = { ...item, name: 'Gaufre', price: 300 };
    await mirrorCatalog(client, { type: 'edit', id: 'i1', name: 'Gaufre', price: 300 }, [edited]);
    expect(calls).toEqual([
      {
        table: 'items',
        method: 'upsert',
        args: [{ id: 'i1', catalog_id: 'c1', name: 'Gaufre', price: 300, archived: false, icon: null, category_id: null }],
      },
    ]);
  });

  it('archive upserts the row with archived true', async () => {
    const { client, calls } = fakeClient();
    await mirrorCatalog(client, { type: 'archive', id: 'i1' }, [{ ...item, archived: true }]);
    expect(calls).toEqual([
      { table: 'items', method: 'upsert', args: [expect.objectContaining({ id: 'i1', archived: true })] },
    ]);
  });

  it('clearCategory nulls category_id on matching items', async () => {
    const { client, calls } = fakeClient();
    await mirrorCatalog(client, { type: 'clearCategory', categoryId: 'k1' }, [item]);
    expect(calls).toEqual([
      { table: 'items', method: 'update', args: [{ category_id: null }] },
      { table: 'items', method: 'eq', args: ['category_id', 'k1'] },
    ]);
  });

  it('hydrate does not touch the client', async () => {
    const { client, from } = fakeClient();
    await mirrorCatalog(client, { type: 'hydrate', items: [item] }, [item]);
    await mirrorCatalog(client, { type: 'upsert', item }, [item]);
    await mirrorCatalog(client, { type: 'remove', id: 'i1' }, []);
    await mirrorCategories(client, { type: 'hydrate', categories: [category] }, [category]);
    await mirrorEvents(client, { type: 'hydrate', events: [event] }, [event]);
    await mirrorEvents(client, { type: 'setEnabledItems', eventId: 'e1', itemIds: [] }, [event]);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects when the client returns an error', async () => {
    const { client } = fakeClient({ message: 'boom' });
    await expect(
      mirrorCatalog(client, { type: 'restore', id: 'i1' }, [item]),
    ).rejects.toEqual({ message: 'boom' });
  });
});

describe('mirrorCategories', () => {
  it('add upserts the category row', async () => {
    const { client, calls } = fakeClient();
    await mirrorCategories(client, { type: 'add', id: 'k1', catalogId: 'c1', name: 'Sucré', color: '#ef4444' }, [category]);
    expect(calls).toEqual([
      { table: 'categories', method: 'upsert', args: [{ id: 'k1', catalog_id: 'c1', name: 'Sucré', color: '#ef4444' }] },
    ]);
  });

  it('delete deletes by id', async () => {
    const { client, calls } = fakeClient();
    await mirrorCategories(client, { type: 'delete', id: 'k1' }, []);
    expect(calls).toEqual([
      { table: 'categories', method: 'delete', args: [] },
      { table: 'categories', method: 'eq', args: ['id', 'k1'] },
    ]);
  });
});

describe('mirrorEvents', () => {
  it('create inserts the event row then its event_items', async () => {
    const { client, calls } = fakeClient();
    const created = { ...event, sales: [] };
    await mirrorEvents(
      client,
      { type: 'create', id: 'e1', catalogId: 'c1', name: 'Tournoi', kind: 'tournoi', enabledItemIds: ['i1'], createdAt: event.createdAt },
      [created],
    );
    expect(calls).toEqual([
      {
        table: 'events',
        method: 'insert',
        args: [
          {
            id: 'e1',
            catalog_id: 'c1',
            name: 'Tournoi',
            kind: 'tournoi',
            created_at: '2026-10-17T00:00:00.000Z',
            locked_at: null,
            cash_float: null,
            cash_count: null,
          },
        ],
      },
      { table: 'event_items', method: 'insert', args: [[{ event_id: 'e1', item_id: 'i1' }]] },
    ]);
  });

  it('create with no enabled items skips event_items', async () => {
    const { client, calls } = fakeClient();
    await mirrorEvents(
      client,
      { type: 'create', id: 'e1', catalogId: 'c1', name: 'Tournoi', kind: 'tournoi', enabledItemIds: [], createdAt: event.createdAt },
      [{ ...event, enabledItemIds: [], sales: [] }],
    );
    expect(calls.map((c) => c.table)).toEqual(['events']);
  });

  it('toggleItem inserts when the item was disabled', async () => {
    const { client, calls } = fakeClient();
    // State AFTER the toggle: i1 is now enabled.
    await mirrorEvents(client, { type: 'toggleItem', eventId: 'e1', itemId: 'i1' }, [event]);
    expect(calls).toEqual([
      { table: 'event_items', method: 'insert', args: [{ event_id: 'e1', item_id: 'i1' }] },
    ]);
  });

  it('toggleItem deletes when the item was enabled', async () => {
    const { client, calls } = fakeClient();
    // State AFTER the toggle: i1 is no longer enabled.
    await mirrorEvents(client, { type: 'toggleItem', eventId: 'e1', itemId: 'i1' }, [{ ...event, enabledItemIds: [] }]);
    expect(calls).toEqual([
      { table: 'event_items', method: 'delete', args: [] },
      { table: 'event_items', method: 'eq', args: ['event_id', 'e1'] },
      { table: 'event_items', method: 'eq', args: ['item_id', 'i1'] },
    ]);
  });

  it('setLocked writes locked_at as ISO string', async () => {
    const { client, calls } = fakeClient();
    const at = Date.UTC(2026, 9, 17, 18, 30);
    await mirrorEvents(client, { type: 'setLocked', id: 'e1', lockedAt: at }, [{ ...event, locked: true, lockedAt: at }]);
    expect(calls).toEqual([
      { table: 'events', method: 'update', args: [{ locked_at: '2026-10-17T18:30:00.000Z' }] },
      { table: 'events', method: 'eq', args: ['id', 'e1'] },
    ]);
  });

  it('setLocked null writes locked_at null', async () => {
    const { client, calls } = fakeClient();
    await mirrorEvents(client, { type: 'setLocked', id: 'e1', lockedAt: null }, [event]);
    expect(calls[0]).toEqual({ table: 'events', method: 'update', args: [{ locked_at: null }] });
  });

  it('rename, setCashFloat and setCashCount update only their column', async () => {
    const { client, calls } = fakeClient();
    await mirrorEvents(client, { type: 'rename', id: 'e1', name: 'Finale' }, [{ ...event, name: 'Finale' }]);
    await mirrorEvents(client, { type: 'setCashFloat', id: 'e1', cashFloat: 5000 }, [event]);
    await mirrorEvents(client, { type: 'setCashCount', id: 'e1', cashCount: { '500': 2 } }, [event]);
    expect(calls.filter((c) => c.method === 'update').map((c) => c.args[0])).toEqual([
      { name: 'Finale' },
      { cash_float: 5000 },
      { cash_count: { '500': 2 } },
    ]);
    expect(calls.filter((c) => c.method === 'eq').every((c) => c.args[0] === 'id' && c.args[1] === 'e1')).toBe(true);
  });

  it('recordSale inserts the sale row', async () => {
    const { client, calls } = fakeClient();
    await mirrorEvents(
      client,
      { type: 'recordSale', eventId: 'e1', saleId: 's1', sellerId: 'u1', cart: [], catalog: [], now: 1000 },
      [event],
    );
    expect(calls).toEqual([
      {
        table: 'sales',
        method: 'insert',
        args: [
          {
            id: 's1',
            event_id: 'e1',
            timestamp: 1000,
            seller_id: 'u1',
            lines: [{ itemId: 'i1', name: 'Crêpe', price: 250, qty: 2 }],
            total: 500,
            cash_given: 1000,
            change: 500,
          },
        ],
      },
    ]);
  });

  it('undoMyLast deletes the removed sale id', async () => {
    const { client, calls } = fakeClient();
    await mirrorEvents(client, { type: 'undoMyLast', eventId: 'e1', sellerId: 'u1' }, [{ ...event, sales: [] }], 's1');
    expect(calls).toEqual([
      { table: 'sales', method: 'delete', args: [] },
      { table: 'sales', method: 'eq', args: ['id', 's1'] },
    ]);
  });

  describe('with an outbox', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    const record: EventsAction = { type: 'recordSale', eventId: 'e1', saleId: 's1', sellerId: 'u1', cart: [], catalog: [], now: 1000 };

    it('recordSale enqueues the sale and flushes it instead of inserting directly', async () => {
      const outbox = createOutbox();
      const enqueue = vi.spyOn(outbox, 'enqueue');
      const { client, calls } = fakeClient();
      await mirrorEvents(client, record, [event], undefined, outbox);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue.mock.calls[0][0]).toEqual({
        id: expect.any(String),
        version: 1,
        kind: 'insertSale',
        eventId: 'e1',
        sale,
      });
      // The flush sent it: same row as the direct path, and the queue is empty.
      expect(calls).toEqual([{ table: 'sales', method: 'insert', args: [expect.objectContaining({ id: 's1', event_id: 'e1' })] }]);
      expect(outbox.entries()).toEqual([]);
    });

    it('undoMyLast enqueues a deleteSale for the removed id', async () => {
      const outbox = createOutbox();
      const enqueue = vi.spyOn(outbox, 'enqueue');
      const { client, calls } = fakeClient();
      await mirrorEvents(client, { type: 'undoMyLast', eventId: 'e1', sellerId: 'u1' }, [{ ...event, sales: [] }], 's1', outbox);
      expect(enqueue.mock.calls[0][0]).toEqual({ id: expect.any(String), version: 1, kind: 'deleteSale', eventId: 'e1', saleId: 's1' });
      expect(calls).toEqual([
        { table: 'sales', method: 'delete', args: [] },
        { table: 'sales', method: 'eq', args: ['id', 's1'] },
        { table: 'sales', method: 'select', args: ['id'] },
      ]);
    });

    it('passes the extra flush context through to the outbox', async () => {
      const outbox = createOutbox();
      const flush = vi.spyOn(outbox, 'flush');
      const isDisabled = () => Promise.resolve(false);
      const refreshSession = () => Promise.resolve();
      const { client } = fakeClient();
      await mirrorEvents(client, record, [event], undefined, outbox, { snapshotAt: 42, isDisabled, refreshSession });
      expect(flush).toHaveBeenCalledWith(client, {
        eventsById: new Map([['e1', event]]),
        snapshotAt: 42,
        isDisabled,
        refreshSession,
      });
    });

    it('offline: keeps the sale queued, does not call the client, and rejects with OutboxOfflineError', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const outbox = createOutbox();
      const { client, from } = fakeClient();
      await expect(mirrorEvents(client, record, [event], undefined, outbox)).rejects.toBeInstanceOf(OutboxOfflineError);
      expect(from).not.toHaveBeenCalled();
      expect(outbox.entries().map((e) => [e.kind, e.status])).toEqual([['insertSale', 'pending']]);
    });

    it('a network error during the flush keeps the sale queued and rejects with OutboxOfflineError', async () => {
      const outbox = createOutbox();
      const { client } = fakeClient({ message: 'TypeError: Failed to fetch', code: '' });
      await expect(mirrorEvents(client, record, [event], undefined, outbox)).rejects.toBeInstanceOf(OutboxOfflineError);
      expect(outbox.entries()).toHaveLength(1);
    });
  });

  it('delete deletes the event by id', async () => {
    const { client, calls } = fakeClient();
    await mirrorEvents(client, { type: 'delete', id: 'e1' }, []);
    expect(calls).toEqual([
      { table: 'events', method: 'delete', args: [] },
      { table: 'events', method: 'eq', args: ['id', 'e1'] },
    ]);
  });
});
