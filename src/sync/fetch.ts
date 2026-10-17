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

type Tables = Database['public']['Tables'];

export type Snapshot = {
  catalogs: Catalog[];
  items: Item[];
  categories: Category[];
  events: SaleEvent[];
  profiles: Profile[];
};

/** PostgREST caps a response at 1000 rows (`max_rows`): larger tables are read page by page. */
export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: unknown };
type Ordered<T> = {
  order: (col: string, opts?: { ascending?: boolean }) => Ordered<T>;
  range: (from: number, to: number) => PromiseLike<Page<T>>;
};

/**
 * Reads every row of a select, ordered by `orderBy` (a stable, unique key), in
 * pages of PAGE_SIZE until a short page. Throws on any PostgREST error.
 */
async function selectAll<T>(query: () => unknown, orderBy: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = query() as Ordered<T>;
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Fetches everything RLS lets the user see. Throws on any PostgREST error. */
export async function fetchAll(client: SupabaseClient<Database>): Promise<Snapshot> {
  const [catalogs, categories, items, events, eventItems, sales, profiles] = await Promise.all([
    selectAll<Tables['catalogs']['Row']>(() => client.from('catalogs').select('*'), ['id']),
    selectAll<Tables['categories']['Row']>(() => client.from('categories').select('*'), ['id']),
    selectAll<Tables['items']['Row']>(() => client.from('items').select('*'), ['id']),
    selectAll<Tables['events']['Row']>(() => client.from('events').select('*'), ['id']),
    selectAll<Tables['event_items']['Row']>(() => client.from('event_items').select('*'), ['event_id', 'item_id']),
    selectAll<Tables['sales']['Row']>(() => client.from('sales').select('*'), ['timestamp', 'id']),
    selectAll<Tables['profiles']['Row']>(() => client.from('profiles').select('*'), ['id']),
  ]);

  const enabled = new Map<string, string[]>();
  for (const r of eventItems) {
    const list = enabled.get(r.event_id);
    if (list) list.push(r.item_id);
    else enabled.set(r.event_id, [r.item_id]);
  }
  const salesByEvent = new Map<string, Sale[]>();
  const orderedSales = [...sales].sort((a, b) => a.timestamp - b.timestamp);
  for (const r of orderedSales) {
    const list = salesByEvent.get(r.event_id);
    const sale = saleFromRow(r);
    if (list) list.push(sale);
    else salesByEvent.set(r.event_id, [sale]);
  }

  return {
    catalogs: catalogs.map(catalogFromRow),
    categories: categories.map(categoryFromRow),
    items: items.map(itemFromRow),
    events: events.map((e) =>
      eventFromRows(e, enabled.get(e.id) ?? [], salesByEvent.get(e.id) ?? []),
    ),
    profiles: profiles.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      isAdmin: p.is_admin,
      disabled: p.disabled,
    })),
  };
}
