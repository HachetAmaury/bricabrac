import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import type { Sale, SaleEvent } from '../types';
import { saleToRow } from './mappers';

/**
 * Durable queue of sale writes. A sale is recorded locally first, then sent
 * from here; nothing leaves the queue without either reaching the server or
 * landing in the visible, exportable `rejected` list.
 */

export type OutboxOp =
  | { id: string; version: 1; kind: 'insertSale'; eventId: string; sale: Sale }
  | { id: string; version: 1; kind: 'deleteSale'; eventId: string; saleId: string };

export type OutboxEntry = OutboxOp & { status: 'pending' | 'held-locked'; attempts: number };

export type RejectReason = 'event-deleted' | 'not-member' | 'disabled' | 'unknown-version' | 'server-error';

export type RejectedSale = {
  /** For a deleteSale op only the id is known: the other fields are placeholders. */
  sale: Sale;
  eventId: string;
  reason: RejectReason;
  kind: 'insertSale' | 'deleteSale' | 'unknown';
  rejectedAt: number;
  /** The stored entry, verbatim, so the export loses nothing. */
  entry: unknown;
};

export type FlushResult = { sent: number; held: number; rejected: number; stoppedOnNetworkError: boolean };

export type FlushContext = { eventsById: Map<string, SaleEvent> };

export interface Outbox {
  enqueue(op: OutboxOp): void;
  entries(): OutboxEntry[];
  rejected(): RejectedSale[];
  dismissRejected(): void;
  flush(client: SupabaseClient<Database>, ctx: FlushContext): Promise<FlushResult>;
  flushing(): boolean;
  subscribe(listener: () => void): () => void;
}

/** Thrown by callers that could not reach the server, so they can tell it from a real failure. */
export class OutboxOfflineError extends Error {
  constructor() {
    super('offline: sales stay in the outbox');
    this.name = 'OutboxOfflineError';
  }
}

/** Transient failures retried this many times before the entry is rejected. */
export const MAX_ATTEMPTS = 5;

const NETWORK_RE = /fetch failed|Failed to fetch|NetworkError|Load failed/i;

type Verdict = 'ok' | 'network' | 'rls' | 'disabled' | 'other';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function classify(err: unknown, thrown: boolean): Verdict {
  if (!err) return 'ok';
  if (thrown && err instanceof TypeError) return 'network';
  const e = err as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  if (code === '23505') return 'ok'; // already inserted by an earlier replay
  if (NETWORK_RE.test(message) || isOffline()) return 'network';
  if (code === '42501' || code === 'PGRST301' || /row-level security/i.test(message)) return 'rls';
  if (code === 'PGRST303' || e.status === 401 || e.status === 403) return 'disabled';
  return 'other';
}

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory copy still holds the entries for this session.
  }
}

function placeholderSale(saleId: string, at: number): Sale {
  return { id: saleId, timestamp: at, sellerId: '', lines: [], total: 0 };
}

export function createOutbox(storageKey = 'sync:outbox', rejectedKey = 'sync:rejected'): Outbox {
  // Memory is the source of truth for this session; storage is written through.
  let entries = load<OutboxEntry>(storageKey);
  let rejected = load<RejectedSale>(rejectedKey);
  const listeners = new Set<() => void>();
  let busy = false;
  let current: Promise<FlushResult> | null = null;
  let inFlightId: string | null = null;

  const notify = () => listeners.forEach((l) => l());
  const commit = () => {
    save(storageKey, entries);
    save(rejectedKey, rejected);
    notify();
  };
  const update = (id: string, patch: Partial<OutboxEntry>) => {
    entries = entries.map((e) => (e.id === id ? ({ ...e, ...patch } as OutboxEntry) : e));
  };
  const remove = (id: string) => {
    entries = entries.filter((e) => e.id !== id);
  };
  const reject = (entry: OutboxEntry, reason: RejectReason) => {
    const raw = entry as unknown as { kind?: unknown; sale?: Sale; saleId?: string; eventId?: string; id?: string };
    const kind = raw.kind === 'insertSale' || raw.kind === 'deleteSale' ? raw.kind : 'unknown';
    const at = Date.now();
    const sale = raw.sale ?? placeholderSale(raw.saleId ?? String(raw.id), at);
    rejected = [...rejected, { sale, eventId: String(raw.eventId), reason, kind, rejectedAt: at, entry }];
    remove(entry.id);
  };

  async function send(client: SupabaseClient<Database>, op: OutboxOp): Promise<Verdict> {
    try {
      const { error } =
        op.kind === 'insertSale'
          ? await client.from('sales').insert(saleToRow(op.sale, op.eventId))
          : await client.from('sales').delete().eq('id', op.saleId);
      return classify(error, false);
    } catch (err) {
      return classify(err ?? new Error('unknown'), true);
    }
  }

  async function run(client: SupabaseClient<Database>, ctx: FlushContext): Promise<FlushResult> {
    const res: FlushResult = { sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: false };
    const visited = new Set<string>();
    try {
      // Re-read the queue at each step so ops enqueued during the flush are sent too, in order.
      for (;;) {
        const entry = entries.find((e) => !visited.has(e.id));
        if (!entry) break;
        visited.add(entry.id);

        if (entry.version !== 1) {
          reject(entry, 'unknown-version');
          res.rejected++;
          commit();
          continue;
        }
        if (isOffline()) {
          res.stoppedOnNetworkError = true;
          break;
        }

        inFlightId = entry.id;
        const verdict = await send(client, entry);
        inFlightId = null;

        if (verdict === 'ok') {
          remove(entry.id);
          res.sent++;
        } else if (verdict === 'network') {
          res.stoppedOnNetworkError = true;
          break;
        } else if (verdict === 'disabled') {
          reject(entry, 'disabled');
          res.rejected++;
          commit();
          break;
        } else if (verdict === 'rls') {
          const ev = ctx.eventsById.get(entry.eventId);
          const lockExplains =
            ev !== undefined &&
            ev.lockedAt !== null &&
            (entry.kind === 'deleteSale' || entry.sale.timestamp >= ev.lockedAt);
          if (!ev) {
            reject(entry, 'event-deleted');
            res.rejected++;
          } else if (lockExplains) {
            update(entry.id, { status: 'held-locked' });
            res.held++;
          } else if (entry.attempts + 1 >= MAX_ATTEMPTS) {
            // The event is visible but the server refuses: membership was removed.
            reject(entry, 'not-member');
            res.rejected++;
          } else {
            update(entry.id, { status: 'pending', attempts: entry.attempts + 1 });
          }
        } else if (entry.attempts + 1 >= MAX_ATTEMPTS) {
          reject(entry, 'server-error');
          res.rejected++;
        } else {
          update(entry.id, { status: 'pending', attempts: entry.attempts + 1 });
        }
        commit();
      }
      return res;
    } finally {
      // Cleared synchronously with the last queue check: a later flush() starts a fresh run.
      inFlightId = null;
      busy = false;
      notify();
    }
  }

  return {
    enqueue(op) {
      if (op.kind === 'deleteSale') {
        // Undo of a sale the server never saw: drop both instead of sending a pair.
        const unsent = entries.find(
          (e) => e.kind === 'insertSale' && e.version === 1 && e.sale.id === op.saleId && e.id !== inFlightId,
        );
        if (unsent) {
          remove(unsent.id);
          commit();
          return;
        }
      }
      entries = [...entries, { ...op, status: 'pending', attempts: 0 }];
      commit();
    },
    entries: () => entries,
    rejected: () => rejected,
    dismissRejected() {
      rejected = [];
      commit();
    },
    flush(client, ctx) {
      if (busy && current) return current;
      busy = true;
      notify();
      current = run(client, ctx);
      return current;
    },
    flushing: () => busy,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
