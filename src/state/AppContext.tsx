import { createContext, useContext, useEffect, useReducer, useMemo, useRef, type ReactNode } from 'react';
import type { Item, SaleEvent, CartLine, Category } from '../types';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import { categoriesReducer, type CategoriesAction } from './categoriesReducer';
import { eventsReducer, type EventsAction } from './eventsReducer';
import { cartReducer, type CartAction } from './cartReducer';
import { loadJSON, saveJSON, KEYS } from './persistence';
import { DEFAULT_CATALOG } from './defaultCatalog';

const DEMO_EVENT_ID = 'demo-event';

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
      const existing = loadJSON<Item[]>(KEYS.catalog, []);
      const existingIds = new Set(existing.map((i) => i.id));
      const missing = DEFAULT_CATALOG.filter((i) => !existingIds.has(i.id));
      return missing.length === 0 ? existing : [...existing, ...missing];
    }
  );
  const [categories, dispatchCategories] = useReducer(
    categoriesReducer,
    undefined,
    () => loadJSON<Category[]>(KEYS.categories, [])
  );
  const [events, dispatchEvents] = useReducer(
    eventsReducer,
    undefined,
    () => {
      const existing = loadJSON<SaleEvent[]>(KEYS.events, []);
      if (existing.some((e) => e.id === DEMO_EVENT_ID)) return existing;
      const demo: SaleEvent = {
        id: DEMO_EVENT_ID,
        name: 'Démo',
        kind: 'autre',
        createdAt: Date.now(),
        enabledItemIds: DEFAULT_CATALOG.map((i) => i.id),
        sales: []
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
          dispatchCatalog({ type: 'hydrate', items: JSON.parse(e.newValue) });
        } else if (e.key === KEYS.categories) {
          dispatchCategories({ type: 'hydrate', categories: JSON.parse(e.newValue) });
        } else if (e.key === KEYS.events) {
          dispatchEvents({ type: 'hydrate', events: JSON.parse(e.newValue) });
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
