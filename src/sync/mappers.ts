import type { CashCount, Catalog, Category, EventKind, Item, Sale, SaleEvent, SaleLine } from '../types';
import type { CatalogRow, CategoryRow, EventRow, ItemRow, SaleRow } from '../lib/supabase';

type Stamps = 'created_at' | 'updated_at';

export function itemFromRow(r: ItemRow): Item {
  const item: Item = {
    id: r.id,
    catalogId: r.catalog_id,
    name: r.name,
    price: r.price,
    archived: r.archived,
    categoryId: r.category_id,
  };
  if (r.icon !== null) item.icon = r.icon;
  return item;
}

export function itemToRow(i: Item): Omit<ItemRow, Stamps> {
  return {
    id: i.id,
    catalog_id: i.catalogId,
    name: i.name,
    price: i.price,
    archived: i.archived,
    icon: i.icon ?? null,
    category_id: i.categoryId ?? null,
  };
}

export function categoryFromRow(r: CategoryRow): Category {
  return { id: r.id, catalogId: r.catalog_id, name: r.name, color: r.color };
}

export function categoryToRow(c: Category): Omit<CategoryRow, Stamps> {
  return { id: c.id, catalog_id: c.catalogId, name: c.name, color: c.color };
}

export function catalogFromRow(r: CatalogRow): Catalog {
  return { id: r.id, name: r.name };
}

export function catalogToRow(c: Catalog): Pick<CatalogRow, 'id' | 'name'> {
  return { id: c.id, name: c.name };
}

export function saleFromRow(r: SaleRow): Sale {
  const sale: Sale = {
    id: r.id,
    timestamp: r.timestamp,
    sellerId: r.seller_id,
    lines: r.lines as unknown as SaleLine[],
    total: r.total,
  };
  if (r.cash_given !== null) sale.cashGiven = r.cash_given;
  if (r.change !== null) sale.change = r.change;
  return sale;
}

export function saleToRow(s: Sale, eventId: string): Omit<SaleRow, 'created_at'> {
  return {
    id: s.id,
    event_id: eventId,
    timestamp: s.timestamp,
    seller_id: s.sellerId,
    lines: s.lines as unknown as SaleRow['lines'],
    total: s.total,
    cash_given: s.cashGiven ?? null,
    change: s.change ?? null,
  };
}

export function eventFromRows(e: EventRow, enabledItemIds: string[], sales: Sale[]): SaleEvent {
  const lockedAt = e.locked_at === null ? null : Date.parse(e.locked_at);
  const ev: SaleEvent = {
    id: e.id,
    catalogId: e.catalog_id,
    name: e.name,
    kind: e.kind as EventKind,
    createdAt: Date.parse(e.created_at),
    enabledItemIds,
    sales,
    locked: lockedAt !== null,
    lockedAt,
  };
  if (e.cash_float !== null) ev.cashFloat = e.cash_float;
  if (e.cash_count !== null) ev.cashCount = e.cash_count as unknown as CashCount;
  return ev;
}

/** Includes `created_at` so inserts preserve the client's creation time. */
export function eventToRow(e: SaleEvent): Omit<EventRow, 'updated_at'> {
  return {
    id: e.id,
    catalog_id: e.catalogId,
    name: e.name,
    kind: e.kind,
    created_at: new Date(e.createdAt).toISOString(),
    created_by: null,
    locked_at: e.lockedAt === null ? null : new Date(e.lockedAt).toISOString(),
    cash_float: e.cashFloat ?? null,
    cash_count: (e.cashCount ?? null) as EventRow['cash_count'],
  };
}
