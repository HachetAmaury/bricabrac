import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import type { Sale, SaleEvent } from '../types';
import { createOutbox, type OutboxOp } from './outbox';

type Result = { data?: unknown; error: unknown } | Error;
type Call = { table: string; method: 'insert' | 'delete'; arg: unknown };

/** Each insert/delete consumes the next scripted result (default: success). An Error is thrown. */
function fakeClient(script: Result[] = []) {
  const calls: Call[] = [];
  const next = (): Promise<unknown> => {
    const r = script.shift() ?? { data: null, error: null };
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const client = {
    from: (table: string) => ({
      insert: (row: unknown) => {
        calls.push({ table, method: 'insert', arg: row });
        return next();
      },
      delete: () => ({
        eq: (col: string, val: unknown) => {
          calls.push({ table, method: 'delete', arg: [col, val] });
          return next();
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const sale = (id: string, timestamp = 1000): Sale => ({
  id,
  sellerId: 'u1',
  timestamp,
  lines: [{ itemId: 'i1', name: 'Crêpe', price: 250, qty: 1 }],
  total: 250,
});
const ev = (id: string, lockedAt: number | null = null): SaleEvent => ({
  id,
  catalogId: 'c1',
  name: 'Tournoi',
  kind: 'tournoi',
  createdAt: 1,
  enabledItemIds: [],
  sales: [],
  locked: lockedAt !== null,
  lockedAt,
});
const ctxOf = (...events: SaleEvent[]) => ({ eventsById: new Map(events.map((e) => [e.id, e])) });
const ins = (opId: string, s: Sale, eventId = 'e1'): OutboxOp => ({
  id: opId,
  version: 1,
  kind: 'insertSale',
  eventId,
  sale: s,
});
const del = (opId: string, saleId: string, eventId = 'e1'): OutboxOp => ({
  id: opId,
  version: 1,
  kind: 'deleteSale',
  eventId,
  saleId,
});
const row = (s: Sale, eventId = 'e1') => ({
  id: s.id,
  event_id: eventId,
  timestamp: s.timestamp,
  seller_id: s.sellerId,
  lines: s.lines,
  total: s.total,
  cash_given: null,
  change: null,
});
const RLS = { error: { code: '42501', message: 'new row violates row-level security policy for table "sales"' } };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('outbox', () => {
  it('sends pending ops in order and removes them on success', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    expect(ob.entries().map((e) => [e.id, e.status, e.attempts])).toEqual([
      ['o1', 'pending', 0],
      ['o2', 'pending', 0],
    ]);
    const { client, calls } = fakeClient();
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toEqual([
      { table: 'sales', method: 'insert', arg: row(sale('s1')) },
      { table: 'sales', method: 'insert', arg: row(sale('s2')) },
    ]);
    expect(res).toEqual({ sent: 2, held: 0, rejected: 0, stoppedOnNetworkError: false });
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([]);
  });

  it('treats 23505 as success', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    const { client, calls } = fakeClient([{ error: { code: '23505', message: 'duplicate key value' } }]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toHaveLength(1);
    expect(res.sent).toBe(1);
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([]);
  });

  it('stops on a network error and keeps all entries', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    const { client, calls } = fakeClient([new TypeError('Failed to fetch')]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toHaveLength(1);
    expect(res).toEqual({ sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: true });
    expect(ob.entries().map((e) => [e.id, e.status, e.attempts])).toEqual([
      ['o1', 'pending', 0],
      ['o2', 'pending', 0],
    ]);

    // PostgREST reports fetch failures as an error object, not a throw.
    const second = fakeClient([{ error: { message: 'TypeError: fetch failed', code: '' } }]);
    const res2 = await ob.flush(second.client, ctxOf(ev('e1')));
    expect(res2.stoppedOnNetworkError).toBe(true);
    expect(second.calls).toHaveLength(1);
    expect(ob.entries().map((e) => e.id)).toEqual(['o1', 'o2']);
  });

  it('does not call the client when the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    const { client, calls } = fakeClient();
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toEqual([]);
    expect(res.stoppedOnNetworkError).toBe(true);
    expect(ob.entries().map((e) => e.id)).toEqual(['o1']);
  });

  it('holds a sale timestamped after lockedAt as held-locked', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1', 5000)));
    const { client } = fakeClient([RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1', 4000)));
    expect(res).toEqual({ sent: 0, held: 1, rejected: 0, stoppedOnNetworkError: false });
    expect(ob.entries().map((e) => [e.id, e.status])).toEqual([['o1', 'held-locked']]);
    expect(ob.rejected()).toEqual([]);

    // Retried on the next flush: the event was unlocked meanwhile.
    const again = fakeClient();
    const res2 = await ob.flush(again.client, ctxOf(ev('e1')));
    expect(again.calls).toEqual([{ table: 'sales', method: 'insert', arg: row(sale('s1', 5000)) }]);
    expect(res2.sent).toBe(1);
    expect(ob.entries()).toEqual([]);
  });

  it('accepts a sale timestamped before lockedAt', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1', 3000)));
    const { client, calls } = fakeClient();
    const res = await ob.flush(client, ctxOf(ev('e1', 4000)));
    expect(calls).toHaveLength(1);
    expect(res.sent).toBe(1);
    expect(ob.entries()).toEqual([]);
  });

  it('held-locked does not block later entries', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1', 5000), 'locked'));
    ob.enqueue(ins('o2', sale('s2'), 'e1'));
    const { client, calls } = fakeClient([RLS]);
    const res = await ob.flush(client, ctxOf(ev('locked', 4000), ev('e1')));
    expect(calls.map((c) => (c.arg as { id: string }).id)).toEqual(['s1', 's2']);
    expect(res).toEqual({ sent: 1, held: 1, rejected: 0, stoppedOnNetworkError: false });
    expect(ob.entries().map((e) => [e.id, e.status])).toEqual([['o1', 'held-locked']]);
  });

  it('rejects with event-deleted when the event is unknown', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1'), 'gone'));
    const { client } = fakeClient([RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(res).toEqual({ sent: 0, held: 0, rejected: 1, stoppedOnNetworkError: false });
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([
      expect.objectContaining({ sale: sale('s1'), eventId: 'gone', reason: 'event-deleted', kind: 'insertSale' }),
    ]);
  });

  it('keeps an RLS failure on a known unlocked event, then rejects it as not-member', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    for (let i = 1; i <= 4; i++) {
      const { client } = fakeClient([RLS]);
      await ob.flush(client, ctxOf(ev('e1')));
      expect(ob.entries().map((e) => [e.status, e.attempts])).toEqual([['pending', i]]);
    }
    const { client } = fakeClient([RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(res.rejected).toBe(1);
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([expect.objectContaining({ sale: sale('s1'), reason: 'not-member' })]);
  });

  it('rejects with disabled on 403 and stops', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    const { client, calls } = fakeClient([{ error: { status: 403, message: 'Forbidden' } }]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toHaveLength(1);
    expect(res).toEqual({ sent: 0, held: 0, rejected: 1, stoppedOnNetworkError: false });
    expect(ob.rejected()).toEqual([expect.objectContaining({ sale: sale('s1'), reason: 'disabled' })]);
    expect(ob.entries().map((e) => [e.id, e.status])).toEqual([['o2', 'pending']]);
  });

  it('rejects unknown version entries without calling the client', async () => {
    const future = { id: 'o1', version: 2, kind: 'insertSale', eventId: 'e1', sale: sale('s1'), status: 'pending', attempts: 0 };
    localStorage.setItem('sync:outbox', JSON.stringify([future]));
    const ob = createOutbox();
    const { client, calls } = fakeClient();
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toEqual([]);
    expect(res.rejected).toBe(1);
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([
      expect.objectContaining({ sale: sale('s1'), eventId: 'e1', reason: 'unknown-version', entry: future }),
    ]);
  });

  it('server-error after 5 attempts rejects', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    const boom = { error: { code: 'XX000', message: 'internal error' } };
    for (let i = 1; i <= 4; i++) {
      // o1 fails, o2 behind it is still attempted (and also fails).
      const { client, calls } = fakeClient([boom, boom]);
      const res = await ob.flush(client, ctxOf(ev('e1')));
      expect(calls).toHaveLength(2);
      expect(res).toEqual({ sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: false });
      expect(ob.entries().map((e) => [e.id, e.status, e.attempts])).toEqual([
        ['o1', 'pending', i],
        ['o2', 'pending', i],
      ]);
    }
    const { client } = fakeClient([boom]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(res).toEqual({ sent: 1, held: 0, rejected: 1, stoppedOnNetworkError: false });
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([expect.objectContaining({ sale: sale('s1'), reason: 'server-error' })]);
  });

  it('deleteSale ops go through the same path', async () => {
    const ob = createOutbox();
    ob.enqueue(del('o1', 's1'));
    ob.enqueue(del('o2', 's2', 'locked'));
    ob.enqueue(del('o3', 's3', 'gone'));
    const { client, calls } = fakeClient([{ error: null }, RLS, RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1'), ev('locked', 4000)));
    expect(calls).toEqual([
      { table: 'sales', method: 'delete', arg: ['id', 's1'] },
      { table: 'sales', method: 'delete', arg: ['id', 's2'] },
      { table: 'sales', method: 'delete', arg: ['id', 's3'] },
    ]);
    expect(res).toEqual({ sent: 1, held: 1, rejected: 1, stoppedOnNetworkError: false });
    expect(ob.entries().map((e) => [e.id, e.status])).toEqual([['o2', 'held-locked']]);
    expect(ob.rejected()).toEqual([
      expect.objectContaining({ eventId: 'gone', reason: 'event-deleted', kind: 'deleteSale', sale: expect.objectContaining({ id: 's3' }) }),
    ]);
  });

  it('undo of an unsent sale cancels both ops', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    ob.enqueue(del('o3', 's1'));
    expect(ob.entries().map((e) => e.id)).toEqual(['o2']);
  });

  it('undo of a sale whose insert is in flight is queued behind it', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    let release!: (v: unknown) => void;
    const calls: string[] = [];
    const client = {
      from: () => ({
        insert: () => {
          calls.push('insert');
          return new Promise((r) => (release = r));
        },
        delete: () => ({
          eq: () => {
            calls.push('delete');
            return Promise.resolve({ error: null });
          },
        }),
      }),
    } as unknown as SupabaseClient<Database>;
    const p = ob.flush(client, ctxOf(ev('e1')));
    ob.enqueue(del('o2', 's1'));
    expect(ob.entries().map((e) => e.id)).toEqual(['o1', 'o2']);
    release({ error: null });
    const res = await p;
    expect(calls).toEqual(['insert', 'delete']);
    expect(res.sent).toBe(2);
    expect(ob.entries()).toEqual([]);
  });

  it('concurrent flush calls share one run', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    const { client, calls } = fakeClient();
    const a = ob.flush(client, ctxOf(ev('e1')));
    const b = ob.flush(client, ctxOf(ev('e1')));
    expect(b).toBe(a);
    expect(ob.flushing()).toBe(true);
    await a;
    expect(ob.flushing()).toBe(false);
    expect(calls).toHaveLength(1);
    // A later call starts a new run.
    ob.enqueue(ins('o2', sale('s2')));
    const c = ob.flush(client, ctxOf(ev('e1')));
    expect(c).not.toBe(a);
    await c;
    expect(calls).toHaveLength(2);
  });

  it('persists entries across createOutbox calls (localStorage)', async () => {
    const first = createOutbox();
    first.enqueue(ins('o1', sale('s1')));
    first.enqueue(ins('o2', sale('s2'), 'gone'));
    const { client } = fakeClient([{ error: null }, RLS]);
    // Nothing sent yet: the second instance sees both entries.
    expect(createOutbox().entries().map((e) => e.id)).toEqual(['o1', 'o2']);
    await first.flush(client, ctxOf(ev('e1')));
    const second = createOutbox();
    expect(second.entries()).toEqual([]);
    expect(second.rejected()).toEqual([expect.objectContaining({ reason: 'event-deleted' })]);
    second.dismissRejected();
    expect(createOutbox().rejected()).toEqual([]);
    // Another storage key is a separate outbox.
    expect(createOutbox('sync:outbox:u2', 'sync:rejected:u2').entries()).toEqual([]);
  });

  it('notifies subscribers on enqueue, flush and dismiss', async () => {
    const ob = createOutbox();
    const listener = vi.fn();
    const off = ob.subscribe(listener);
    ob.enqueue(ins('o1', sale('s1'), 'gone'));
    expect(listener).toHaveBeenCalledTimes(1);
    const { client } = fakeClient([RLS]);
    await ob.flush(client, ctxOf());
    const afterFlush = listener.mock.calls.length;
    expect(afterFlush).toBeGreaterThan(1);
    ob.dismissRejected();
    expect(listener).toHaveBeenCalledTimes(afterFlush + 1);
    off();
    ob.enqueue(ins('o2', sale('s2')));
    expect(listener).toHaveBeenCalledTimes(afterFlush + 1);
  });
});
