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
/** Ids chosen by the first attempt, so a retry after a partial import writes the same rows. */
const PLAN_KEY = 'import:plan';

/** `rowsDone`: every row was written, only the locks remain (a locked event refuses event_items, even duplicates). */
type Plan = { catalogId: string; ids: [string, string][]; rowsDone?: boolean };

function loadPlan(): Plan | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    const p: unknown = raw === null ? null : JSON.parse(raw);
    if (p && typeof p === 'object' && typeof (p as Plan).catalogId === 'string' && Array.isArray((p as Plan).ids)) {
      return p as Plan;
    }
  } catch {
    // Unreadable: start a fresh plan.
  }
  return null;
}

function savePlan(plan: Plan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    // Storage full: a retry may pick new ids for non-UUID legacy rows.
  }
}

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
    localStorage.removeItem(PLAN_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

/** `ids` (old id → new id) is filled in place, so the caller can keep it for a retry. */
export function buildImport(legacy: Backup, opts: ImportOpts, ids = new Map<string, string>()): ImportRows {
  // One stable mapping per old id, so every reference resolves to the same new id.
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

type UpsertOptions = { onConflict: string; ignoreDuplicates: true };
type UpsertClient = {
  from: (table: string) => {
    upsert: (rows: never, opts: UpsertOptions) => PromiseLike<{ error: unknown }>;
    update: (values: never) => { eq: (col: string, val: string) => PromiseLike<{ error: unknown }> };
  };
};

/**
 * Writes parents before children; keeps legacy keys unless every write
 * succeeded. Rows already sent by an earlier, interrupted attempt are skipped
 * (on conflict do nothing), and the ids are the ones that attempt chose.
 */
export async function runImport(client: unknown, legacy: Backup, opts: ImportOpts): Promise<void> {
  const db = client as UpsertClient;
  const plan = loadPlan() ?? { catalogId: opts.catalogId, ids: [] };
  const ids = new Map(plan.ids);
  const out = buildImport(legacy, { ...opts, catalogId: plan.catalogId }, ids);
  savePlan({ catalogId: plan.catalogId, ids: [...ids], rowsDone: plan.rowsDone });
  const upsert = async (table: string, rows: unknown, onConflict = 'id') => {
    const { error } = await db.from(table).upsert(rows as never, { onConflict, ignoreDuplicates: true });
    if (error) throw error;
  };
  const upsertAll = async (table: string, rows: unknown[], onConflict?: string) => {
    for (let i = 0; i < rows.length; i += CHUNK) await upsert(table, rows.slice(i, i + CHUNK), onConflict);
  };

  if (!plan.rowsDone) {
    await upsert('catalogs', out.catalog);
    await upsertAll('categories', out.categories);
    await upsertAll('items', out.items);
    await upsertAll('events', out.events);
    await upsertAll('event_items', out.eventItems, 'event_id,item_id');
    await upsertAll('sales', out.sales);
    savePlan({ catalogId: plan.catalogId, ids: [...ids], rowsDone: true });
  }
  for (const l of out.locks) {
    const { error } = await db.from('events').update({ locked_at: l.locked_at } as never).eq('id', l.id);
    if (error) throw error;
  }
  clearLegacyData();
}
