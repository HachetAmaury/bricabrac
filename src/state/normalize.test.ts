import { describe, it, expect } from 'vitest';
import { withEventDefaults, withItemDefaults, withCategoryDefaults } from './normalize';
import type { SaleEvent, Item, Category } from '../types';

const legacy = (o: Record<string, unknown>) =>
  ({
    id: 'e1',
    name: 'A',
    kind: 'autre',
    createdAt: 10,
    enabledItemIds: [],
    sales: [{ id: 's1', timestamp: 1, lines: [], total: 0 }],
    ...o
  }) as unknown as SaleEvent;

describe('normalize', () => {
  it('legacy locked event gets lockedAt = createdAt and local defaults', () => {
    const e = withEventDefaults(legacy({ locked: true }));
    expect(e.locked).toBe(true);
    expect(e.lockedAt).toBe(10);
    expect(e.catalogId).toBe('local');
    expect(e.sales[0].sellerId).toBe('local');
  });

  it('legacy unlocked event gets lockedAt null', () => {
    const e = withEventDefaults(legacy({ locked: false }));
    expect(e.locked).toBe(false);
    expect(e.lockedAt).toBeNull();
    expect(withEventDefaults(legacy({})).lockedAt).toBeNull();
  });

  it('derives locked from lockedAt', () => {
    const e = withEventDefaults(legacy({ locked: false, lockedAt: 42 }));
    expect(e.lockedAt).toBe(42);
    expect(e.locked).toBe(true);
  });

  it('keeps existing catalogId and sellerId', () => {
    const e = withEventDefaults(
      legacy({ catalogId: 'c9', sales: [{ id: 's', sellerId: 'u1', timestamp: 1, lines: [], total: 0 }] })
    );
    expect(e.catalogId).toBe('c9');
    expect(e.sales[0].sellerId).toBe('u1');
  });

  it('defaults catalogId on items and categories', () => {
    expect(withItemDefaults({ id: 'i', name: 'x', price: 1, archived: false } as unknown as Item).catalogId).toBe('local');
    expect(withCategoryDefaults({ id: 'c', name: 'x', color: '#000' } as unknown as Category).catalogId).toBe('local');
  });
});
