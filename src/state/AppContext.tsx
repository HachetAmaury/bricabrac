import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode
} from 'react';
import type { Item, SaleEvent, CartLine, Category, Catalog, Profile } from '../types';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import { categoriesReducer, type CategoriesAction } from './categoriesReducer';
import { eventsReducer, type EventsAction } from './eventsReducer';
import { cartReducer, type CartAction } from './cartReducer';
import { loadJSON, saveJSON, KEYS } from './persistence';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../sync/fetch';
import { mirrorCatalog, mirrorCategories, mirrorEvents } from '../sync/writes';
import { nextScope, useRealtimeSync, type RealtimeScope } from '../sync/useRealtimeSync';
import { createOutbox, OutboxOfflineError, type OutboxEntry, type RejectedSale } from '../sync/outbox';

export type SyncStatus = 'online' | 'offline' | 'syncing';

/** Sale writes waiting in the outbox. `flushing` is true while a send is running. */
export type OutboxStats = { pending: number; held: number; flushing: boolean };

type AppContextValue = {
  /** Items of the active event's catalog (empty when no event is active). */
  catalog: Item[];
  /** Categories of the active event's catalog (empty when no event is active). */
  categories: Category[];
  /** Every item / category the user can see, across catalogs (backup export). */
  allItems: Item[];
  allCategories: Category[];
  catalogs: Catalog[];
  profiles: Profile[];
  events: SaleEvent[];
  activeEventId: string | null;
  cart: CartLine[];
  activeEvent: SaleEvent | null;
  syncStatus: SyncStatus;
  outbox: OutboxStats;
  /** Sales the server refused for good: shown until the user dismisses them. */
  rejected: RejectedSale[];
  dismissRejected: () => void;
  refresh: () => Promise<void>;
  setActiveEvent: (id: string | null) => void;
  dispatchCatalog: (a: CatalogAction) => void;
  dispatchCategories: (a: CategoriesAction) => void;
  dispatchEvents: (a: EventsAction) => void;
  dispatchCart: (a: CartAction) => void;
};

const AppCtx = createContext<AppContextValue | null>(null);

/**
 * Runs the pure reducer on the ref (always the latest state, even between two
 * dispatches in the same tick), dispatches, and returns prev/next so callers
 * can mirror the exact state the reducer will commit.
 */
function apply<S, A>(
  ref: MutableRefObject<S>,
  reducer: (s: S, a: A) => S,
  dispatch: Dispatch<A>,
  action: A
): { prev: S; next: S } {
  const prev = ref.current;
  const next = reducer(prev, action);
  ref.current = next;
  dispatch(action);
  return { prev, next };
}

function lastSaleIdOf(events: SaleEvent[], eventId: string, sellerId: string): string | undefined {
  const sales = events.find((e) => e.id === eventId)?.sales ?? [];
  for (let i = sales.length - 1; i >= 0; i--) {
    if (sales[i].sellerId === sellerId) return sales[i].id;
  }
  return undefined;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Initial state comes from the last server snapshot so the app renders
  // instantly (and offline); the mount effect below replaces it.
  const [allItems, rawDispatchCatalog] = useReducer(catalogReducer, undefined, () =>
    loadJSON<Item[]>(KEYS.items, [])
  );
  const [allCategories, rawDispatchCategories] = useReducer(categoriesReducer, undefined, () =>
    loadJSON<Category[]>(KEYS.categories, [])
  );
  const [events, rawDispatchEvents] = useReducer(eventsReducer, undefined, () =>
    loadJSON<SaleEvent[]>(KEYS.events, [])
  );
  const [catalogs, setCatalogs] = useState<Catalog[]>(() => loadJSON<Catalog[]>(KEYS.catalogs, []));
  const [profiles, setProfiles] = useState<Profile[]>(() => loadJSON<Profile[]>(KEYS.profiles, []));
  const [activeEventId, setActiveEventId] = useState<string | null>(() =>
    loadJSON<string | null>(KEYS.activeEventId, null)
  );
  const [cart, dispatchCart] = useReducer(cartReducer, []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing'); // only mounted signed in, fetch starts at once
  const [realtimeScope, setRealtimeScope] = useState<RealtimeScope | null>(null);
  // Per account: pending sales of one account are never sent under another's session.
  const [outbox] = useState(() => createOutbox(`sync:outbox:${userId}`, `sync:rejected:${userId}`));
  const [outboxVersion, bumpOutbox] = useReducer((n: number) => n + 1, 0);

  const itemsRef = useRef(allItems);
  const categoriesRef = useRef(allCategories);
  const eventsRef = useRef(events);

  // Local cache: every committed change (server hydrate or local edit) is kept
  // so the next launch starts from it.
  useEffect(() => saveJSON(KEYS.items, allItems), [allItems]);
  useEffect(() => saveJSON(KEYS.categories, allCategories), [allCategories]);
  useEffect(() => saveJSON(KEYS.events, events), [events]);
  useEffect(() => saveJSON(KEYS.catalogs, catalogs), [catalogs]);
  useEffect(() => saveJSON(KEYS.profiles, profiles), [profiles]);
  useEffect(() => saveJSON(KEYS.activeEventId, activeEventId), [activeEventId]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const flushOutbox = useCallback(async () => {
    if (!navigator.onLine) return;
    await outbox.flush(supabase, { eventsById: new Map(eventsRef.current.map((e) => [e.id, e])) });
  }, [outbox]);

  // A server snapshot does not contain what is still queued: replay the queue
  // on top of it (in order) so a hydrate never hides an unsent sale or undo.
  // `earlier` adds ops that were queued when the fetch started and were sent
  // while it ran: the snapshot may predate them.
  const reapplyOutbox = useCallback(
    (earlier: OutboxEntry[]) => {
      const rejectedIds = new Set(outbox.rejected().map((r) => r.sale.id));
      const seen = new Set<string>();
      for (const e of [...earlier, ...outbox.entries()]) {
        if (seen.has(e.id) || e.version !== 1) continue;
        seen.add(e.id);
        const action: EventsAction =
          e.kind === 'insertSale'
            ? { type: 'upsertSale', eventId: e.eventId, sale: e.sale }
            : { type: 'removeSale', eventId: e.eventId, saleId: e.saleId };
        if (action.type === 'upsertSale' && rejectedIds.has(action.sale.id)) continue;
        apply(eventsRef, eventsReducer, rawDispatchEvents, action);
      }
    },
    [outbox]
  );

  // Until the first snapshot lands, local events may be an empty or stale
  // cache: the outbox would misread "event not found". So the very first
  // flush runs after the first hydrate; later refreshes flush first so the
  // snapshot already contains our sales.
  const hydrated = useRef(false);
  const refreshOnce = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      if (hydrated.current && outbox.entries().length > 0) await flushOutbox();
      const earlier = outbox.entries();
      const snap = await fetchAll(supabase);
      if (!mounted.current) return;
      apply(itemsRef, catalogReducer, rawDispatchCatalog, { type: 'hydrate', items: snap.items });
      apply(categoriesRef, categoriesReducer, rawDispatchCategories, {
        type: 'hydrate',
        categories: snap.categories
      });
      apply(eventsRef, eventsReducer, rawDispatchEvents, { type: 'hydrate', events: snap.events });
      // Same tick as the hydrate, so the cache is never saved without them.
      reapplyOutbox(earlier);
      setCatalogs(snap.catalogs);
      setProfiles(snap.profiles);
      // Resubscribes Realtime only when the snapshot covers other ids.
      const scope = { eventIds: snap.events.map((e) => e.id), catalogIds: snap.catalogs.map((c) => c.id) };
      setRealtimeScope((prev) => nextScope(prev, scope));
      setSyncStatus('online');
      if (!hydrated.current) {
        hydrated.current = true;
        await flushOutbox();
      }
    } catch (err) {
      console.error('[sync] fetch failed, using cache', err);
      if (mounted.current) setSyncStatus('offline');
    }
  }, [flushOutbox, outbox, reapplyOutbox]);

  // Wake fires visibilitychange + online together and memberships change per
  // row: one fetch at a time, and calls during it fold into a single rerun so
  // snapshots never land out of order.
  const inFlight = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  const refresh = useCallback(() => {
    if (inFlight.current) {
      rerun.current = true;
      return inFlight.current;
    }
    const run = async () => {
      do {
        rerun.current = false;
        await refreshOnce();
      } while (rerun.current && mounted.current);
    };
    const p = run().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
    return p;
  }, [refreshOnce]);

  // A sale the server refused for good is rolled back locally (it stays
  // listed in `rejected`, with an export). Each one once per session, so a
  // later hydrate is not second-guessed.
  const rolledBack = useRef(new Set<string>());
  useEffect(() => {
    const onChange = () => {
      for (const r of outbox.rejected()) {
        const key = `${r.eventId}:${r.sale.id}`;
        if (r.kind !== 'insertSale' || rolledBack.current.has(key)) continue;
        rolledBack.current.add(key);
        apply(eventsRef, eventsReducer, rawDispatchEvents, { type: 'removeSale', eventId: r.eventId, saleId: r.sale.id });
      }
      if (mounted.current) bumpOutbox();
    };
    for (const r of outbox.rejected()) rolledBack.current.add(`${r.eventId}:${r.sale.id}`);
    return outbox.subscribe(onChange);
  }, [outbox]);

  const outboxStats = useMemo<OutboxStats>(() => {
    void outboxVersion;
    const entries = outbox.entries();
    const held = entries.filter((e) => e.status === 'held-locked').length;
    return { pending: entries.length - held, held, flushing: outbox.flushing() };
  }, [outbox, outboxVersion]);
  const rejected = useMemo(() => {
    void outboxVersion;
    return outbox.rejected();
  }, [outbox, outboxVersion]);
  const dismissRejected = useCallback(() => outbox.dismissRejected(), [outbox]);

  useEffect(() => {
    if (userId) void refresh();
  }, [userId, refresh]);

  // A write that reached the server proves we're back online; leave 'syncing'
  // alone so an in-progress refresh still reports itself.
  const onMirrorOk = useCallback(() => {
    if (mounted.current) setSyncStatus((s) => (s === 'offline' ? 'online' : s));
  }, []);
  const onMirrorError = useCallback((err: unknown) => {
    // Offline sales wait in the outbox: expected, not an error to log.
    if (!(err instanceof OutboxOfflineError)) console.error('[sync] write failed', err);
    if (mounted.current) setSyncStatus('offline');
  }, []);

  const dispatchCatalog = useCallback(
    (a: CatalogAction) => {
      const { prev, next } = apply(itemsRef, catalogReducer, rawDispatchCatalog, a);
      if (prev !== next) mirrorCatalog(supabase, a, next).then(onMirrorOk, onMirrorError);
    },
    [onMirrorOk, onMirrorError]
  );
  const dispatchCategories = useCallback(
    (a: CategoriesAction) => {
      const { prev, next } = apply(categoriesRef, categoriesReducer, rawDispatchCategories, a);
      if (prev !== next) mirrorCategories(supabase, a, next).then(onMirrorOk, onMirrorError);
    },
    [onMirrorOk, onMirrorError]
  );
  const dispatchEvents = useCallback(
    (a: EventsAction) => {
      const removedSaleId =
        a.type === 'undoMyLast' ? lastSaleIdOf(eventsRef.current, a.eventId, a.sellerId) : undefined;
      const { prev, next } = apply(eventsRef, eventsReducer, rawDispatchEvents, a);
      if (prev !== next) mirrorEvents(supabase, a, next, removedSaleId, outbox).then(onMirrorOk, onMirrorError);
    },
    [onMirrorOk, onMirrorError, outbox]
  );

  // Server-origin actions go through the wrapped dispatchers: they are no-ops in the mirror.
  useRealtimeSync({
    client: supabase,
    userId,
    scope: realtimeScope,
    refresh,
    itemsRef,
    categoriesRef,
    eventsRef,
    onItem: dispatchCatalog,
    onCategory: dispatchCategories,
    onEvent: dispatchEvents
  });

  useEffect(() => {
    if (activeEventId && !events.some((e) => e.id === activeEventId)) {
      setActiveEventId(null);
    }
  }, [events, activeEventId]);

  useEffect(() => {
    dispatchCart({ type: 'clear' });
  }, [activeEventId]);

  useEffect(() => {
    const archived = new Set(allItems.filter((i) => i.archived).map((i) => i.id));
    cart.forEach((line) => {
      if (archived.has(line.itemId)) {
        dispatchCart({ type: 'dropItem', itemId: line.itemId });
      }
    });
  }, [allItems, cart]);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [events, activeEventId]
  );
  const activeCatalogId = activeEvent?.catalogId ?? null;
  const catalog = useMemo(
    () => (activeCatalogId ? allItems.filter((i) => i.catalogId === activeCatalogId) : []),
    [allItems, activeCatalogId]
  );
  const categories = useMemo(
    () => (activeCatalogId ? allCategories.filter((c) => c.catalogId === activeCatalogId) : []),
    [allCategories, activeCatalogId]
  );

  const value: AppContextValue = {
    catalog,
    categories,
    allItems,
    allCategories,
    catalogs,
    profiles,
    events,
    activeEventId,
    cart,
    activeEvent,
    syncStatus,
    outbox: outboxStats,
    rejected,
    dismissRejected,
    refresh,
    setActiveEvent: setActiveEventId,
    dispatchCatalog,
    dispatchCategories,
    dispatchEvents,
    dispatchCart
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
