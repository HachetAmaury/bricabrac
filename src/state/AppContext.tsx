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

export type SyncStatus = 'online' | 'offline' | 'syncing';

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');

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

  const refresh = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const snap = await fetchAll(supabase);
      if (!mounted.current) return;
      apply(itemsRef, catalogReducer, rawDispatchCatalog, { type: 'hydrate', items: snap.items });
      apply(categoriesRef, categoriesReducer, rawDispatchCategories, {
        type: 'hydrate',
        categories: snap.categories
      });
      apply(eventsRef, eventsReducer, rawDispatchEvents, { type: 'hydrate', events: snap.events });
      setCatalogs(snap.catalogs);
      setProfiles(snap.profiles);
      setSyncStatus('online');
    } catch (err) {
      console.error('[sync] fetch failed, using cache', err);
      if (mounted.current) setSyncStatus('offline');
    }
  }, []);

  useEffect(() => {
    if (userId) void refresh();
  }, [userId, refresh]);

  const onMirrorError = useCallback((err: unknown) => {
    console.error('[sync] write failed', err);
    if (mounted.current) setSyncStatus('offline');
  }, []);

  const dispatchCatalog = useCallback(
    (a: CatalogAction) => {
      const { prev, next } = apply(itemsRef, catalogReducer, rawDispatchCatalog, a);
      if (prev !== next) mirrorCatalog(supabase, a, next).catch(onMirrorError);
    },
    [onMirrorError]
  );
  const dispatchCategories = useCallback(
    (a: CategoriesAction) => {
      const { prev, next } = apply(categoriesRef, categoriesReducer, rawDispatchCategories, a);
      if (prev !== next) mirrorCategories(supabase, a, next).catch(onMirrorError);
    },
    [onMirrorError]
  );
  const dispatchEvents = useCallback(
    (a: EventsAction) => {
      const removedSaleId =
        a.type === 'undoMyLast' ? lastSaleIdOf(eventsRef.current, a.eventId, a.sellerId) : undefined;
      const { prev, next } = apply(eventsRef, eventsReducer, rawDispatchEvents, a);
      if (prev !== next) mirrorEvents(supabase, a, next, removedSaleId).catch(onMirrorError);
    },
    [onMirrorError]
  );

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
