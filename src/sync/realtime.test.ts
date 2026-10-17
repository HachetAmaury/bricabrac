import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, EventRow, ItemRow, SaleRow } from '../lib/supabase';
import type { SaleEvent } from '../types';
import { applyChange, subscribeAll, type ChangeHandlers, type ChangePayload, type SyncScope } from './realtime';

const saleRow: SaleRow = {
  id: 's1',
  event_id: 'e1',
  timestamp: 10,
  seller_id: 'u1',
  lines: [],
  total: 250,
  cash_given: null,
  change: null,
  created_at: '2026-10-17T10:00:00.000Z',
};
const eventRow: EventRow = {
  id: 'e1',
  catalog_id: 'c1',
  name: 'Tournoi',
  kind: 'tournoi',
  created_at: '2026-10-17T09:00:00.000Z',
  updated_at: '2026-10-17T09:00:00.000Z',
  created_by: 'u1',
  locked_at: null,
  cash_float: null,
  cash_count: null,
};
const itemRow: ItemRow = {
  id: 'i1',
  catalog_id: 'c1',
  name: 'Crêpe',
  price: 250,
  archived: false,
  icon: null,
  category_id: null,
  created_at: '2026-10-17T09:00:00.000Z',
  updated_at: '2026-10-17T09:00:00.000Z',
};
const localEvent: SaleEvent = {
  id: 'e1',
  catalogId: 'c1',
  name: 'Ancien nom',
  kind: 'tournoi',
  createdAt: 1,
  enabledItemIds: ['i1', 'i2'],
  sales: [],
  locked: false,
  lockedAt: null,
};

function scope(): SyncScope {
  return {
    eventIds: new Set(['e1']),
    catalogIds: new Set(['c1']),
    userId: 'u1',
    saleEventById: new Map([['s1', 'e1']]),
  };
}

function handlers(): ChangeHandlers & { [K in keyof ChangeHandlers]: ReturnType<typeof vi.fn> } {
  return {
    onItem: vi.fn(),
    onCategory: vi.fn(),
    onEvent: vi.fn(),
    onMembershipChanged: vi.fn(),
    onEventItemsChanged: vi.fn(),
    getEvent: vi.fn((id: string) => (id === 'e1' ? localEvent : undefined)),
    hasItem: vi.fn((id: string) => id === 'i1'),
    hasCategory: vi.fn((id: string) => id === 'k1'),
  } as never;
}

function payload(
  table: string,
  eventType: ChangePayload['eventType'],
  row: Record<string, unknown>,
  old: Record<string, unknown> = {},
): ChangePayload {
  return { table, eventType, new: eventType === 'DELETE' ? {} : row, old };
}

function noDispatch(h: ReturnType<typeof handlers>) {
  expect(h.onItem).not.toHaveBeenCalled();
  expect(h.onCategory).not.toHaveBeenCalled();
  expect(h.onEvent).not.toHaveBeenCalled();
  expect(h.onMembershipChanged).not.toHaveBeenCalled();
  expect(h.onEventItemsChanged).not.toHaveBeenCalled();
}

describe('applyChange', () => {
  it('INSERT on sales → upsertSale with the mapped sale', () => {
    const h = handlers();
    applyChange(payload('sales', 'INSERT', { ...saleRow, id: 's2' }), scope(), h);
    expect(h.onEvent).toHaveBeenCalledWith({
      type: 'upsertSale',
      eventId: 'e1',
      sale: { id: 's2', timestamp: 10, sellerId: 'u1', lines: [], total: 250 },
    });
  });

  it('DELETE on sales → removeSale(eventId, saleId) from payload.old', () => {
    const h = handlers();
    applyChange(payload('sales', 'DELETE', {}, { ...saleRow }), scope(), h);
    expect(h.onEvent).toHaveBeenCalledWith({ type: 'removeSale', eventId: 'e1', saleId: 's1' });
  });

  it('UPDATE on events → upsertEvent without touching sales', () => {
    const h = handlers();
    applyChange(payload('events', 'UPDATE', { ...eventRow, name: 'Finale' }), scope(), h);
    expect(h.onEvent).toHaveBeenCalledTimes(1);
    const action = h.onEvent.mock.calls[0][0];
    expect(action).toEqual({
      type: 'upsertEvent',
      event: {
        id: 'e1',
        catalogId: 'c1',
        name: 'Finale',
        kind: 'tournoi',
        createdAt: Date.parse(eventRow.created_at),
        enabledItemIds: ['i1', 'i2'],
        locked: false,
        lockedAt: null,
      },
    });
    expect('sales' in action.event).toBe(false);
  });

  it('a payload whose event_id is not in scope is ignored', () => {
    const h = handlers();
    applyChange(payload('sales', 'INSERT', { ...saleRow, id: 's9', event_id: 'other' }), scope(), h);
    applyChange(payload('sales', 'DELETE', {}, { ...saleRow, event_id: 'other' }), scope(), h);
    applyChange(payload('event_items', 'INSERT', { event_id: 'other', item_id: 'i1' }), scope(), h);
    applyChange(payload('events', 'UPDATE', { ...eventRow, id: 'other' }), scope(), h);
    applyChange(payload('events', 'DELETE', {}, { id: 'other' }), scope(), h);
    applyChange(payload('items', 'UPDATE', { ...itemRow, catalog_id: 'c9' }), scope(), h);
    noDispatch(h);
  });

  it('UPDATE on events for an unknown local event uses no enabled items', () => {
    const h = handlers();
    const s = scope();
    s.eventIds.add('e2');
    applyChange(payload('events', 'INSERT', { ...eventRow, id: 'e2' }), s, h);
    expect(h.onEvent.mock.calls[0][0].event.enabledItemIds).toEqual([]);
  });

  it('DELETE on events → removeEvent', () => {
    const h = handlers();
    applyChange(payload('events', 'DELETE', {}, { id: 'e1' }), scope(), h);
    expect(h.onEvent).toHaveBeenCalledWith({ type: 'removeEvent', id: 'e1' });
  });

  it('UPDATE on items → upsert with the mapped item', () => {
    const h = handlers();
    applyChange(payload('items', 'UPDATE', { ...itemRow, name: 'Gaufre' }), scope(), h);
    expect(h.onItem).toHaveBeenCalledWith({
      type: 'upsert',
      item: { id: 'i1', catalogId: 'c1', name: 'Gaufre', price: 250, archived: false, categoryId: null },
    });
  });

  it('DELETE on items with only { id } → remove{id}', () => {
    const h = handlers();
    applyChange(payload('items', 'DELETE', {}, { id: 'i1' }), scope(), h);
    expect(h.onItem).toHaveBeenCalledWith({ type: 'remove', id: 'i1' });
  });

  it('DELETE on items or categories for an unknown id is ignored', () => {
    const h = handlers();
    applyChange(payload('items', 'DELETE', {}, { id: 'nope' }), scope(), h);
    applyChange(payload('categories', 'DELETE', {}, { id: 'nope' }), scope(), h);
    noDispatch(h);
  });

  it('INSERT and DELETE on categories → upsert / remove', () => {
    const h = handlers();
    applyChange(
      payload('categories', 'INSERT', {
        id: 'k2',
        catalog_id: 'c1',
        name: 'Boissons',
        color: '#f00',
        created_at: '',
        updated_at: '',
      }),
      scope(),
      h,
    );
    applyChange(payload('categories', 'DELETE', {}, { id: 'k1' }), scope(), h);
    expect(h.onCategory.mock.calls).toEqual([
      [{ type: 'upsert', category: { id: 'k2', catalogId: 'c1', name: 'Boissons', color: '#f00' } }],
      [{ type: 'remove', id: 'k1' }],
    ]);
  });

  it('sales DELETE carrying only { id } is routed via saleEventById', () => {
    const h = handlers();
    applyChange(payload('sales', 'DELETE', {}, { id: 's1' }), scope(), h);
    expect(h.onEvent).toHaveBeenCalledWith({ type: 'removeSale', eventId: 'e1', saleId: 's1' });
  });

  it('DELETE for an unknown sale id is ignored', () => {
    const h = handlers();
    applyChange(payload('sales', 'DELETE', {}, { id: 'nope' }), scope(), h);
    applyChange(payload('sales', 'DELETE', {}, { id: 'nope', event_id: 'e1' }), scope(), h);
    noDispatch(h);
  });

  it('event_items INSERT/DELETE in scope → onEventItemsChanged(eventId)', () => {
    const h = handlers();
    applyChange(payload('event_items', 'INSERT', { event_id: 'e1', item_id: 'i3' }), scope(), h);
    applyChange(payload('event_items', 'DELETE', {}, { event_id: 'e1', item_id: 'i1' }), scope(), h);
    expect(h.onEventItemsChanged.mock.calls).toEqual([['e1'], ['e1']]);
    expect(h.onEvent).not.toHaveBeenCalled();
  });

  it('event_members DELETE for another user is ignored, for userId → onMembershipChanged', () => {
    const h = handlers();
    applyChange(payload('event_members', 'DELETE', {}, { event_id: 'e1', user_id: 'u2' }), scope(), h);
    applyChange(payload('event_members', 'INSERT', { event_id: 'e5', user_id: 'u2' }), scope(), h);
    expect(h.onMembershipChanged).not.toHaveBeenCalled();
    applyChange(payload('event_members', 'DELETE', {}, { event_id: 'e1', user_id: 'u1' }), scope(), h);
    applyChange(payload('event_members', 'INSERT', { event_id: 'e5', user_id: 'u1' }), scope(), h);
    expect(h.onMembershipChanged).toHaveBeenCalledTimes(2);
  });
});

// ---- subscribeAll with a fake client ----

type Reg = { type: string; filter: Record<string, string>; cb: (p: unknown) => void };

function fakeClient(selectResult: { data: { item_id: string }[] | null; error: unknown } = { data: [], error: null }) {
  const regs: Reg[] = [];
  let statusCb: ((s: string, e?: Error) => void) | undefined;
  const channel = {
    on: vi.fn((type: string, filter: Record<string, string>, cb: (p: unknown) => void) => {
      regs.push({ type, filter, cb });
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => {
      statusCb = cb;
      return channel;
    }),
  };
  const eq = vi.fn(() => Promise.resolve(selectResult));
  const select = vi.fn(() => ({ eq }));
  const client = {
    channel: vi.fn((_name: string) => channel),
    removeChannel: vi.fn(() => {
      statusCb?.('CLOSED');
      return Promise.resolve('ok');
    }),
    from: vi.fn(() => ({ select })),
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    raw: client,
    channel,
    regs,
    select,
    eq,
    status: (s: string) => statusCb?.(s),
  };
}

function syncHandlers() {
  return {
    onItem: vi.fn(),
    onCategory: vi.fn(),
    onEvent: vi.fn(),
    onMembershipChanged: vi.fn(),
    onStatus: vi.fn(),
    getEvent: vi.fn(() => undefined),
    hasItem: vi.fn(() => false),
    hasCategory: vi.fn(() => false),
  };
}

describe('subscribeAll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens one channel per user with the scoped postgres_changes filters', () => {
    const f = fakeClient();
    const s = scope();
    s.eventIds.add('e2');
    subscribeAll(f.client, s, syncHandlers());
    expect(f.raw.channel).toHaveBeenCalledTimes(1);
    expect(f.raw.channel.mock.calls[0][0]).toMatch(/^sync:u1:\d+$/);
    expect(f.regs.map((r) => [r.type, r.filter])).toEqual([
      ['postgres_changes', { event: '*', schema: 'public', table: 'items', filter: 'catalog_id=in.(c1)' }],
      ['postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: 'catalog_id=in.(c1)' }],
      ['postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'id=in.(e1,e2)' }],
      ['postgres_changes', { event: '*', schema: 'public', table: 'event_items', filter: 'event_id=in.(e1,e2)' }],
      ['postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: 'event_id=in.(e1,e2)' }],
      ['postgres_changes', { event: '*', schema: 'public', table: 'event_members', filter: 'user_id=eq.u1' }],
    ]);
    expect(f.channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it('gives each subscription its own topic so a resubscribe never reuses a leaving channel', () => {
    const f = fakeClient();
    subscribeAll(f.client, scope(), syncHandlers())();
    subscribeAll(f.client, scope(), syncHandlers());
    const [a, b] = f.raw.channel.mock.calls.map((c) => c[0]);
    expect(a).not.toBe(b);
  });

  it('skips listeners whose scope list is empty', () => {
    const f = fakeClient();
    subscribeAll(
      f.client,
      { eventIds: new Set(), catalogIds: new Set(), userId: 'u1', saleEventById: new Map() },
      syncHandlers(),
    );
    expect(f.regs.map((r) => r.filter.table)).toEqual(['event_members']);
  });

  it('routes a received payload through applyChange', () => {
    const f = fakeClient();
    const h = syncHandlers();
    subscribeAll(f.client, scope(), h);
    const sales = f.regs.find((r) => r.filter.table === 'sales')!;
    sales.cb(payload('sales', 'DELETE', {}, { id: 's1' }));
    expect(h.onEvent).toHaveBeenCalledWith({ type: 'removeSale', eventId: 'e1', saleId: 's1' });
  });

  it('debounces event_items changes into one select then setEnabledItems', async () => {
    const f = fakeClient({ data: [{ item_id: 'i1' }, { item_id: 'i3' }], error: null });
    const h = syncHandlers();
    subscribeAll(f.client, scope(), h);
    const ei = f.regs.find((r) => r.filter.table === 'event_items')!;
    ei.cb(payload('event_items', 'INSERT', { event_id: 'e1', item_id: 'i3' }));
    ei.cb(payload('event_items', 'DELETE', {}, { event_id: 'e1', item_id: 'i2' }));
    ei.cb(payload('event_items', 'INSERT', { event_id: 'e1', item_id: 'i1' }));
    expect(f.select).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(f.raw.from).toHaveBeenCalledWith('event_items');
    expect(f.select).toHaveBeenCalledTimes(1);
    expect(f.select).toHaveBeenCalledWith('item_id');
    expect(f.eq).toHaveBeenCalledWith('event_id', 'e1');
    expect(h.onEvent).toHaveBeenCalledWith({ type: 'setEnabledItems', eventId: 'e1', itemIds: ['i1', 'i3'] });
  });

  it('reports channel status, but not the CLOSED caused by its own unsubscribe', () => {
    const f = fakeClient();
    const h = syncHandlers();
    const unsubscribe = subscribeAll(f.client, scope(), h);
    f.status('CHANNEL_ERROR');
    expect(h.onStatus).toHaveBeenCalledWith('CHANNEL_ERROR');
    unsubscribe();
    expect(f.raw.removeChannel).toHaveBeenCalledWith(f.channel);
    expect(h.onStatus).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe cancels a pending event_items refetch', async () => {
    const f = fakeClient({ data: [{ item_id: 'i1' }], error: null });
    const h = syncHandlers();
    const unsubscribe = subscribeAll(f.client, scope(), h);
    f.regs.find((r) => r.filter.table === 'event_items')!.cb(
      payload('event_items', 'INSERT', { event_id: 'e1', item_id: 'i1' }),
    );
    unsubscribe();
    await vi.advanceTimersByTimeAsync(100);
    expect(f.select).not.toHaveBeenCalled();
    expect(h.onEvent).not.toHaveBeenCalled();
  });
});
