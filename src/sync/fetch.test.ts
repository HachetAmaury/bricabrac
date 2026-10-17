import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import { fetchAll } from './fetch';

const iso = '2026-10-17T10:00:00.000Z';
const sale = (id: string, timestamp: number, event_id: string) => ({
  id, event_id, timestamp, seller_id: 'u1', lines: [], total: 0, cash_given: null, change: null, created_at: iso,
});

function fakeClient(tables: Record<string, unknown[]>, failing?: string) {
  return {
    from: (t: string) => ({
      select: () =>
        Promise.resolve(
          t === failing ? { data: null, error: { message: 'boom' } } : { data: tables[t] ?? [], error: null },
        ),
    }),
  } as unknown as SupabaseClient<Database>;
}

const tables = {
  catalogs: [{ id: 'c1', name: 'Cat', created_at: iso, updated_at: iso, created_by: null }],
  categories: [],
  items: [],
  profiles: [{ id: 'u1', display_name: 'Nat', is_admin: true, disabled: false, created_at: iso, updated_at: iso }],
  events: [{ id: 'e1', catalog_id: 'c1', name: 'E', kind: 'autre', created_at: iso, updated_at: iso, created_by: null, locked_at: null, cash_float: null, cash_count: null }],
  event_items: [{ event_id: 'e1', item_id: 'i1' }, { event_id: 'e2', item_id: 'i9' }],
  sales: [sale('s2', 20, 'e1'), sale('s1', 10, 'e1'), sale('s3', 5, 'e2')],
};

describe('fetchAll', () => {
  it('assembles events with enabled items and sorted sales', async () => {
    const snap = await fetchAll(fakeClient(tables));
    expect(snap.catalogs).toEqual([{ id: 'c1', name: 'Cat' }]);
    expect(snap.profiles).toEqual([{ id: 'u1', displayName: 'Nat', isAdmin: true, disabled: false }]);
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0].enabledItemIds).toEqual(['i1']);
    expect(snap.events[0].sales.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('rejects on a PostgREST error', async () => {
    await expect(fetchAll(fakeClient(tables, 'sales'))).rejects.toBeTruthy();
  });
});
