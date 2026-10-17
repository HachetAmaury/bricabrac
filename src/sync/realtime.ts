import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoryRow, Database, EventRow, ItemRow, SaleRow } from '../lib/supabase';
import type { SaleEvent } from '../types';
import type { CatalogAction } from '../state/catalogReducer';
import type { CategoriesAction } from '../state/categoriesReducer';
import type { EventsAction } from '../state/eventsReducer';
import { categoryFromRow, eventFromRows, itemFromRow, saleFromRow } from './mappers';

/**
 * What the current subscription covers. Realtime DELETE events are not
 * filtered by RLS nor by the `in.()` filter, so every DELETE is checked here
 * against the scope and against what we hold locally.
 */
export type SyncScope = {
  eventIds: Set<string>;
  catalogIds: Set<string>;
  userId: string;
  /** sale id → event id, so a DELETE carrying only `{ id }` can be routed. */
  saleEventById: Map<string, string>;
};

/** The part of `RealtimePostgresChangesPayload` we read. */
export type ChangePayload = {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type LocalLookups = {
  getEvent(id: string): SaleEvent | undefined;
  hasItem(id: string): boolean;
  hasCategory(id: string): boolean;
};

export type SyncHandlers = LocalLookups & {
  onItem(a: CatalogAction): void;
  onCategory(a: CategoriesAction): void;
  onEvent(a: EventsAction): void;
  onMembershipChanged(): void;
  /** Every channel status except the CLOSED caused by our own unsubscribe. */
  onStatus?(status: string): void;
};

export type ChangeHandlers = Omit<SyncHandlers, 'onStatus'> & {
  /** A row of `event_items` changed for this event; the full list must be re-read. */
  onEventItemsChanged(eventId: string): void;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Maps one Realtime change to reducer actions. Pure apart from the handlers. */
export function applyChange(p: ChangePayload, scope: SyncScope, h: ChangeHandlers): void {
  const del = p.eventType === 'DELETE';
  const row = del ? p.old : p.new;
  const id = str(row.id);

  switch (p.table) {
    case 'items': {
      if (!id) return;
      if (del) {
        const catalogId = str(row.catalog_id);
        if (catalogId !== undefined && !scope.catalogIds.has(catalogId)) return;
        if (h.hasItem(id)) h.onItem({ type: 'remove', id });
        return;
      }
      if (!scope.catalogIds.has(str(row.catalog_id) ?? '')) return;
      h.onItem({ type: 'upsert', item: itemFromRow(row as ItemRow) });
      return;
    }
    case 'categories': {
      if (!id) return;
      if (del) {
        const catalogId = str(row.catalog_id);
        if (catalogId !== undefined && !scope.catalogIds.has(catalogId)) return;
        if (h.hasCategory(id)) h.onCategory({ type: 'remove', id });
        return;
      }
      if (!scope.catalogIds.has(str(row.catalog_id) ?? '')) return;
      h.onCategory({ type: 'upsert', category: categoryFromRow(row as CategoryRow) });
      return;
    }
    case 'events': {
      if (!id || !scope.eventIds.has(id)) return;
      if (del) {
        h.onEvent({ type: 'removeEvent', id });
        return;
      }
      const enabled = h.getEvent(id)?.enabledItemIds ?? [];
      const { sales: _sales, ...event } = eventFromRows(row as EventRow, enabled, []);
      h.onEvent({ type: 'upsertEvent', event });
      return;
    }
    case 'sales': {
      if (!id) return;
      if (del) {
        const known = scope.saleEventById.get(id);
        const eventId = str(row.event_id) ?? known;
        if (!known || known !== eventId || !scope.eventIds.has(eventId)) return;
        h.onEvent({ type: 'removeSale', eventId, saleId: id });
        return;
      }
      const eventId = str(row.event_id);
      if (!eventId || !scope.eventIds.has(eventId)) return;
      h.onEvent({ type: 'upsertSale', eventId, sale: saleFromRow(row as SaleRow) });
      return;
    }
    case 'event_items': {
      const eventId = str(row.event_id);
      if (eventId && scope.eventIds.has(eventId)) h.onEventItemsChanged(eventId);
      return;
    }
    case 'event_members': {
      if (str(row.user_id) === scope.userId) h.onMembershipChanged();
      return;
    }
  }
}

const EVENT_ITEMS_DEBOUNCE_MS = 50;
/** Realtime rejects `in.()` filters with more values than this. */
const IN_FILTER_MAX = 100;

// realtime-js returns the existing channel for a topic it still holds, and a
// removed channel only leaves that list once the server acks the leave. A
// per-subscription suffix keeps a quick resubscribe from reusing the old one.
let channelSeq = 0;

/**
 * Opens one channel `sync:<userId>:<n>` covering the scope. Returns the
 * unsubscribe, which removes the channel and drops pending refetches.
 */
export function subscribeAll(
  client: SupabaseClient<Database>,
  scope: SyncScope,
  handlers: SyncHandlers,
): () => void {
  let closed = false;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const refetchEventItems = async (eventId: string) => {
    const { data, error } = await client.from('event_items').select('item_id').eq('event_id', eventId);
    if (closed) return;
    if (error) {
      console.error('[sync] event_items refetch failed', error);
      return;
    }
    handlers.onEvent({ type: 'setEnabledItems', eventId, itemIds: (data ?? []).map((r) => r.item_id) });
  };

  const change: ChangeHandlers = {
    ...handlers,
    onEventItemsChanged(eventId) {
      clearTimeout(timers.get(eventId));
      timers.set(
        eventId,
        setTimeout(() => {
          timers.delete(eventId);
          void refetchEventItems(eventId);
        }, EVENT_ITEMS_DEBOUNCE_MS),
      );
    },
  };

  const inList = (ids: Set<string>) => {
    if (ids.size > IN_FILTER_MAX) {
      console.warn(`[sync] ${ids.size} ids exceed the Realtime in() cap of ${IN_FILTER_MAX}; that listener may be rejected`);
    }
    return `in.(${[...ids].join(',')})`;
  };
  const listeners: { table: string; filter: string }[] = [];
  if (scope.catalogIds.size > 0) {
    listeners.push({ table: 'items', filter: `catalog_id=${inList(scope.catalogIds)}` });
    listeners.push({ table: 'categories', filter: `catalog_id=${inList(scope.catalogIds)}` });
  }
  if (scope.eventIds.size > 0) {
    listeners.push({ table: 'events', filter: `id=${inList(scope.eventIds)}` });
    listeners.push({ table: 'event_items', filter: `event_id=${inList(scope.eventIds)}` });
    listeners.push({ table: 'sales', filter: `event_id=${inList(scope.eventIds)}` });
  }
  listeners.push({ table: 'event_members', filter: `user_id=eq.${scope.userId}` });

  const channel = client.channel(`sync:${scope.userId}:${++channelSeq}`);
  for (const l of listeners) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: l.table, filter: l.filter },
      (p) => {
        if (!closed) applyChange(p as unknown as ChangePayload, scope, change);
      },
    );
  }
  channel.subscribe((status) => {
    if (!closed) handlers.onStatus?.(status);
  });

  return () => {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    timers.clear();
    void client.removeChannel(channel);
  };
}
