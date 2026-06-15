import { uuid } from '../lib/uuid';
import { sumLines } from '../lib/money';
import type { SaleEvent, EventKind, CartLine, Item, SaleLine, Sale, CashCount } from '../types';

export type EventsAction =
  | { type: 'create'; name: string; kind: EventKind; enabledItemIds: string[] }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'toggleItem'; eventId: string; itemId: string }
  | {
      type: 'recordSale';
      eventId: string;
      cart: CartLine[];
      catalog: Item[];
      cashGiven?: number;
      now: number;
    }
  | { type: 'undoLast'; eventId: string }
  | { type: 'setLocked'; id: string; locked: boolean }
  | { type: 'setCashFloat'; id: string; cashFloat: number }
  | { type: 'setCashCount'; id: string; cashCount: CashCount }
  | { type: 'hydrate'; events: SaleEvent[] };

function mapEvent(state: SaleEvent[], id: string, fn: (e: SaleEvent) => SaleEvent): SaleEvent[] {
  const idx = state.findIndex((e) => e.id === id);
  if (idx < 0) return state;
  const next = state.slice();
  next[idx] = fn(next[idx]);
  return next;
}

// A locked event is frozen: its sales, enabled items, and cash counts must not
// change. This is the single source of truth — the UI mirrors it, but every
// mutating action is also rejected here so locked data can never be touched.
function isLocked(state: SaleEvent[], id: string): boolean {
  return state.find((e) => e.id === id)?.locked ?? false;
}

export function eventsReducer(state: SaleEvent[], action: EventsAction): SaleEvent[] {
  switch (action.type) {
    case 'create':
      return [
        ...state,
        {
          id: uuid(),
          name: action.name,
          kind: action.kind,
          createdAt: Date.now(),
          enabledItemIds: [...action.enabledItemIds],
          sales: []
        }
      ];
    case 'rename':
      return mapEvent(state, action.id, (e) => ({ ...e, name: action.name }));
    case 'delete':
      if (isLocked(state, action.id)) return state; // can't delete a locked event
      return state.filter((e) => e.id !== action.id);
    case 'toggleItem':
      if (isLocked(state, action.eventId)) return state; // items are frozen when locked
      return mapEvent(state, action.eventId, (e) => {
        const has = e.enabledItemIds.includes(action.itemId);
        return {
          ...e,
          enabledItemIds: has
            ? e.enabledItemIds.filter((id) => id !== action.itemId)
            : [...e.enabledItemIds, action.itemId]
        };
      });
    case 'recordSale':
      return mapEvent(state, action.eventId, (e) => {
        if (e.locked) return e; // no sales on a locked event
        const lines: SaleLine[] = action.cart
          .map((cl) => {
            const item = action.catalog.find((i) => i.id === cl.itemId);
            if (!item) return null;
            return { itemId: item.id, name: item.name, price: item.price, qty: cl.qty };
          })
          .filter((x): x is SaleLine => x !== null);
        const total = sumLines(lines);
        const sale: Sale = {
          id: uuid(),
          timestamp: action.now,
          lines,
          total,
          cashGiven: action.cashGiven,
          change: action.cashGiven !== undefined ? action.cashGiven - total : undefined
        };
        return { ...e, sales: [...e.sales, sale] };
      });
    case 'undoLast': {
      const idx = state.findIndex((e) => e.id === action.eventId);
      if (idx < 0) return state;
      if (state[idx].locked) return state; // can't remove sales from a locked event
      if (state[idx].sales.length === 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], sales: next[idx].sales.slice(0, -1) };
      return next;
    }
    case 'setLocked':
      return mapEvent(state, action.id, (e) => ({ ...e, locked: action.locked }));
    case 'setCashFloat':
      if (isLocked(state, action.id)) return state; // cash is frozen when locked
      return mapEvent(state, action.id, (e) => ({ ...e, cashFloat: action.cashFloat }));
    case 'setCashCount':
      if (isLocked(state, action.id)) return state; // cash is frozen when locked
      return mapEvent(state, action.id, (e) => ({ ...e, cashCount: action.cashCount }));
    case 'hydrate':
      return action.events;
  }
}
