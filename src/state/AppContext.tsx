import { createContext, useContext, useEffect, useReducer, useMemo, type ReactNode } from 'react';
import type { Item, SaleEvent, CartLine } from '../types';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import { eventsReducer, type EventsAction } from './eventsReducer';
import { cartReducer, type CartAction } from './cartReducer';
import { loadJSON, saveJSON, KEYS } from './persistence';

type AppState = {
  catalog: Item[];
  events: SaleEvent[];
  activeEventId: string | null;
  cart: CartLine[];
};

type AppContextValue = AppState & {
  activeEvent: SaleEvent | null;
  setActiveEvent: (id: string | null) => void;
  dispatchCatalog: (a: CatalogAction) => void;
  dispatchEvents: (a: EventsAction) => void;
  dispatchCart: (a: CartAction) => void;
};

const AppCtx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [catalog, dispatchCatalog] = useReducer(
    catalogReducer,
    undefined,
    () => loadJSON<Item[]>(KEYS.catalog, [])
  );
  const [events, dispatchEvents] = useReducer(
    eventsReducer,
    undefined,
    () => loadJSON<SaleEvent[]>(KEYS.events, [])
  );
  const [activeEventId, _setActiveEventId] = useReducer(
    (_: string | null, next: string | null) => next,
    undefined,
    () => loadJSON<string | null>(KEYS.activeEventId, null)
  );
  const [cart, dispatchCart] = useReducer(cartReducer, []);

  useEffect(() => { saveJSON(KEYS.catalog, catalog); }, [catalog]);
  useEffect(() => { saveJSON(KEYS.events, events); }, [events]);
  useEffect(() => { saveJSON(KEYS.activeEventId, activeEventId); }, [activeEventId]);

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
    events,
    activeEventId,
    cart,
    activeEvent,
    setActiveEvent: _setActiveEventId,
    dispatchCatalog,
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
