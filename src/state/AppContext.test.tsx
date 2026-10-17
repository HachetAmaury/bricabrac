import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Item, SaleEvent } from '../types';
import type { Snapshot } from '../sync/fetch';

const h = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  mirrorCatalog: vi.fn(),
  mirrorCategories: vi.fn(),
  mirrorEvents: vi.fn(),
  fakeClient: { fake: true },
}));

vi.mock('../lib/supabase', () => ({ supabase: h.fakeClient, hasSupabaseConfig: () => true }));
vi.mock('../sync/fetch', () => ({ fetchAll: h.fetchAll }));
vi.mock('../sync/writes', () => ({
  mirrorCatalog: h.mirrorCatalog,
  mirrorCategories: h.mirrorCategories,
  mirrorEvents: h.mirrorEvents,
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    status: 'signedIn',
    session: { user: { id: 'u1' } },
    profile: { id: 'u1', displayName: 'Nat', isAdmin: false, disabled: false },
    lastError: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
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
  h.fetchAll.mockReset();
  h.mirrorCatalog.mockReset().mockResolvedValue(undefined);
  h.mirrorCategories.mockReset().mockResolvedValue(undefined);
  h.mirrorEvents.mockReset().mockResolvedValue(undefined);
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
    act(() => app.dispatchCatalog({ type: 'edit', id: 'i1', name: 'Gaufre', price: 300 }));
    expect(h.mirrorCatalog).toHaveBeenCalledTimes(1);
    const [client, action, next] = h.mirrorCatalog.mock.calls[0];
    expect(client).toBe(h.fakeClient);
    expect(action).toEqual({ type: 'edit', id: 'i1', name: 'Gaufre', price: 300 });
    expect(next).toEqual([{ ...itemA, name: 'Gaufre', price: 300 }, itemB]);
    expect(app.allItems[0].name).toBe('Gaufre');

    // Unknown id: the reducer returns the same reference, so nothing is mirrored.
    act(() => app.dispatchCatalog({ type: 'archive', id: 'nope' }));
    expect(h.mirrorCatalog).toHaveBeenCalledTimes(1);
  });

  it('passes the removed sale id for undoMyLast', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    await mount();
    act(() => app.dispatchEvents({ type: 'undoMyLast', eventId: 'e1', sellerId: 'u1' }));
    expect(h.mirrorEvents).toHaveBeenCalledTimes(1);
    const [, , next, removed] = h.mirrorEvents.mock.calls[0];
    expect(removed).toBe('s1');
    expect(next[0].sales).toEqual([]);
  });

  it('keeps the local change and goes offline when a mirror rejects', async () => {
    h.fetchAll.mockResolvedValue(snapshot);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.mirrorEvents.mockRejectedValue(new Error('network'));
    await mount();
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' }));
    expect(app.events[0].name).toBe('Finale');
    expect(app.syncStatus).toBe('offline');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
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
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale' }));
    expect(app.syncStatus).toBe('offline');
    await act(async () => app.dispatchEvents({ type: 'rename', id: 'e1', name: 'Finale 2' }));
    expect(app.syncStatus).toBe('online');
    err.mockRestore();
  });
});
