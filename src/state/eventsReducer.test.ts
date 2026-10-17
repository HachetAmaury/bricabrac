import { describe, it, expect } from 'vitest';
import { eventsReducer } from './eventsReducer';
import type { SaleEvent, Item, Sale } from '../types';

const item = (id: string, price = 100): Item => ({
  id,
  catalogId: 'c1',
  name: id,
  price,
  archived: false
});

const ev = (o: Partial<SaleEvent> = {}): SaleEvent => ({
  id: 'e1',
  catalogId: 'c1',
  name: 'A',
  kind: 'autre',
  createdAt: 1,
  enabledItemIds: [],
  sales: [],
  locked: false,
  lockedAt: null,
  ...o
});

const lockedEv = (o: Partial<SaleEvent> = {}): SaleEvent => ev({ locked: true, lockedAt: 99, ...o });

const sale = (id: string, sellerId: string, timestamp: number): Sale => ({
  id,
  sellerId,
  timestamp,
  lines: [],
  total: 0
});

describe('eventsReducer', () => {
  it('creates a new event with the given id and catalogId', () => {
    const next = eventsReducer([], {
      type: 'create',
      id: 'new-id',
      catalogId: 'cat-1',
      name: 'Bric-à-brac',
      kind: 'bric-a-brac',
      enabledItemIds: ['a', 'b'],
      createdAt: 42
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'new-id',
      catalogId: 'cat-1',
      name: 'Bric-à-brac',
      kind: 'bric-a-brac',
      enabledItemIds: ['a', 'b'],
      sales: [],
      locked: false,
      lockedAt: null
    });
    expect(next[0].createdAt).toBe(42);
  });

  it('renames an event', () => {
    const next = eventsReducer([ev({ name: 'Old' })], { type: 'rename', id: 'e1', name: 'New' });
    expect(next[0].name).toBe('New');
  });

  it('deletes an event', () => {
    const next = eventsReducer([ev(), ev({ id: 'e2', name: 'B' })], { type: 'delete', id: 'e1' });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('e2');
  });

  it('toggles enabled items', () => {
    const seeded = [ev({ enabledItemIds: ['x'] })];
    const enabled = eventsReducer(seeded, { type: 'toggleItem', eventId: 'e1', itemId: 'y' });
    expect(enabled[0].enabledItemIds.sort()).toEqual(['x', 'y']);
    const disabled = eventsReducer(enabled, { type: 'toggleItem', eventId: 'e1', itemId: 'x' });
    expect(disabled[0].enabledItemIds).toEqual(['y']);
  });

  it('records a sale (snapshots name + price from catalog)', () => {
    const next = eventsReducer([ev({ enabledItemIds: ['a'] })], {
      type: 'recordSale',
      eventId: 'e1',
      saleId: 's-new',
      sellerId: 'alice',
      cart: [{ itemId: 'a', qty: 2 }],
      catalog: [item('a', 150)],
      cashGiven: 500,
      now: 12345
    });
    expect(next[0].sales).toHaveLength(1);
    const s = next[0].sales[0];
    expect(s.timestamp).toBe(12345);
    expect(s.lines).toEqual([{ itemId: 'a', name: 'a', price: 150, qty: 2 }]);
    expect(s.total).toBe(300);
    expect(s.cashGiven).toBe(500);
    expect(s.change).toBe(200);
  });

  it('recordSale uses the given saleId and sellerId', () => {
    const next = eventsReducer([ev({ enabledItemIds: ['a'] })], {
      type: 'recordSale',
      eventId: 'e1',
      saleId: 'sale-123',
      sellerId: 'bob',
      cart: [{ itemId: 'a', qty: 1 }],
      catalog: [item('a', 100)],
      now: 1
    });
    expect(next[0].sales[0]).toMatchObject({ id: 'sale-123', sellerId: 'bob' });
  });

  it('records a sale with no cash given (change undefined)', () => {
    const next = eventsReducer([ev({ enabledItemIds: ['a'] })], {
      type: 'recordSale',
      eventId: 'e1',
      saleId: 's1',
      sellerId: 'alice',
      cart: [{ itemId: 'a', qty: 1 }],
      catalog: [item('a', 200)],
      now: 1
    });
    const s = next[0].sales[0];
    expect(s.cashGiven).toBeUndefined();
    expect(s.change).toBeUndefined();
    expect(s.total).toBe(200);
  });

  it('undoMyLast removes only the latest sale of that seller', () => {
    const seeded = [ev({ sales: [sale('s1', 'alice', 1), sale('s2', 'bob', 2), sale('s3', 'alice', 3)] })];
    const next = eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'bob' });
    expect(next[0].sales.map((s) => s.id)).toEqual(['s1', 's3']);
    const next2 = eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'alice' });
    expect(next2[0].sales.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('undoMyLast removes the greatest timestamp, not the last array index', () => {
    const seeded = [ev({ sales: [sale('A', 'alice', 3000), sale('B', 'alice', 1000)] })];
    const next = eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'alice' });
    expect(next[0].sales.map((s) => s.id)).toEqual(['B']);
  });

  it('undoMyLast breaks timestamp ties with the later array index', () => {
    const seeded = [ev({ sales: [sale('A', 'alice', 5), sale('B', 'alice', 5)] })];
    const next = eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'alice' });
    expect(next[0].sales.map((s) => s.id)).toEqual(['A']);
  });

  it('undoMyLast with no sale for that seller is a no-op', () => {
    const seeded = [ev({ sales: [sale('s1', 'alice', 1)] })];
    expect(eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'bob' })).toBe(seeded);
    const empty = [ev()];
    expect(eventsReducer(empty, { type: 'undoMyLast', eventId: 'e1', sellerId: 'bob' })).toBe(empty);
  });

  it('hydrates from persisted state', () => {
    const next = eventsReducer([], { type: 'hydrate', events: [ev({ id: 'e1', name: 'X' })] });
    expect(next).toHaveLength(1);
  });

  it('setLocked with a timestamp sets locked=true and lockedAt', () => {
    const locked = eventsReducer([ev()], { type: 'setLocked', id: 'e1', lockedAt: 5000 });
    expect(locked[0].locked).toBe(true);
    expect(locked[0].lockedAt).toBe(5000);
    const unlocked = eventsReducer(locked, { type: 'setLocked', id: 'e1', lockedAt: null });
    expect(unlocked[0].locked).toBe(false);
    expect(unlocked[0].lockedAt).toBeNull();
  });

  it('does not record a sale on a locked event', () => {
    const next = eventsReducer([lockedEv({ enabledItemIds: ['a'] })], {
      type: 'recordSale',
      eventId: 'e1',
      saleId: 's1',
      sellerId: 'alice',
      cart: [{ itemId: 'a', qty: 1 }],
      catalog: [item('a', 100)],
      now: 1
    });
    expect(next[0].sales).toHaveLength(0);
  });

  it('does not remove a sale from a locked event (undoMyLast)', () => {
    const seeded = [lockedEv({ sales: [sale('s1', 'alice', 1)] })];
    const next = eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'alice' });
    expect(next).toBe(seeded);
    expect(next[0].sales).toHaveLength(1);
  });

  it('does not toggle items on a locked event', () => {
    const seeded = [lockedEv({ enabledItemIds: ['x'] })];
    const next = eventsReducer(seeded, { type: 'toggleItem', eventId: 'e1', itemId: 'y' });
    expect(next).toBe(seeded);
    expect(next[0].enabledItemIds).toEqual(['x']);
  });

  it('does not delete a locked event', () => {
    const seeded = [lockedEv()];
    const next = eventsReducer(seeded, { type: 'delete', id: 'e1' });
    expect(next).toBe(seeded);
    expect(next).toHaveLength(1);
  });

  it('does not change the cash float on a locked event', () => {
    const seeded = [lockedEv({ cashFloat: 100 })];
    const next = eventsReducer(seeded, { type: 'setCashFloat', id: 'e1', cashFloat: 25000 });
    expect(next).toBe(seeded);
    expect(next[0].cashFloat).toBe(100);
  });

  it('does not change the cash count on a locked event', () => {
    const seeded = [lockedEv({ cashCount: { '5000': 1 } })];
    const next = eventsReducer(seeded, { type: 'setCashCount', id: 'e1', cashCount: { '5000': 9 } });
    expect(next).toBe(seeded);
    expect(next[0].cashCount).toEqual({ '5000': 1 });
  });

  it('sets the cash float (fond de caisse)', () => {
    const next = eventsReducer([ev()], { type: 'setCashFloat', id: 'e1', cashFloat: 25000 });
    expect(next[0].cashFloat).toBe(25000);
  });

  it('sets the cash count', () => {
    const next = eventsReducer([ev()], { type: 'setCashCount', id: 'e1', cashCount: { '5000': 2 } });
    expect(next[0].cashCount).toEqual({ '5000': 2 });
  });

  describe('server-origin actions', () => {
    it('upsertSale replaces a sale with the same id instead of duplicating it', () => {
      const seeded = [ev({ sales: [sale('s1', 'alice', 1), sale('s2', 'bob', 2)] })];
      const updated: Sale = { ...sale('s1', 'alice', 1), total: 777 };
      const next = eventsReducer(seeded, { type: 'upsertSale', eventId: 'e1', sale: updated });
      expect(next[0].sales).toHaveLength(2);
      expect(next[0].sales[0].total).toBe(777);
      const appended = eventsReducer(next, { type: 'upsertSale', eventId: 'e1', sale: sale('s3', 'bob', 3) });
      expect(appended[0].sales.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    });

    it('upsertSale and removeSale bypass the lock guard', () => {
      const seeded = [lockedEv({ sales: [sale('s1', 'alice', 1)] })];
      const added = eventsReducer(seeded, { type: 'upsertSale', eventId: 'e1', sale: sale('s2', 'bob', 2) });
      expect(added[0].sales.map((s) => s.id)).toEqual(['s1', 's2']);
      const removed = eventsReducer(added, { type: 'removeSale', eventId: 'e1', saleId: 's1' });
      expect(removed[0].sales.map((s) => s.id)).toEqual(['s2']);
    });

    it('removeSale with an unknown saleId returns the same state objects', () => {
      const seeded = [ev({ sales: [sale('s1', 'alice', 1)] })];
      const next = eventsReducer(seeded, { type: 'removeSale', eventId: 'e1', saleId: 'nope' });
      expect(next[0]).toBe(seeded[0]);
    });

    it('upsertEvent keeps existing sales', () => {
      const seeded = [ev({ name: 'Old', sales: [sale('s1', 'alice', 1)] })];
      const { sales: _sales, ...incoming } = ev({ name: 'Renamed' });
      const next = eventsReducer(seeded, { type: 'upsertEvent', event: incoming });
      expect(next[0].name).toBe('Renamed');
      expect(next[0].sales.map((s) => s.id)).toEqual(['s1']);
    });

    it('upsertEvent inserts a new event with empty sales and keeps locked consistent', () => {
      const { sales: _sales, ...incoming } = ev({ id: 'e9', lockedAt: 42, locked: false });
      const next = eventsReducer([], { type: 'upsertEvent', event: incoming });
      expect(next).toHaveLength(1);
      expect(next[0].sales).toEqual([]);
      expect(next[0].lockedAt).toBe(42);
      expect(next[0].locked).toBe(true);
    });

    it('removeEvent deletes even a locked event', () => {
      const next = eventsReducer([lockedEv(), ev({ id: 'e2' })], { type: 'removeEvent', id: 'e1' });
      expect(next.map((e) => e.id)).toEqual(['e2']);
    });

    it('setEnabledItems replaces the enabled items even when locked', () => {
      const next = eventsReducer([lockedEv({ enabledItemIds: ['x'] })], {
        type: 'setEnabledItems',
        eventId: 'e1',
        itemIds: ['a', 'b']
      });
      expect(next[0].enabledItemIds).toEqual(['a', 'b']);
    });
  });
});
