import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import type { Catalog, Category, Item, Profile, Sale, SaleEvent } from '../types';
import {
  catalogFromRow,
  categoryFromRow,
  eventFromRows,
  itemFromRow,
  saleFromRow,
} from './mappers';

export type Snapshot = {
  catalogs: Catalog[];
  items: Item[];
  categories: Category[];
  events: SaleEvent[];
  profiles: Profile[];
};

/** Fetches everything RLS lets the user see. Throws on any PostgREST error. */
export async function fetchAll(client: SupabaseClient<Database>): Promise<Snapshot> {
  const [catalogs, categories, items, events, eventItems, sales, profiles] = await Promise.all([
    client.from('catalogs').select('*'),
    client.from('categories').select('*'),
    client.from('items').select('*'),
    client.from('events').select('*'),
    client.from('event_items').select('*'),
    client.from('sales').select('*'),
    client.from('profiles').select('*'),
  ]);
  for (const res of [catalogs, categories, items, events, eventItems, sales, profiles]) {
    if (res.error) throw res.error;
  }

  const enabled = new Map<string, string[]>();
  for (const r of eventItems.data ?? []) {
    const list = enabled.get(r.event_id);
    if (list) list.push(r.item_id);
    else enabled.set(r.event_id, [r.item_id]);
  }
  const salesByEvent = new Map<string, Sale[]>();
  const orderedSales = [...(sales.data ?? [])].sort((a, b) => a.timestamp - b.timestamp);
  for (const r of orderedSales) {
    const list = salesByEvent.get(r.event_id);
    const sale = saleFromRow(r);
    if (list) list.push(sale);
    else salesByEvent.set(r.event_id, [sale]);
  }

  return {
    catalogs: (catalogs.data ?? []).map(catalogFromRow),
    categories: (categories.data ?? []).map(categoryFromRow),
    items: (items.data ?? []).map(itemFromRow),
    events: (events.data ?? []).map((e) =>
      eventFromRows(e, enabled.get(e.id) ?? [], salesByEvent.get(e.id) ?? []),
    ),
    profiles: (profiles.data ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      isAdmin: p.is_admin,
      disabled: p.disabled,
    })),
  };
}
