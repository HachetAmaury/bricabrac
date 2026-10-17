import { createContext, useContext, useEffect, useReducer, useMemo, useRef, type ReactNode } from 'react';
import type { Item, SaleEvent, CartLine, Category } from '../types';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import { categoriesReducer, type CategoriesAction } from './categoriesReducer';
import { eventsReducer, type EventsAction } from './eventsReducer';
import { cartReducer, type CartAction } from './cartReducer';
import { loadJSON, saveJSON, KEYS } from './persistence';
import { DEFAULT_CATALOG } from './defaultCatalog';

const DEMO_EVENT_ID = 'demo-event';

// Old localStorage payloads predate catalogs, sellers and lock timestamps.
// Fill in defaults so nothing downstream sees undefined. Removed when the
// storage layer is replaced by the Supabase sync.
const LOCAL = 'local';
const withItemDefaults = (i: Item): Item => ({ ...i, catalogId: i.catalogId ?? LOCAL });
const withCategoryDefaults = (c: Category): Category => ({ ...c, catalogId: c.catalogId ?? LOCAL });
const withEventDefaults = (e: SaleEvent): SaleEvent => {
  const locked = e.locked ?? false;
  return {
    ...e,
    catalogId: e.catalogId ?? LOCAL,
    locked,
    lockedAt: e.lockedAt ?? (locked ? e.createdAt : null),
    sales: e.sales.map((s) => ({ ...s, sellerId: s.sellerId ?? LOCAL }))
  };
};

type AppState = {
  catalog: Item[];
  categories: Category[];
  events: SaleEvent[];
  activeEventId: string | null;
  cart: CartLine[];
};

type AppContextValue = AppState & {
  activeEvent: SaleEvent | null;
  user: string;
  setUser: (name: string) => void;
  setActiveEvent: (id: string | null) => void;
  dispatchCatalog: (a: CatalogAction) => void;
  dispatchCategories: (a: CategoriesAction) => void;
  dispatchEvents: (a: EventsAction) => void;
  dispatchCart: (a: CartAction) => void;
};

const AppCtx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [catalog, dispatchCatalog] = useReducer(
    catalogReducer,
    undefined,
    () => {
      const stored = localStorage.getItem(KEYS.catalog);
      if (stored === null) return DEFAULT_CATALOG;
      const existing = loadJSON<Item[]>(KEYS.catalog, []).map(withItemDefaults);
      const existingIds = new Set(existing.map((i) => i.id));
      const missing = DEFAULT_CATALOG.filter((i) => !existingIds.has(i.id));
      return missing.length === 0 ? existing : [...existing, ...missing];
    }
  );
  const [categories, dispatchCategories] = useReducer(
    categoriesReducer,
    undefined,
    () => loadJSON<Category[]>(KEYS.categories, []).map(withCategoryDefaults)
  );
  const [events, dispatchEvents] = useReducer(
    eventsReducer,
    undefined,
    () => {
      const existing = loadJSON<SaleEvent[]>(KEYS.events, []).map(withEventDefaults);
      if (existing.some((e) => e.id === DEMO_EVENT_ID)) return existing;
      const demo: SaleEvent = {
        id: DEMO_EVENT_ID,
        name: 'Démo',
        kind: 'autre',
        createdAt: Date.now(),
        catalogId: LOCAL,
        enabledItemIds: DEFAULT_CATALOG.map((i) => i.id),
        sales: [],
        locked: false,
        lockedAt: null
      };
      return [...existing, demo];
    }
  );
  const [activeEventId, _setActiveEventId] = useReducer(
    (_: string | null, next: string | null) => next,
    undefined,
    () => {
      const stored = loadJSON<string | null>(KEYS.activeEventId, null);
      return stored ?? DEMO_EVENT_ID;
    }
  );
  const [user, _setUser] = useReducer(
    (_: string, next: string) => next,
    undefined,
    () => loadJSON<string>(KEYS.user, '')
  );
  const [cart, dispatchCart] = useReducer(cartReducer, []);

  // Guard so the storage-event listener doesn't immediately re-persist what it
  // just hydrated (which would echo back to the originating session).
  const hydrating = useRef(false);

  useEffect(() => { if (!hydrating.current) saveJSON(KEYS.catalog, catalog); }, [catalog]);
  useEffect(() => { if (!hydrating.current) saveJSON(KEYS.categories, categories); }, [categories]);
  useEffect(() => { if (!hydrating.current) saveJSON(KEYS.events, events); }, [events]);
  useEffect(() => { if (!hydrating.current) saveJSON(KEYS.activeEventId, activeEventId); }, [activeEventId]);
  useEffect(() => { if (!hydrating.current) saveJSON(KEYS.user, user); }, [user]);

  // Live multi-session sync: when another session of the same browser writes to
  // localStorage, mirror the change here so every open session behaves as one
  // shared tablet. (Cross-device sync would need a backend; this covers tabs /
  // windows / installed PWA instances on the same device.)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.newValue === null) return;
      hydrating.current = true;
      try {
        if (e.key === KEYS.catalog) {
          dispatchCatalog({ type: 'hydrate', items: (JSON.parse(e.newValue) as Item[]).map(withItemDefaults) });
        } else if (e.key === KEYS.categories) {
          dispatchCategories({ type: 'hydrate', categories: (JSON.parse(e.newValue) as Category[]).map(withCategoryDefaults) });
        } else if (e.key === KEYS.events) {
          dispatchEvents({ type: 'hydrate', events: (JSON.parse(e.newValue) as SaleEvent[]).map(withEventDefaults) });
        } else if (e.key === KEYS.activeEventId) {
          _setActiveEventId(JSON.parse(e.newValue));
        } else if (e.key === KEYS.user) {
          _setUser(JSON.parse(e.newValue));
        }
      } catch {
        // Ignore malformed payloads from another session.
      } finally {
        // Release the guard after this tick's persistence effects have run.
        queueMicrotask(() => { hydrating.current = false; });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (activeEventId && !events.some((e) => e.id === activeEventId)) {
      _setActiveEventId(null);
    }
  }, [events, activeEventId]);

  useEffect(() => {
    dispatchCart({ type: 'clear' });
  }, [activeEventId]);

  useEffect(() => {
    const archived = new Set(catalog.filter((i) => i.archived).map((i) => i.id));
    cart.forEach((line) => {
      if (archived.has(line.itemId)) {
        dispatchCart({ type: 'dropItem', itemId: line.itemId });
      }
    });
  }, [catalog, cart]);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [events, activeEventId]
  );

  const value: AppContextValue = {
    catalog,
    categories,
    events,
    activeEventId,
    cart,
    activeEvent,
    user,
    setUser: _setUser,
    setActiveEvent: _setActiveEventId,
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
