import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Item, SaleEvent } from '../types';
import type { Snapshot } from '../sync/fetch';

type FakeChannel = {
  name: string;
  regs: { filter: Record<string, string>; cb: (p: unknown) => void }[];
  status?: (s: string) => void;
  on: (t: string, f: Record<string, string>, cb: (p: unknown) => void) => FakeChannel;
  subscribe: (cb: (s: string) => void) => FakeChannel;
};

const h = vi.hoisted(() => {
  const channels: FakeChannel[] = [];
  return {
    fetchAll: vi.fn(),
    notify: vi.fn(),
    auth: {
      signOut: vi.fn(),
      profile: null as null | { id: string; displayName: string; isAdmin: boolean; disabled: boolean },
    },
    mirrorCatalog: vi.fn(),
    mirrorCategories: vi.fn(),
    mirrorEvents: vi.fn(),
    channels,
    fakeClient: {
      fake: true,
      from: vi.fn(),
      auth: { refreshSession: vi.fn(() => Promise.resolve({ data: {}, error: null })) },
      channel: vi.fn((name: string) => {
        const ch: FakeChannel = {
          name,
          regs: [],
          on(_t, filter, cb) {
            ch.regs.push({ filter, cb });
            return ch;
          },
          subscribe(cb) {
            ch.status = cb;
            return ch;
          },
        };
        channels.push(ch);
        return ch;
      }),
      // Mimics realtime-js: our own removal reports CLOSED to the channel.
      removeChannel: vi.fn((ch: FakeChannel) => {
        ch.status?.('CLOSED');
        return Promise.resolve('ok');
      }),
    },
  };
});

vi.mock('../lib/supabase', () => ({ supabase: h.fakeClient, hasSupabaseConfig: () => true }));
vi.mock('../sync/fetch', () => ({ fetchAll: h.fetchAll }));
vi.mock('../sync/writes', () => ({
  mirrorCatalog: h.mirrorCatalog,
  mirrorCategories: h.mirrorCategories,
  mirrorEvents: h.mirrorEvents,
}));
vi.mock('../lib/notify', () => ({ notify: h.notify }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    status: 'signedIn',
    session: { user: { id: 'u1' } },
    userId: 'u1',
    profile: h.auth.profile,
    lastError: null,
    signIn: () => Promise.resolve(null),
    signOut: h.auth.signOut,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AppProvider, useApp } from './AppContext';
import { KEYS } from './persistence';

const itemA: Item = { id: 'i1', catalogId: 'c1', name: 'Crêpe', price: 250, archived: false, categoryId: null };
const itemB: Item = { id: 'i2', catalogId: 'c2', name: 'Bière', price: 300, archived: false, categoryId: null };
const serverEvent: SaleEvent = {
  id: 'e1',
  catalogId: 'c1',
  name: 'Tournoi',
  kind: 'tournoi',
  createdAt: 1,
  enabledItemIds: ['i1'],
  sales: [{ id: 's1', sellerId: 'u1', timestamp: 2, lines: [], total: 0 }],
  locked: false,
  lockedAt: null,
};
const snapshot: Snapshot = {
  catalogs: [{ id: 'c1', name: 'Buvette' }, { id: 'c2', name: 'Bar' }],
  items: [itemA, itemB],
  categories: [],
  events: [serverEvent],
  profiles: [{ id: 'u1', displayName: 'Nat', isAdmin: false, disabled: false }],
};

let app: ReturnType<typeof useApp>;
function Probe() {
  app = useApp();
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  h.channels.length = 0;
  h.fakeClient.channel.mockClear();
  h.fakeClient.removeChannel.mockClear();
  h.fakeClient.from.mockReset();
  h.fetchAll.mockReset();
  h.mirrorCatalog.mockReset().mockResolvedValue(undefined);
  h.mirrorCategories.mockReset().mockResolvedValue(undefined);
  h.mirrorEvents.mockReset().mockResolvedValue(undefined);
  h.notify.mockReset();
  h.auth.signOut.mockReset().mockResolvedValue(undefined);
  h.auth.profile = { id: 'u1', displayName: 'Nat', isAdmin: false, disabled: false };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AppProvider', () => {
  it('hydrates from fetchAll, goes online and writes the cache', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(h.fetchAll).toHaveBeenCalledWith(h.fakeClient);
    expect(app.events).toEqual([serverEvent]);
    expect(app.catalogs).toEqual(snapshot.catalogs);
    expect(app.profiles).toEqual(snapshot.profiles);
    expect(app.syncStatus).toBe('online');
    expect(JSON.parse(localStorage.getItem(KEYS.events)!)).toEqual([serverEvent]);
    expect(JSON.parse(localStorage.getItem(KEYS.items)!)).toEqual([itemA, itemB]);
    expect(JSON.parse(localStorage.getItem(KEYS.catalogs)!)).toEqual(snapshot.catalogs);
  });

  it('stays on the cache and goes offline when fetchAll rejects', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cached: SaleEvent = { ...serverEvent, id: 'cached', name: 'En cache' };
    localStorage.setItem(KEYS.events, JSON.stringify([cached]));
    localStorage.setItem(KEYS.items, JSON.stringify([itemA]));
    h.fetchAll.mockRejectedValue(new Error('offline'));
    await mount();
    expect(app.syncStatus).toBe('offline');
    expect(app.events).toEqual([cached]);
    expect(app.allItems).toEqual([itemA]);
    err.mockRestore();
  });

  it('filters catalog to the active event catalog', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(app.catalog).toEqual([]);
    act(() => app.setActiveEvent('e1'));
    expect(app.catalog).toEqual([itemA]);
    expect(app.allItems).toEqual([itemA, itemB]);
  });

  it('mirrors a local change with the next state, and skips no-op actions', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    await act(async () => app.dispatchCatalog({ type: 'edit', id: 'i1', name: 'Gaufre', price: 300 }));
    expect(h.mirrorCatalog).toHaveBeenCalledTimes(1);
    const [client, action, next] = h.mirrorCatalog.mock.calls[0];
    expect(client).toBe(h.fakeClient);
    expect(action).toEqual({ type: 'edit', id: 'i1', name: 'Gaufre', price: 300 });
    expect(next).toEqual([{ ...itemA, name: 'Gaufre', price: 300 }, itemB]);
    expect(app.allItems[0].name).toBe('Gaufre');

    // Unknown id: the reducer returns the same reference, so nothing is mirrored.
    await act(async () => app.dispatchCatalog({ type: 'archive', id: 'nope' }));
    expect(h.mirrorCatalog).toHaveBeenCalledTimes(1);
  });

  it('passes the removed sale id for undoMyLast', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    await act(async () => app.dispatchEvents({ type: 'undoMyLast', eventId: 'e1', sellerId: 'u1' }));
    expect(h.mirrorEvents).toHaveBeenCalledTimes(1);
    const [, , next, removed] = h.mirrorEvents.mock.calls[0];
    expect(removed).toBe('s1');
    expect(next[0].sales).toEqual([]);
  });

  it('rolls a failed non-sale write back with a refetch and tells the user', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.mirrorEvents.mockRejectedValue(new Error('network'));
    await mount();
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' }));
    expect(h.notify).toHaveBeenCalledWith('Modification non enregistrée. Vérifiez le réseau.');
    expect(h.fetchAll).toHaveBeenCalledTimes(2);
    expect(app.events[0].name).toBe('Tournoi');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('offline non-sale action is refused and not applied', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' });
      // One gesture that dispatches twice shows one message.
      app.dispatchCatalog({ type: 'archive', id: 'i1' });
    });
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith('Hors ligne : action impossible.');
    expect(app.events[0].name).toBe('Tournoi');
    expect(app.allItems[0].archived).toBe(false);
    expect(h.mirrorEvents).not.toHaveBeenCalled();
    expect(h.mirrorCatalog).not.toHaveBeenCalled();
    // Selling still works offline.
    await act(async () => app.dispatchEvents({ type: 'undoMyLast', eventId: 'e1', sellerId: 'u1' }));
    expect(app.events[0].sales).toEqual([]);
    expect(h.mirrorEvents).toHaveBeenCalledTimes(1);
    online.mockRestore();
  });

  it('two mirrors run in order: the second starts after the first settled', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    let finishCreate!: () => void;
    const started: string[] = [];
    h.mirrorEvents.mockImplementation((_c: unknown, a: { type: string }) => {
      started.push(a.type);
      return a.type === 'create' ? new Promise<void>((r) => (finishCreate = r)) : Promise.resolve();
    });
    await act(async () => {
      app.dispatchEvents({ type: 'create', id: 'e2', catalogId: 'c1', name: 'Finale', kind: 'autre', enabledItemIds: [], createdAt: 5 });
      app.dispatchEvents({ type: 'toggleItem', eventId: 'e2', itemId: 'i1' });
    });
    expect(started).toEqual(['create']);
    await act(async () => finishCreate());
    expect(started).toEqual(['create', 'toggleItem']);
  });

  it('a refresh() hydrate leaves the cart untouched (edge case 14)', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    act(() => app.setActiveEvent('e1'));
    act(() => app.dispatchCart({ type: 'add', itemId: 'i1' }));
    const cart = app.cart;
    expect(cart).toEqual([{ itemId: 'i1', qty: 1 }]);
    // Server changed the event and its catalog meanwhile.
    h.fetchAll.mockResolvedValue({
      ...snapshot,
      items: [{ ...itemA, price: 400 }, itemB],
      events: [{ ...serverEvent, name: 'Finale', sales: [] }],
    });
    await act(async () => {
      await app.refresh();
    });
    expect(app.events[0].name).toBe('Finale');
    expect(app.cart).toBe(cart);
    expect(app.activeEventId).toBe('e1');
  });

  it('starts in syncing until the first fetch settles', async () => {
    let resolve!: (s: Snapshot) => void;
    h.fetchAll.mockReturnValue(new Promise<Snapshot>((r) => (resolve = r)));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<AppProvider><Probe /></AppProvider>));
    expect(app.syncStatus).toBe('syncing');
    await act(async () => resolve(snapshot));
    expect(app.syncStatus).toBe('online');
  });

  it('goes back online when a later mirror succeeds', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.mirrorEvents.mockRejectedValueOnce(new Error('network'));
    await mount();
    // The rollback refetch fails too: still offline.
    h.fetchAll.mockRejectedValueOnce(new Error('offline'));
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' }));
    expect(app.syncStatus).toBe('offline');
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale 2' }));
    expect(app.syncStatus).toBe('online');
    err.mockRestore();
  });

  describe('initial fetch retry', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    it('retries a failed first fetch after 2, 4 and 8 s and stops on success', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.fetchAll
        .mockRejectedValueOnce(new Error('lie-fi'))
        .mockRejectedValueOnce(new Error('lie-fi'))
        .mockRejectedValueOnce(new Error('lie-fi'))
        .mockResolvedValue(snapshot);
      await mount();
      expect(h.fetchAll).toHaveBeenCalledTimes(1);
      await tick(1_999);
      expect(h.fetchAll).toHaveBeenCalledTimes(1);
      await tick(1);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
      await tick(4_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(3);
      await tick(8_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(4);
      expect(app.syncStatus).toBe('online');
      await tick(60_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(4);
      err.mockRestore();
    });

    it('gives up after 5 attempts', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.fetchAll.mockRejectedValue(new Error('lie-fi'));
      await mount();
      await tick(2_000 + 4_000 + 8_000 + 16_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(5);
      await tick(120_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(5);
      err.mockRestore();
    });

    it('does not retry while the browser is offline', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      h.fetchAll.mockRejectedValue(new Error('offline'));
      await mount();
      await tick(60_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(1);
      online.mockRestore();
      err.mockRestore();
    });
  });
});

describe('AppProvider outbox', () => {
  const pendingSale = { id: 's9', sellerId: 'u1', timestamp: 5, lines: [], total: 700 };
  const seed = () =>
    localStorage.setItem(
      'sync:outbox:u1',
      JSON.stringify([
        { id: 'o1', version: 1, kind: 'insertSale', eventId: 'e1', sale: pendingSale, status: 'pending', attempts: 0 },
      ]),
    );
  const inserts: unknown[] = [];
  const deletes: unknown[] = [];
  const order: string[] = [];
  const profileQueries: unknown[] = [];
  let profileDisabled = false;
  let deleteResult: unknown = { data: [], error: null, status: 200, statusText: 'OK' };
  const serverReplies = (result: unknown) =>
    h.fakeClient.from.mockImplementation((table: string) =>
      table === 'profiles'
        ? {
            select: () => ({
              eq: (_c: string, id: unknown) => ({
                maybeSingle: () => {
                  profileQueries.push(id);
                  return Promise.resolve({ data: { disabled: profileDisabled }, error: null, status: 200, statusText: 'OK' });
                },
              }),
            }),
          }
        : {
            insert: (row: unknown) => {
              inserts.push(row);
              order.push('insert');
              return Promise.resolve(result);
            },
            delete: () => ({
              eq: (_c: string, id: unknown) => ({
                select: () => {
                  deletes.push(id);
                  order.push('delete');
                  return Promise.resolve(deleteResult);
                },
              }),
            }),
          },
    );
  beforeEach(() => {
    inserts.length = 0;
    deletes.length = 0;
    order.length = 0;
    profileQueries.length = 0;
    profileDisabled = false;
    deleteResult = { data: [], error: null, status: 200, statusText: 'OK' };
    h.fakeClient.auth.refreshSession.mockClear();
  });
  const pgErr = (code: string, message: string, status: number) => ({
    data: null,
    error: { code, message, details: null, hint: null },
    status,
    statusText: '',
  });

  it('passes the outbox to mirrorEvents', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' }));
    const outbox = h.mirrorEvents.mock.calls[0][4];
    expect(typeof outbox.enqueue).toBe('function');
    expect(typeof outbox.flush).toBe('function');
  });

  it('pending outbox sale survives a refresh() hydrate', async () => {
    seed();
    serverReplies({ data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, status: 0, statusText: '' });
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(app.events[0].sales.map((s) => s.id)).toEqual(['s1', 's9']);
    expect(app.outbox).toEqual({ pending: 1, held: 0, flushing: false });
    // The first flush runs after the first hydrate (fresh events for classification).
    expect(inserts).toEqual([expect.objectContaining({ id: 's9', event_id: 'e1' })]);

    h.fetchAll.mockImplementation(() => {
      order.push('fetch');
      return Promise.resolve(snapshot);
    });
    order.length = 0;
    await act(async () => {
      await app.refresh();
    });
    expect(h.fetchAll).toHaveBeenCalledTimes(2);
    // Every refresh fetches and hydrates first, then flushes against the fresh events.
    expect(order).toEqual(['fetch', 'insert']);
    expect(inserts).toHaveLength(2);
    expect(app.events[0].sales.map((s) => s.id)).toEqual(['s1', 's9']);
    expect(JSON.parse(localStorage.getItem(KEYS.events)!)[0].sales.map((s: { id: string }) => s.id)).toEqual(['s1', 's9']);
    expect(app.outbox.pending).toBe(1);
  });

  it('sends a pending sale once back online and clears the counter', async () => {
    seed();
    serverReplies({ data: null, error: null, status: 201, statusText: 'Created' });
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(inserts).toHaveLength(1);
    expect(app.outbox).toEqual({ pending: 0, held: 0, flushing: false });
    expect(app.rejected).toEqual([]);
  });

  it('disabled → pending rejected as disabled, then signOut after dismiss', async () => {
    seed();
    profileDisabled = true;
    serverReplies(pgErr('42501', 'new row violates row-level security policy for table "sales"', 403));
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(app.events[0].sales.map((s) => s.id)).toEqual(['s1']);
    expect(app.rejected).toEqual([expect.objectContaining({ sale: pendingSale, eventId: 'e1', reason: 'disabled' })]);
    expect(app.outbox.pending).toBe(0);
    expect(profileQueries).toEqual(['u1']);
    // The dialog is up: no sign-out until the user saw (and could export) the list.
    expect(h.auth.signOut).not.toHaveBeenCalled();
    act(() => app.dismissRejected());
    expect(h.auth.signOut).toHaveBeenCalledWith('Compte désactivé.');
    // The list survives the sign-out, stored per account.
    expect(JSON.parse(localStorage.getItem('sync:rejected:u1')!)).toHaveLength(1);
  });

  it('a disabled profile rejects the pending outbox as disabled, then signs out on OK', async () => {
    seed();
    h.auth.profile = { id: 'u1', displayName: 'Nat', isAdmin: false, disabled: true };
    serverReplies({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0, statusText: '' });
    h.fetchAll.mockRejectedValue(new Error('offline'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    expect(app.rejected.map((r) => [r.sale.id, r.reason])).toEqual([['s9', 'disabled']]);
    expect(app.outbox.pending).toBe(0);
    expect(h.auth.signOut).not.toHaveBeenCalled();
    act(() => app.dismissRejected());
    expect(h.auth.signOut).toHaveBeenCalledWith('Compte désactivé.');
    err.mockRestore();
  });

  it('a disabled profile with nothing pending signs out at once', async () => {
    h.auth.profile = { id: 'u1', displayName: 'Nat', isAdmin: false, disabled: true };
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(h.auth.signOut).toHaveBeenCalledWith('Compte désactivé.');
  });

  it('a snapshot showing the own profile disabled starts the disabled flow', async () => {
    h.fetchAll.mockResolvedValue({
      ...snapshot,
      profiles: [{ id: 'u1', displayName: 'Nat', isAdmin: false, disabled: true }],
    });
    await mount();
    expect(h.auth.signOut).toHaveBeenCalledWith('Compte désactivé.');
  });

  it('an offline undo is held, not dropped, when the event was locked meanwhile', async () => {
    // Cache: event unlocked. Server: locked since then, so the delete matches 0 rows.
    localStorage.setItem(KEYS.events, JSON.stringify([serverEvent]));
    localStorage.setItem(
      'sync:outbox:u1',
      JSON.stringify([{ id: 'o1', version: 1, kind: 'deleteSale', eventId: 'e1', saleId: 's1', status: 'pending', attempts: 0 }]),
    );
    serverReplies({ data: null, error: null, status: 201, statusText: 'Created' });
    h.fetchAll.mockResolvedValue({ ...snapshot, events: [{ ...serverEvent, locked: true, lockedAt: 100 }] });
    await mount();
    expect(deletes).toEqual(['s1']);
    expect(app.outbox).toEqual({ pending: 0, held: 1, flushing: false });
    expect(app.rejected).toEqual([]);
    // The undo still shows locally.
    expect(app.events[0].sales).toEqual([]);
  });

  it('unlock event with held entry → flush called', async () => {
    const late = { ...pendingSale, timestamp: 200 };
    localStorage.setItem(
      'sync:outbox:u1',
      JSON.stringify([{ id: 'o1', version: 1, kind: 'insertSale', eventId: 'e1', sale: late, status: 'held-locked', attempts: 0 }]),
    );
    serverReplies(pgErr('42501', 'new row violates row-level security policy for table "sales"', 403));
    h.fetchAll.mockResolvedValue({ ...snapshot, events: [{ ...serverEvent, locked: true, lockedAt: 100 }] });
    await mount();
    expect(inserts).toHaveLength(1);
    expect(app.outbox.held).toBe(1);

    serverReplies({ data: null, error: null, status: 201, statusText: 'Created' });
    const events = h.channels[0].regs.find((r) => r.filter.table === 'events')!;
    await act(async () =>
      events.cb({
        table: 'events',
        eventType: 'UPDATE',
        old: {},
        new: {
          id: 'e1', catalog_id: 'c1', name: 'Tournoi', kind: 'tournoi', created_at: new Date(1).toISOString(),
          updated_at: '', created_by: null, locked_at: null, cash_float: null, cash_count: null,
        },
      }),
    );
    expect(inserts).toHaveLength(2);
    expect(app.outbox).toEqual({ pending: 0, held: 0, flushing: false });
    expect(app.events[0].locked).toBe(false);
  });

  it('sale sent during refresh is still present after hydrate', async () => {
    const real = await vi.importActual<typeof import('../sync/writes')>('../sync/writes');
    h.mirrorEvents.mockImplementation(real.mirrorEvents);
    serverReplies({ data: null, error: null, status: 201, statusText: 'Created' });
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    let resolveFetch!: (s: Snapshot) => void;
    h.fetchAll.mockImplementation(() => new Promise<Snapshot>((r) => (resolveFetch = r)));
    let refreshed!: Promise<void>;
    act(() => {
      refreshed = app.refresh();
    });
    // Recorded and sent while the fetch runs: the snapshot below predates it.
    await act(async () =>
      app.dispatchEvents({
        type: 'recordSale', eventId: 'e1', saleId: 's7', sellerId: 'u1',
        cart: [{ itemId: 'i1', qty: 1 }], catalog: [itemA], now: 50,
      }),
    );
    expect(inserts).toEqual([expect.objectContaining({ id: 's7' })]);
    expect(app.outbox.pending).toBe(0);
    await act(async () => {
      resolveFetch(snapshot);
      await refreshed;
    });
    expect(app.events[0].sales.map((s) => s.id)).toEqual(['s1', 's7']);
  });

  it('keeps the sale and refreshes the session on an expired JWT', async () => {
    seed();
    serverReplies(pgErr('PGRST303', 'JWT expired', 401));
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(h.fakeClient.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(app.events[0].sales.map((s) => s.id)).toEqual(['s1', 's9']);
    expect(app.outbox.pending).toBe(1);
    expect(app.rejected).toEqual([]);
  });

  it('passes the snapshot time and session helpers to mirrorEvents', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' }));
    const extras = h.mirrorEvents.mock.calls[0][5];
    expect(extras.snapshotAt).toBeGreaterThan(0);
    expect(typeof extras.isDisabled).toBe('function');
    expect(typeof extras.refreshSession).toBe('function');
  });
});

describe('AppProvider realtime', () => {
  const tableFilter = (ch: FakeChannel, table: string) => ch.regs.find((r) => r.filter.table === table);

  it('subscribes to the snapshot scope after hydrate and removes the channel on unmount', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    expect(h.channels).toHaveLength(1);
    const ch = h.channels[0];
    expect(ch.name).toMatch(/^sync:u1:/);
    expect(tableFilter(ch, 'sales')!.filter.filter).toBe('event_id=in.(e1)');
    expect(tableFilter(ch, 'items')!.filter.filter).toBe('catalog_id=in.(c1,c2)');
    act(() => root.unmount());
    expect(h.fakeClient.removeChannel).toHaveBeenCalledWith(ch);
    root = createRoot(container); // afterEach unmounts again
  });

  it('does not subscribe when the first fetch fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.fetchAll.mockRejectedValue(new Error('offline'));
    await mount();
    expect(h.channels).toHaveLength(0);
    err.mockRestore();
  });

  it('applies a Realtime sale INSERT to state without mirroring a write', async () => {
    const real = await vi.importActual<typeof import('../sync/writes')>('../sync/writes');
    h.mirrorEvents.mockImplementation(real.mirrorEvents);
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    const sales = tableFilter(h.channels[0], 'sales')!;
    await act(async () =>
      sales.cb({
        table: 'sales',
        eventType: 'INSERT',
        old: {},
        new: {
          id: 's2', event_id: 'e1', timestamp: 3, seller_id: 'u2', lines: [], total: 100,
          cash_given: null, change: null, created_at: '',
        },
      }),
    );
    expect(app.events[0].sales.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(h.mirrorEvents).toHaveBeenCalledTimes(1);
    expect(h.mirrorEvents.mock.calls[0][1].type).toBe('upsertSale');
    await expect(h.mirrorEvents.mock.results[0].value).resolves.toBeUndefined();
    expect(h.fakeClient.from).not.toHaveBeenCalled();
  });

  const snapshot2: Snapshot = {
    ...snapshot,
    events: [serverEvent, { ...serverEvent, id: 'e2', name: 'Finale', sales: [] }],
  };

  it('refetches on window online and on foreground, keeping the channel when the scope is unchanged', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(h.fetchAll).toHaveBeenCalledTimes(2);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(h.fetchAll).toHaveBeenCalledTimes(3);
    expect(h.fakeClient.channel).toHaveBeenCalledTimes(1);
    expect(h.fakeClient.removeChannel).not.toHaveBeenCalled();
  });

  it('resubscribes when a refresh changes the scope, removing the old channel first', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    h.fetchAll.mockResolvedValue(snapshot2);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(h.fakeClient.removeChannel).toHaveBeenCalledWith(h.channels[0]);
    expect(h.channels).toHaveLength(2);
    expect(tableFilter(h.channels[1], 'sales')!.filter.filter).toBe('event_id=in.(e1,e2)');
  });

  it('coalesces concurrent refreshes into one rerun and ends on the last snapshot', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    h.fetchAll.mockClear();
    const pending: ((s: Snapshot) => void)[] = [];
    h.fetchAll.mockImplementation(() => new Promise<Snapshot>((r) => pending.push(r)));
    let all!: Promise<unknown>;
    act(() => {
      all = Promise.all([app.refresh(), app.refresh(), app.refresh()]);
    });
    expect(h.fetchAll).toHaveBeenCalledTimes(1);
    await act(async () => pending[0](snapshot));
    expect(h.fetchAll).toHaveBeenCalledTimes(2);
    await act(async () => pending[1](snapshot2));
    await act(async () => {
      await all;
    });
    expect(h.fetchAll).toHaveBeenCalledTimes(2);
    expect(app.events.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  describe('channel status', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    it('does not refresh on the CLOSED caused by its own unsubscribe', async () => {
      h.fetchAll.mockResolvedValue(snapshot);
      await mount();
      h.fetchAll.mockResolvedValue(snapshot2);
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
      expect(h.fakeClient.removeChannel).toHaveBeenCalledTimes(1);
      await tick(60_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
    });

    it('two CHANNEL_ERRORs in a row schedule exactly one refresh', async () => {
      h.fetchAll.mockResolvedValue(snapshot);
      await mount();
      act(() => h.channels[0].status!('CHANNEL_ERROR'));
      await tick(500);
      act(() => h.channels[0].status!('CHANNEL_ERROR'));
      await tick(500);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
      await tick(60_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
    });

    it('CHANNEL_ERROR then SUBSCRIBED refreshes once', async () => {
      h.fetchAll.mockResolvedValue(snapshot);
      await mount();
      act(() => h.channels[0].status!('CHANNEL_ERROR'));
      await act(async () => h.channels[0].status!('SUBSCRIBED'));
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
      await tick(60_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
    });

    it('SUBSCRIBED with no prior down status does not refresh', async () => {
      h.fetchAll.mockResolvedValue(snapshot);
      await mount();
      await act(async () => h.channels[0].status!('SUBSCRIBED'));
      await tick(60_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(1);
    });

    it('a CLOSED from the server refreshes and opens a new channel', async () => {
      h.fetchAll.mockResolvedValue(snapshot);
      await mount();
      act(() => h.channels[0].status!('CLOSED'));
      await tick(1_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
      expect(h.channels).toHaveLength(2);
    });

    it('a server CLOSED after a CHANNEL_ERROR still reopens the channel', async () => {
      h.fetchAll.mockResolvedValue(snapshot);
      await mount();
      act(() => h.channels[0].status!('CHANNEL_ERROR'));
      act(() => h.channels[0].status!('CLOSED'));
      await tick(1_000);
      expect(h.fetchAll).toHaveBeenCalledTimes(2);
      expect(h.channels).toHaveLength(2);
    });
  });

  it('refetches when the user is added to an event', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    const members = tableFilter(h.channels[0], 'event_members')!;
    expect(members.filter.filter).toBe('user_id=eq.u1');
    await act(async () =>
      members.cb({ table: 'event_members', eventType: 'INSERT', old: {}, new: { event_id: 'e9', user_id: 'u1' } }),
    );
    expect(h.fetchAll).toHaveBeenCalledTimes(2);
  });
});
