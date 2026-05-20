import { describe, it, expect } from 'vitest';
import { eventsReducer } from './eventsReducer';
import type { SaleEvent, Item } from '../types';

const item = (id: string, price = 100): Item => ({ id, name: id, price, archived: false });

describe('eventsReducer', () => {
  it('creates a new event', () => {
    const next = eventsReducer([], {
      type: 'create',
      name: 'Bric-à-brac',
      kind: 'bric-a-brac',
      enabledItemIds: ['a', 'b']
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      name: 'Bric-à-brac',
      kind: 'bric-a-brac',
      enabledItemIds: ['a', 'b'],
      sales: []
    });
    expect(next[0].id).toBeTruthy();
    expect(next[0].createdAt).toBeGreaterThan(0);
  });

  it('renames an event', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'Old', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] }
    ];
    const next = eventsReducer(seeded, { type: 'rename', id: 'e1', name: 'New' });
    expect(next[0].name).toBe('New');
  });

  it('deletes an event', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] },
      { id: 'e2', name: 'B', kind: 'autre', createdAt: 2, enabledItemIds: [], sales: [] }
    ];
    const next = eventsReducer(seeded, { type: 'delete', id: 'e1' });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('e2');
  });

  it('toggles enabled items', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: ['x'], sales: [] }
    ];
    const enabled = eventsReducer(seeded, { type: 'toggleItem', eventId: 'e1', itemId: 'y' });
    expect(enabled[0].enabledItemIds.sort()).toEqual(['x', 'y']);

    const disabled = eventsReducer(enabled, { type: 'toggleItem', eventId: 'e1', itemId: 'x' });
    expect(disabled[0].enabledItemIds).toEqual(['y']);
  });

  it('records a sale (snapshots name + price from catalog)', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: ['a'], sales: [] }
    ];
    const next = eventsReducer(seeded, {
      type: 'recordSale',
      eventId: 'e1',
      cart: [{ itemId: 'a', qty: 2 }],
      catalog: [item('a', 150)],
      cashGiven: 500,
      now: 12345
    });
    expect(next[0].sales).toHaveLength(1);
    const sale = next[0].sales[0];
    expect(sale.timestamp).toBe(12345);
    expect(sale.lines).toEqual([{ itemId: 'a', name: 'a', price: 150, qty: 2 }]);
    expect(sale.total).toBe(300);
    expect(sale.cashGiven).toBe(500);
    expect(sale.change).toBe(200);
  });

  it('records a sale with no cash given (change undefined)', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: ['a'], sales: [] }
    ];
    const next = eventsReducer(seeded, {
      type: 'recordSale',
      eventId: 'e1',
      cart: [{ itemId: 'a', qty: 1 }],
      catalog: [item('a', 200)],
      now: 1
    });
    const sale = next[0].sales[0];
    expect(sale.cashGiven).toBeUndefined();
    expect(sale.change).toBeUndefined();
    expect(sale.total).toBe(200);
  });

  it('undoes the last sale', () => {
    const seeded: SaleEvent[] = [
      {
        id: 'e1',
        name: 'A',
        kind: 'autre',
        createdAt: 1,
        enabledItemIds: ['a'],
        sales: [
          { id: 's1', timestamp: 1, lines: [], total: 0 },
          { id: 's2', timestamp: 2, lines: [], total: 0 }
        ]
      }
    ];
    const next = eventsReducer(seeded, { type: 'undoLast', eventId: 'e1' });
    expect(next[0].sales.map((s) => s.id)).toEqual(['s1']);
  });

  it('undoLast on empty sales list is a no-op', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] }
    ];
    const next = eventsReducer(seeded, { type: 'undoLast', eventId: 'e1' });
    expect(next).toBe(seeded);
  });

  it('hydrates from persisted state', () => {
    const next = eventsReducer([], {
      type: 'hydrate',
      events: [
        { id: 'e1', name: 'X', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] }
      ]
    });
    expect(next).toHaveLength(1);
  });
});
