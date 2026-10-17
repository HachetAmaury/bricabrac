import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, EventRow } from '../lib/supabase';
import type { Category, Item, SaleEvent } from '../types';
import type { CatalogAction } from '../state/catalogReducer';
import type { CategoriesAction } from '../state/categoriesReducer';
import type { EventsAction } from '../state/eventsReducer';
import { categoryToRow, eventToRow, itemToRow, saleToRow } from './mappers';

type Client = SupabaseClient<Database>;

/** Awaits a PostgREST builder and rethrows its error, so callers see a rejection. */
async function run(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  if (error) throw error;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/**
 * Mirrors one local catalog action to Supabase. `state` is the state AFTER the
 * action. Server-origin actions (hydrate/upsert/remove) are no-ops.
 */
export async function mirrorCatalog(client: Client, a: CatalogAction, state: Item[]): Promise<void> {
  switch (a.type) {
    case 'add':
    case 'edit':
    case 'archive':
    case 'restore': {
      const item = state.find((i) => i.id === a.id);
      if (!item) return;
      return run(client.from('items').upsert(itemToRow(item)));
    }
    case 'clearCategory':
      return run(client.from('items').update({ category_id: null }).eq('category_id', a.categoryId));
    case 'hydrate':
    case 'upsert':
    case 'remove':
      return;
  }
}

export async function mirrorCategories(client: Client, a: CategoriesAction, state: Category[]): Promise<void> {
  switch (a.type) {
    case 'add':
    case 'edit': {
      const cat = state.find((c) => c.id === a.id);
      if (!cat) return;
      return run(client.from('categories').upsert(categoryToRow(cat)));
    }
    case 'delete':
      return run(client.from('categories').delete().eq('id', a.id));
    case 'hydrate':
    case 'upsert':
    case 'remove':
      return;
  }
}

function updateEvent(client: Client, id: string, patch: Partial<EventRow>): Promise<void> {
  return run(client.from('events').update(patch).eq('id', id));
}

/**
 * `removedSaleId` is required for `undoMyLast`: the removed sale is gone from
 * `state`, so the caller computes it from the previous state.
 */
export async function mirrorEvents(
  client: Client,
  a: EventsAction,
  state: SaleEvent[],
  removedSaleId?: string,
): Promise<void> {
  switch (a.type) {
    case 'create': {
      const ev = state.find((e) => e.id === a.id);
      if (!ev) return;
      await run(client.from('events').insert(eventToRow(ev)));
      if (ev.enabledItemIds.length === 0) return;
      return run(
        client.from('event_items').insert(ev.enabledItemIds.map((item_id) => ({ event_id: ev.id, item_id }))),
      );
    }
    case 'rename':
      return updateEvent(client, a.id, { name: a.name });
    case 'setLocked':
      return updateEvent(client, a.id, { locked_at: iso(a.lockedAt) });
    case 'setCashFloat':
      return updateEvent(client, a.id, { cash_float: a.cashFloat });
    case 'setCashCount':
      return updateEvent(client, a.id, { cash_count: a.cashCount as EventRow['cash_count'] });
    case 'delete':
      return run(client.from('events').delete().eq('id', a.id));
    case 'toggleItem': {
      const ev = state.find((e) => e.id === a.eventId);
      if (!ev) return;
      if (ev.enabledItemIds.includes(a.itemId)) {
        return run(client.from('event_items').insert({ event_id: a.eventId, item_id: a.itemId }));
      }
      return run(client.from('event_items').delete().eq('event_id', a.eventId).eq('item_id', a.itemId));
    }
    case 'recordSale': {
      const sale = state.find((e) => e.id === a.eventId)?.sales.find((s) => s.id === a.saleId);
      if (!sale) return;
      return run(client.from('sales').insert(saleToRow(sale, a.eventId)));
    }
    case 'undoMyLast':
      if (!removedSaleId) return;
      return run(client.from('sales').delete().eq('id', removedSaleId));
    case 'upsertEvent':
    case 'removeEvent':
    case 'upsertSale':
    case 'removeSale':
    case 'setEnabledItems':
    case 'hydrate':
      return;
  }
}
