import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import { fetchAll } from './fetch';

const iso = '2026-10-17T10:00:00.000Z';
const sale = (id: string, timestamp: number, event_id: string) => ({
  id, event_id, timestamp, seller_id: 'u1', lines: [], total: 0, cash_given: null, change: null, created_at: iso,
});

type Call = { table: string; order: string[]; range: [number, number] };

/** Serves each table page by page, as PostgREST does with `.order().range()`. */
function fakeClient(tables: Record<string, unknown[]>, failing?: string, calls: Call[] = []) {
  return {
    from: (t: string) => ({
      select: () => {
        const order: string[] = [];
        const q = {
          order: (col: string) => {
            order.push(col);
            return q;
          },
          range: (from: number, to: number) => {
            calls.push({ table: t, order: [...order], range: [from, to] });
            return Promise.resolve(
              t === failing
                ? { data: null, error: { message: 'boom' } }
                : { data: (tables[t] ?? []).slice(from, to + 1), error: null },
            );
          },
        };
        return q;
      },
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

  it('pages past the 1000-row cap and keeps sales in timestamp order', async () => {
    const many = Array.from({ length: 1005 }, (_, i) => sale(`s${String(i).padStart(4, '0')}`, i, 'e1'));
    const calls: Call[] = [];
    const snap = await fetchAll(fakeClient({ ...tables, sales: many }, undefined, calls));
    const salesCalls = calls.filter((c) => c.table === 'sales');
    expect(salesCalls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(salesCalls[0].order).toEqual(['timestamp', 'id']);
    expect(snap.events[0].sales).toHaveLength(1005);
    expect(snap.events[0].sales.map((s) => s.id)).toEqual(many.map((s) => s.id));
    // A table under the cap is read in a single page.
    expect(calls.filter((c) => c.table === 'items')).toHaveLength(1);
  });

  it('rejects on a PostgREST error', async () => {
    await expect(fetchAll(fakeClient(tables, 'sales'))).rejects.toBeTruthy();
  });
});
