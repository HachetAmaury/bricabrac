import type { Item, Category, SaleEvent } from '../types';

// Old localStorage payloads and backup exports predate catalogs, sellers and
// lock timestamps. Fill in defaults so nothing downstream sees undefined.
export const LOCAL = 'local';

export const withItemDefaults = (i: Item): Item => ({ ...i, catalogId: i.catalogId ?? LOCAL });

export const withCategoryDefaults = (c: Category): Category => ({
  ...c,
  catalogId: c.catalogId ?? LOCAL
});

export const withEventDefaults = (e: SaleEvent): SaleEvent => {
  const lockedAt = e.lockedAt ?? (e.locked ? e.createdAt : null);
  return {
    ...e,
    catalogId: e.catalogId ?? LOCAL,
    lockedAt,
    locked: lockedAt !== null,
    sales: e.sales.map((s) => ({ ...s, sellerId: s.sellerId ?? LOCAL }))
  };
};
