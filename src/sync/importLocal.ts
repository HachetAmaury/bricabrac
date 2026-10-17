import type { Backup } from '../lib/backup';
import type { CategoryRow, CatalogRow, EventItemRow, EventRow, ItemRow, SaleRow } from '../lib/supabase';
import { uuid } from '../lib/uuid';
import { LEGACY_KEYS } from '../state/persistence';
import type { Category, Item, Sale, SaleEvent } from '../types';
import { catalogToRow, categoryToRow, eventToRow, itemToRow, saleToRow } from './mappers';

type Stamps = 'created_at' | 'updated_at';
export type ImportOpts = { catalogId: string; catalogName: string; sellerId: string };
export type ImportRows = {
  catalog: Pick<CatalogRow, 'id' | 'name'>;
  categories: Omit<CategoryRow, Stamps>[];
  items: Omit<ItemRow, Stamps>[];
  events: Omit<EventRow, 'updated_at' | 'created_by'>[];
  eventItems: EventItemRow[];
  sales: Omit<SaleRow, 'created_at'>[];
  /** Applied after sales: the server refuses event_items/sales on an already-locked event. */
  locks: { id: string; locked_at: string }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const CHUNK = 500;

export function hasLegacyData(): boolean {
  try {
    return localStorage.getItem(LEGACY_KEYS.events) !== null || localStorage.getItem(LEGACY_KEYS.catalog) !== null;
  } catch {
    return false;
  }
}

export function clearLegacyData(): void {
  try {
    for (const k of Object.values(LEGACY_KEYS)) localStorage.removeItem(k);
  } catch {
    // storage unavailable: nothing to clear
  }
}

export function buildImport(legacy: Backup, opts: ImportOpts): ImportRows {
  // One stable mapping per old id, so every reference resolves to the same new id.
  const ids = new Map<string, string>();
  const remap = (id: string) => {
    if (UUID_RE.test(id)) return id;
    let next = ids.get(id);
    if (!next) ids.set(id, (next = uuid()));
    return next;
  };

  const categories: Category[] = legacy.categories.map((c) => ({ ...c, id: remap(c.id), catalogId: opts.catalogId }));
  const items: Item[] = legacy.catalog.map((i) => ({
    ...i,
    id: remap(i.id),
    catalogId: opts.catalogId,
    categoryId: i.categoryId ? remap(i.categoryId) : null,
  }));
  const itemIds = new Set(items.map((i) => i.id));

  const eventRows: ImportRows['events'] = [];
  const eventItems: EventItemRow[] = [];
  const sales: ImportRows['sales'] = [];
  const locks: ImportRows['locks'] = [];

  for (const e of legacy.events) {
    const id = remap(e.id);
    if (e.locked) locks.push({ id, locked_at: new Date(e.createdAt).toISOString() });
    const ev: SaleEvent = { ...e, id, catalogId: opts.catalogId, lockedAt: null, locked: false };
    eventRows.push(eventToRow(ev));
    for (const itemId of new Set((e.enabledItemIds ?? []).map(remap))) {
      if (itemIds.has(itemId)) eventItems.push({ event_id: id, item_id: itemId });
    }
    for (const s of e.sales ?? []) {
      const sale: Sale = {
        ...s,
        id: remap(s.id),
        sellerId: opts.sellerId,
        lines: (s.lines ?? []).map((l) => ({ ...l, itemId: remap(l.itemId) })),
      };
      sales.push(saleToRow(sale, id));
    }
  }

  return {
    catalog: catalogToRow({ id: opts.catalogId, name: opts.catalogName }),
    categories: categories.map(categoryToRow),
    items: items.map(itemToRow),
    events: eventRows,
    eventItems,
    sales,
    locks,
  };
}

type InsertClient = {
  from: (table: string) => {
    insert: (rows: never) => PromiseLike<{ error: unknown }>;
    update: (values: never) => { eq: (col: string, val: string) => PromiseLike<{ error: unknown }> };
  };
};

/** Inserts parents before children; keeps legacy keys unless every insert succeeded. */
export async function runImport(client: unknown, legacy: Backup, opts: ImportOpts): Promise<void> {
  const db = client as InsertClient;
  const out = buildImport(legacy, opts);
  const insert = async (table: string, rows: unknown) => {
    const { error } = await db.from(table).insert(rows as never);
    if (error) throw error;
  };
  const insertAll = async (table: string, rows: unknown[]) => {
    for (let i = 0; i < rows.length; i += CHUNK) await insert(table, rows.slice(i, i + CHUNK));
  };

  await insert('catalogs', out.catalog);
  await insertAll('categories', out.categories);
  await insertAll('items', out.items);
  await insertAll('events', out.events);
  await insertAll('event_items', out.eventItems);
  await insertAll('sales', out.sales);
  for (const l of out.locks) {
    const { error } = await db.from('events').update({ locked_at: l.locked_at } as never).eq('id', l.id);
    if (error) throw error;
  }
  clearLegacyData();
}
