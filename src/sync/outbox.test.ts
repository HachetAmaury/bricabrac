import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import type { Sale, SaleEvent } from '../types';
import { createOutbox, type FlushContext, type OutboxOp } from './outbox';

// Real PostgREST response shapes (supabase-js v2): the HTTP status is on the response, not the error.
type Res = { data: unknown; error: unknown; status: number; statusText: string };
const pgErr = (code: string, message: string, status: number, statusText: string): Res => ({
  data: null,
  error: { code, message, details: null, hint: null },
  status,
  statusText,
});
const CREATED: Res = { data: null, error: null, status: 201, statusText: 'Created' };
const DELETED = (id: string): Res => ({ data: [{ id }], error: null, status: 200, statusText: 'OK' });
const NONE_DELETED: Res = { data: [], error: null, status: 200, statusText: 'OK' };
const DUPLICATE = pgErr('23505', 'duplicate key value violates unique constraint "sales_pkey"', 409, 'Conflict');
const RLS = pgErr('42501', 'new row violates row-level security policy for table "sales"', 403, 'Forbidden');
const JWT_EXPIRED = pgErr('PGRST303', 'JWT expired', 401, 'Unauthorized');
const UNAVAILABLE = pgErr('', 'Service Unavailable', 503, 'Service Unavailable');
const CHECK = pgErr('23514', 'new row for relation "sales" violates check constraint', 400, 'Bad Request');
// What supabase-js returns when fetch itself fails.
const FETCH_FAILED: Res = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch', hint: '', code: '' },
  status: 0,
  statusText: '',
};

type Call = { table: string; method: 'insert' | 'delete'; arg: unknown };

/** Each insert/delete consumes the next scripted result (default: success). An Error is thrown. */
function fakeClient(script: (Res | Error)[] = []) {
  const calls: Call[] = [];
  const next = (fallback: Res): Promise<unknown> => {
    const r = script.shift() ?? fallback;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const client = {
    from: (table: string) => ({
      insert: (row: unknown) => {
        calls.push({ table, method: 'insert', arg: row });
        return next(CREATED);
      },
      delete: () => ({
        eq: (col: string, val: unknown) => ({
          select: (cols: string) => {
            calls.push({ table, method: 'delete', arg: [col, val, cols] });
            return next(DELETED(String(val)));
          },
        }),
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
const ctxOf = (...events: SaleEvent[]): FlushContext => ({ eventsById: new Map(events.map((e) => [e.id, e])) });
const ins = (opId: string, s: Sale, eventId = 'e1'): OutboxOp => ({ id: opId, version: 1, kind: 'insertSale', eventId, sale: s });
const del = (opId: string, saleId: string, eventId = 'e1'): OutboxOp => ({ id: opId, version: 1, kind: 'deleteSale', eventId, saleId });
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
const states = (ob: ReturnType<typeof createOutbox>) => ob.entries().map((e) => [e.id, e.status, e.attempts]);

let now = 1_000_000;
beforeEach(() => {
  localStorage.clear();
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe('outbox', () => {
  it('sends pending ops in order and removes them on success', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    expect(states(ob)).toEqual([
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
    const { client, calls } = fakeClient([DUPLICATE]);
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
    const { client, calls } = fakeClient([FETCH_FAILED]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(calls).toHaveLength(1);
    expect(res).toEqual({ sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: true });
    expect(states(ob)).toEqual([
      ['o1', 'pending', 0],
      ['o2', 'pending', 0],
    ]);

    // A thrown TypeError is handled the same way.
    const second = fakeClient([new TypeError('Failed to fetch')]);
    const res2 = await ob.flush(second.client, ctxOf(ev('e1')));
    expect(res2.stoppedOnNetworkError).toBe(true);
    expect(second.calls).toHaveLength(1);
    expect(states(ob)).toEqual([
      ['o1', 'pending', 0],
      ['o2', 'pending', 0],
    ]);
  });

  it('stops on 503 and 429 without counting an attempt', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    for (const reply of [UNAVAILABLE, pgErr('', 'Too Many Requests', 429, 'Too Many Requests')]) {
      now += 120_000;
      const { client, calls } = fakeClient([reply]);
      const res = await ob.flush(client, ctxOf(ev('e1')));
      expect(calls).toHaveLength(1);
      expect(res.stoppedOnNetworkError).toBe(true);
      expect(states(ob)).toEqual([
        ['o1', 'pending', 0],
        ['o2', 'pending', 0],
      ]);
    }
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

  it('expired JWT: keeps entries, does not count, refreshes the session and stops', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    const refreshSession = vi.fn(() => Promise.resolve());
    const { client, calls } = fakeClient([JWT_EXPIRED]);
    const res = await ob.flush(client, { ...ctxOf(ev('e1')), refreshSession });
    expect(calls).toHaveLength(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: false });
    expect(states(ob)).toEqual([
      ['o1', 'pending', 0],
      ['o2', 'pending', 0],
    ]);
    expect(ob.rejected()).toEqual([]);
    // PGRST301 (invalid JWT) and a "JWT" message are auth errors too.
    for (const reply of [pgErr('PGRST301', 'JWSError JWSInvalidSignature', 401, 'Unauthorized'), pgErr('', 'invalid JWT', 401, 'Unauthorized')]) {
      await ob.flush(fakeClient([reply]).client, { ...ctxOf(ev('e1')), refreshSession });
    }
    expect(refreshSession).toHaveBeenCalledTimes(3);
    expect(states(ob)).toEqual([
      ['o1', 'pending', 0],
      ['o2', 'pending', 0],
    ]);
  });

  it('holds a sale timestamped after lockedAt as held-locked', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1', 5000)));
    const { client } = fakeClient([RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1', 4000)));
    expect(res).toEqual({ sent: 0, held: 1, rejected: 0, stoppedOnNetworkError: false });
    expect(states(ob)).toEqual([['o1', 'held-locked', 0]]);
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
    expect(states(ob)).toEqual([['o1', 'held-locked', 0]]);
  });

  it('rejects with event-deleted when the event is unknown', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1'), 'gone'));
    const { client } = fakeClient([RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(res).toEqual({ sent: 0, held: 0, rejected: 1, stoppedOnNetworkError: false });
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([
      expect.objectContaining({ sale: sale('s1'), eventId: 'gone', reason: 'event-deleted', kind: 'insertSale', opId: 'o1' }),
    ]);
  });

  it('RLS on a known unlocked event counts once per hydrate, then rejects as not-member', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    const snapshotAt = now - 1;
    // Twice before a new hydrate: one counted attempt.
    for (let i = 0; i < 2; i++) {
      now += 10;
      await ob.flush(fakeClient([RLS]).client, { ...ctxOf(ev('e1')), snapshotAt });
    }
    expect(states(ob)).toEqual([['o1', 'pending', 1]]);
    // Each new snapshot allows one more count.
    for (let i = 2; i <= 4; i++) {
      now += 10;
      await ob.flush(fakeClient([RLS]).client, { ...ctxOf(ev('e1')), snapshotAt: now - 5 });
      expect(states(ob)).toEqual([['o1', 'pending', i]]);
    }
    now += 10;
    const res = await ob.flush(fakeClient([RLS]).client, { ...ctxOf(ev('e1')), snapshotAt: now - 5 });
    expect(res.rejected).toBe(1);
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([expect.objectContaining({ sale: sale('s1'), reason: 'not-member' })]);
  });

  it('rejects this and all remaining entries as disabled when the profile is disabled, and stops', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    ob.enqueue(del('o3', 's0'));
    const isDisabled = vi.fn(() => Promise.resolve(true));
    const { client, calls } = fakeClient([RLS]);
    const res = await ob.flush(client, { ...ctxOf(ev('e1')), isDisabled });
    expect(calls).toHaveLength(1);
    expect(isDisabled).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ sent: 0, held: 0, rejected: 3, stoppedOnNetworkError: false });
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected().map((r) => [r.opId, r.reason])).toEqual([
      ['o1', 'disabled'],
      ['o2', 'disabled'],
      ['o3', 'disabled'],
    ]);
  });

  it('an RLS error with an active profile is classified by event, not as disabled', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1'), 'gone'));
    const isDisabled = vi.fn(() => Promise.resolve(false));
    await ob.flush(fakeClient([RLS]).client, { ...ctxOf(), isDisabled });
    expect(isDisabled).toHaveBeenCalledTimes(1);
    expect(ob.rejected().map((r) => r.reason)).toEqual(['event-deleted']);
  });

  it('asks isDisabled at most once per flush', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1', 5000), 'locked'));
    ob.enqueue(ins('o2', sale('s2', 6000), 'locked'));
    const isDisabled = vi.fn(() => Promise.resolve(false));
    await ob.flush(fakeClient([RLS, RLS]).client, { ...ctxOf(ev('locked', 4000)), isDisabled });
    expect(isDisabled).toHaveBeenCalledTimes(1);
    expect(states(ob)).toEqual([
      ['o1', 'held-locked', 0],
      ['o2', 'held-locked', 0],
    ]);
  });

  it('a non-RLS 403 or 401 is never read as disabled', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    const isDisabled = vi.fn(() => Promise.resolve(true));
    await ob.flush(fakeClient([pgErr('', 'Forbidden', 403, 'Forbidden')]).client, { ...ctxOf(ev('e1')), isDisabled });
    expect(isDisabled).not.toHaveBeenCalled();
    expect(ob.rejected()).toEqual([]);
    expect(states(ob)).toEqual([['o1', 'pending', 1]]);
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

  it('skips corrupt stored elements', () => {
    localStorage.setItem(
      'sync:outbox',
      JSON.stringify([null, 3, 'x', { kind: 'insertSale' }, { id: 'o1', version: 1, kind: 'insertSale', eventId: 'e1', sale: sale('s1'), status: 'pending', attempts: 0 }]),
    );
    expect(createOutbox().entries().map((e) => e.id)).toEqual(['o1']);
  });

  it('server-error after 5 attempts rejects', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    for (let i = 1; i <= 4; i++) {
      now += COUNT_WINDOW;
      // o1 fails, o2 behind it is still attempted (and also fails).
      const { client, calls } = fakeClient([CHECK, CHECK]);
      const res = await ob.flush(client, ctxOf(ev('e1')));
      expect(calls).toHaveLength(2);
      expect(res).toEqual({ sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: false });
      expect(states(ob)).toEqual([
        ['o1', 'pending', i],
        ['o2', 'pending', i],
      ]);
    }
    now += COUNT_WINDOW;
    const { client } = fakeClient([CHECK]);
    const res = await ob.flush(client, ctxOf(ev('e1')));
    expect(res).toEqual({ sent: 1, held: 0, rejected: 1, stoppedOnNetworkError: false });
    expect(ob.entries()).toEqual([]);
    expect(ob.rejected()).toEqual([expect.objectContaining({ sale: sale('s1'), reason: 'server-error' })]);
  });

  it('a transient error counts at most once per minute', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    for (let i = 0; i < 6; i++) {
      now += 10_000;
      await ob.flush(fakeClient([CHECK]).client, ctxOf(ev('e1')));
    }
    // Counted at +10 s; the flushes at +20..+60 s fall inside the window.
    expect(states(ob)).toEqual([['o1', 'pending', 1]]);
    now += 10_000;
    await ob.flush(fakeClient([CHECK]).client, ctxOf(ev('e1')));
    expect(states(ob)).toEqual([['o1', 'pending', 2]]);
  });

  it('deleteSale ops go through the same path', async () => {
    const ob = createOutbox();
    ob.enqueue(del('o1', 's1'));
    ob.enqueue(del('o2', 's2', 'locked'));
    ob.enqueue(del('o3', 's3', 'gone'));
    const { client, calls } = fakeClient([DELETED('s1'), RLS, RLS]);
    const res = await ob.flush(client, ctxOf(ev('e1'), ev('locked', 4000)));
    expect(calls).toEqual([
      { table: 'sales', method: 'delete', arg: ['id', 's1', 'id'] },
      { table: 'sales', method: 'delete', arg: ['id', 's2', 'id'] },
      { table: 'sales', method: 'delete', arg: ['id', 's3', 'id'] },
    ]);
    expect(res).toEqual({ sent: 1, held: 1, rejected: 1, stoppedOnNetworkError: false });
    expect(states(ob)).toEqual([['o2', 'held-locked', 0]]);
    expect(ob.rejected()).toEqual([
      expect.objectContaining({ eventId: 'gone', reason: 'event-deleted', kind: 'deleteSale', sale: expect.objectContaining({ id: 's3' }) }),
    ]);
  });

  it('a delete returning 0 rows is held on a locked event and sent otherwise', async () => {
    const ob = createOutbox();
    ob.enqueue(del('o1', 's1', 'locked'));
    ob.enqueue(del('o2', 's2', 'e1'));
    const { client } = fakeClient([NONE_DELETED, NONE_DELETED]);
    const res = await ob.flush(client, ctxOf(ev('locked', 4000), ev('e1')));
    expect(res).toEqual({ sent: 1, held: 1, rejected: 0, stoppedOnNetworkError: false });
    expect(states(ob)).toEqual([['o1', 'held-locked', 0]]);
  });

  it('later ops on a sale wait while an earlier one is unresolved', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1', 5000), 'locked'));
    ob.enqueue(ins('o2', sale('s2'), 'locked'));
    // o1 was attempted (it may be on the server), so the undo is queued, not cancelled.
    const first = fakeClient([RLS, RLS]);
    await ob.flush(first.client, ctxOf(ev('locked', 4000)));
    ob.enqueue(del('o3', 's1', 'locked'));
    expect(states(ob)).toEqual([
      ['o1', 'held-locked', 0],
      ['o2', 'pending', 1],
      ['o3', 'pending', 0],
    ]);
    const { client, calls } = fakeClient([RLS]);
    await ob.flush(client, ctxOf(ev('locked', 4000)));
    // o1 stays held, so the delete of s1 is not sent; o2 (another sale) goes through.
    expect(calls.map((c) => [c.method, c.method === 'insert' ? (c.arg as { id: string }).id : (c.arg as string[])[1]])).toEqual([
      ['insert', 's1'],
      ['insert', 's2'],
    ]);
    expect(states(ob)).toEqual([
      ['o1', 'held-locked', 0],
      ['o3', 'pending', 0],
    ]);
  });

  it('undo of a never-attempted sale cancels both ops', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    ob.enqueue(ins('o2', sale('s2')));
    ob.enqueue(del('o3', 's1'));
    expect(ob.entries().map((e) => e.id)).toEqual(['o2']);
  });

  it('undo of an attempted sale is queued behind the insert', async () => {
    const ob = createOutbox();
    ob.enqueue(ins('o1', sale('s1')));
    // The send may have reached the server before the network dropped.
    await ob.flush(fakeClient([FETCH_FAILED]).client, ctxOf(ev('e1')));
    ob.enqueue(del('o2', 's1'));
    expect(ob.entries().map((e) => [e.id, e.lastAttemptAt])).toEqual([
      ['o1', now],
      ['o2', undefined],
    ]);
    const { client, calls } = fakeClient([DUPLICATE, DELETED('s1')]);
    await ob.flush(client, ctxOf(ev('e1')));
    expect(calls.map((c) => c.method)).toEqual(['insert', 'delete']);
    expect(ob.entries()).toEqual([]);
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
          eq: () => ({
            select: () => {
              calls.push('delete');
              return Promise.resolve(DELETED('s1'));
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;
    const p = ob.flush(client, ctxOf(ev('e1')));
    ob.enqueue(del('o2', 's1'));
    expect(ob.entries().map((e) => e.id)).toEqual(['o1', 'o2']);
    release(CREATED);
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
    const { client } = fakeClient([CREATED, RLS]);
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

  it('two tabs on one account merge instead of overwriting each other', async () => {
    const tabA = createOutbox();
    const tabB = createOutbox();
    const onA = vi.fn();
    const off = tabA.subscribe(onA);
    tabA.enqueue(ins('a1', sale('s1')));
    tabB.enqueue(ins('b1', sale('s2')));
    // B's commit merged A's entry instead of overwriting it.
    expect(JSON.parse(localStorage.getItem('sync:outbox')!).map((e: { id: string }) => e.id)).toEqual(['b1', 'a1']);
    // A picks up B's entry from the storage event.
    window.dispatchEvent(new StorageEvent('storage', { key: 'sync:outbox' }));
    expect(onA).toHaveBeenCalled();
    expect(tabA.entries().map((e) => e.id).sort()).toEqual(['a1', 'b1']);

    // B sends everything; A's next commit must not resurrect what B removed.
    await tabB.flush(fakeClient().client, ctxOf(ev('e1')));
    expect(JSON.parse(localStorage.getItem('sync:outbox')!)).toEqual([]);
    tabA.enqueue(ins('a2', sale('s3')));
    expect(tabA.entries().map((e) => e.id)).toEqual(['a2']);
    expect(JSON.parse(localStorage.getItem('sync:outbox')!).map((e: { id: string }) => e.id)).toEqual(['a2']);
    off();
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

const COUNT_WINDOW = 60_000;
