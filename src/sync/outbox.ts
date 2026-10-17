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

export type OutboxEntry = OutboxOp & {
  status: 'pending' | 'held-locked';
  /** Counted failures; the entry is rejected at MAX_ATTEMPTS. */
  attempts: number;
  /** Last time a send was started (it may have reached the server). */
  lastAttemptAt?: number;
  /** Last time `attempts` was incremented for a generic transient error. */
  lastCountedAt?: number;
};

export type RejectReason = 'event-deleted' | 'not-member' | 'disabled' | 'unknown-version' | 'server-error';

export type RejectedSale = {
  /** For a deleteSale op only the id is known: the other fields are placeholders. */
  sale: Sale;
  eventId: string;
  reason: RejectReason;
  kind: 'insertSale' | 'deleteSale' | 'unknown';
  rejectedAt: number;
  /** Id of the outbox op (merge key across tabs). */
  opId: string;
  /** The stored entry, verbatim, so the export loses nothing. */
  entry: unknown;
};

export type FlushResult = { sent: number; held: number; rejected: number; stoppedOnNetworkError: boolean };

export type FlushContext = {
  eventsById: Map<string, SaleEvent>;
  /** Time (ms) of the last successful server snapshot: RLS failures count once per snapshot. */
  snapshotAt?: number;
  /** True only when the server positively says the caller's profile is disabled. */
  isDisabled?: () => Promise<boolean>;
  /** Called on an expired / invalid JWT; the entries are kept for the next flush. */
  refreshSession?: () => Promise<void>;
};

export interface Outbox {
  enqueue(op: OutboxOp): void;
  entries(): OutboxEntry[];
  rejected(): RejectedSale[];
  dismissRejected(): void;
  /** Moves every queued entry to `rejected` with `reason` (e.g. the account was disabled). Returns how many. */
  rejectAll(reason: RejectReason): number;
  flush(client: SupabaseClient<Database>, ctx: FlushContext): Promise<FlushResult>;
  flushing(): boolean;
  /** Also keeps this outbox in sync with other tabs while anyone listens. */
  subscribe(listener: () => void): () => void;
}

/** Thrown by callers that could not reach the server, so they can tell it from a real failure. */
export class OutboxOfflineError extends Error {
  constructor() {
    super('offline: sales stay in the outbox');
    this.name = 'OutboxOfflineError';
  }
}

/** Counted failures before an entry is rejected. */
export const MAX_ATTEMPTS = 5;
/** A generic transient error counts at most once per this window per entry. */
export const COUNT_WINDOW_MS = 60_000;

const NETWORK_RE = /fetch failed|Failed to fetch|NetworkError|Load failed/i;

type Verdict = 'ok' | 'zero-rows' | 'network' | 'auth' | 'rls' | 'other';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

type Response = { data?: unknown; error?: unknown; status?: unknown };

function classify(res: Response): Verdict {
  const err = res.error as { code?: unknown; message?: unknown } | null | undefined;
  if (!err) return Array.isArray(res.data) && res.data.length === 0 ? 'zero-rows' : 'ok';
  const code = typeof err.code === 'string' ? err.code : '';
  const message = typeof err.message === 'string' ? err.message : '';
  if (code === '23505') return 'ok'; // already inserted by an earlier replay
  const status = typeof res.status === 'number' ? res.status : undefined;
  if (NETWORK_RE.test(message) || isOffline()) return 'network';
  if (status === 0 || status === 429 || (status !== undefined && status >= 500)) return 'network';
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) return 'auth';
  if (code === '42501' || /row-level security/i.test(message)) return 'rls';
  return 'other';
}

/** Storage key of `uid`'s outbox: per account, kept across sign-outs. */
export const outboxStorageKey = (uid: string | null) => `sync:outbox:${uid}`;
/** Storage key of `uid`'s rejected list: per account, kept across sign-outs. */
export const rejectedStorageKey = (uid: string | null) => `sync:rejected:${uid}`;

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A corrupt element must not wedge the queue.
    return parsed.filter(
      (x): x is T => typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'string',
    );
  } catch {
    return [];
  }
}

/** Entries stored under `key`, without creating an outbox (read-only). */
export function loadEntries(key: string): OutboxEntry[] {
  return load<OutboxEntry>(key);
}

function loadRejected(key: string): RejectedSale[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RejectedSale => typeof x === 'object' && x !== null && typeof (x as { opId?: unknown }).opId === 'string',
    );
  } catch {
    return [];
  }
}

function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage full or blocked: the in-memory copy still holds the entries for this session.
    return false;
  }
}

/**
 * Merges what another tab stored with this tab's memory. An item this tab had
 * persisted but storage no longer has was removed by another tab (sent,
 * rejected, dismissed): drop it. An item only in storage is another tab's:
 * add it, unless this tab removed it. Items in both keep this tab's version.
 */
function reconcile<T>(
  mem: T[],
  stored: T[],
  key: (t: T) => string,
  persisted: Set<string>,
  removed: Set<string>,
  keep?: (t: T) => boolean,
): T[] {
  const storedIds = new Set(stored.map(key));
  const out = mem.filter((t) => storedIds.has(key(t)) || !persisted.has(key(t)) || (keep?.(t) ?? false));
  const outIds = new Set(out.map(key));
  for (const t of stored) if (!outIds.has(key(t)) && !removed.has(key(t))) out.push(t);
  return out;
}

const saleIdOf = (e: OutboxEntry) => (e.kind === 'insertSale' ? e.sale?.id : e.saleId);

function placeholderSale(saleId: string, at: number): Sale {
  return { id: saleId, timestamp: at, sellerId: '', lines: [], total: 0 };
}

/** The rejected-list form of a stored entry (any kind, verbatim copy kept). */
export function toRejected(entry: OutboxEntry, reason: RejectReason, at: number): RejectedSale {
  const raw = entry as unknown as { kind?: unknown; sale?: Sale; saleId?: string; eventId?: string; id: string };
  const kind = raw.kind === 'insertSale' || raw.kind === 'deleteSale' ? raw.kind : 'unknown';
  const sale = raw.sale ?? placeholderSale(raw.saleId ?? raw.id, at);
  return { sale, eventId: String(raw.eventId), reason, kind, rejectedAt: at, opId: raw.id, entry };
}

export function createOutbox(storageKey = 'sync:outbox', rejectedKey = 'sync:rejected'): Outbox {
  // Memory is the source of truth for this tab; storage is written through and
  // reconciled with other tabs on every commit and storage event.
  let entries = load<OutboxEntry>(storageKey);
  let rejected = loadRejected(rejectedKey);
  const persistedEntries = new Set(entries.map((e) => e.id));
  const persistedRejected = new Set(rejected.map((r) => r.opId));
  const removedEntries = new Set<string>();
  const removedRejected = new Set<string>();
  const listeners = new Set<() => void>();
  let busy = false;
  let current: Promise<FlushResult> | null = null;
  let inFlightId: string | null = null;

  const notify = () => listeners.forEach((l) => l());
  const syncFromStorage = () => {
    entries = reconcile(
      entries,
      load<OutboxEntry>(storageKey),
      (e) => e.id,
      persistedEntries,
      removedEntries,
      (e) => e.id === inFlightId,
    );
    rejected = reconcile(rejected, loadRejected(rejectedKey), (r) => r.opId, persistedRejected, removedRejected);
  };
  const commit = () => {
    syncFromStorage();
    if (save(storageKey, entries)) {
      persistedEntries.clear();
      entries.forEach((e) => persistedEntries.add(e.id));
    }
    if (save(rejectedKey, rejected)) {
      persistedRejected.clear();
      rejected.forEach((r) => persistedRejected.add(r.opId));
    }
    notify();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== storageKey && e.key !== rejectedKey && e.key !== null) return;
    syncFromStorage();
    // What storage holds now is what is persisted.
    persistedEntries.clear();
    load<OutboxEntry>(storageKey).forEach((x) => persistedEntries.add(x.id));
    persistedRejected.clear();
    loadRejected(rejectedKey).forEach((x) => persistedRejected.add(x.opId));
    notify();
  };

  const update = (id: string, patch: Partial<OutboxEntry>) => {
    entries = entries.map((e) => (e.id === id ? ({ ...e, ...patch } as OutboxEntry) : e));
  };
  const remove = (id: string) => {
    entries = entries.filter((e) => e.id !== id);
    removedEntries.add(id);
  };
  const reject = (entry: OutboxEntry, reason: RejectReason) => {
    rejected = [...rejected, toRejected(entry, reason, Date.now())];
    remove(entry.id);
  };

  async function send(client: SupabaseClient<Database>, op: OutboxOp): Promise<Response> {
    try {
      return op.kind === 'insertSale'
        ? await client.from('sales').insert(saleToRow(op.sale, op.eventId))
        : await client.from('sales').delete().eq('id', op.saleId).select('id');
    } catch (err) {
      // supabase-js reports fetch failures as `{ error }`; a throw is treated the same way.
      return { error: err instanceof TypeError ? { message: 'Failed to fetch' } : err ?? { message: 'unknown' } };
    }
  }

  async function run(client: SupabaseClient<Database>, ctx: FlushContext): Promise<FlushResult> {
    const res: FlushResult = { sent: 0, held: 0, rejected: 0, stoppedOnNetworkError: false };
    const visited = new Set<string>();
    // Sale ids with an earlier entry still unresolved in this flush: later ops on that sale wait.
    const blockedSales = new Set<string>();
    const snapshotAt = ctx.snapshotAt ?? 0;
    // Asked at most once per flush (one profile read), and only after an RLS refusal.
    let disabledCheck: Promise<boolean> | null = null;
    const isDisabled = () =>
      (disabledCheck ??= (ctx.isDisabled?.() ?? Promise.resolve(false)).catch(() => false));
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
        const saleId = saleIdOf(entry);
        if (saleId !== undefined && blockedSales.has(saleId)) continue;
        if (isOffline()) {
          res.stoppedOnNetworkError = true;
          break;
        }

        const prevAttemptAt = entry.lastAttemptAt;
        const now = Date.now();
        // Marked before sending: from here on the server may have seen it.
        update(entry.id, { lastAttemptAt: now });
        commit();
        inFlightId = entry.id;
        const verdict = classify(await send(client, entry));
        inFlightId = null;

        const ev = ctx.eventsById.get(entry.eventId);
        const lockExplains =
          ev !== undefined &&
          ev.lockedAt !== null &&
          (entry.kind === 'deleteSale' || entry.sale.timestamp >= ev.lockedAt);
        let unresolved = false;

        if (verdict === 'ok') {
          remove(entry.id);
          res.sent++;
        } else if (verdict === 'zero-rows') {
          // A delete that matched nothing: RLS hid the row (locked event) or it is already gone.
          if (entry.kind === 'deleteSale' && ev?.lockedAt != null) {
            update(entry.id, { status: 'held-locked' });
            res.held++;
            unresolved = true;
          } else {
            remove(entry.id);
            res.sent++;
          }
        } else if (verdict === 'network') {
          res.stoppedOnNetworkError = true;
          commit();
          break;
        } else if (verdict === 'auth') {
          // Expired or invalid token: nothing is wrong with the sale.
          commit();
          await ctx.refreshSession?.().catch(() => undefined);
          break;
        } else if (verdict === 'rls') {
          const disabled = await isDisabled();
          if (disabled) {
            const rest = entries.filter((e) => e.id === entry.id || !visited.has(e.id));
            for (const e of rest) reject(e, 'disabled');
            res.rejected += rest.length;
            commit();
            break;
          }
          if (!ev) {
            reject(entry, 'event-deleted');
            res.rejected++;
          } else if (lockExplains) {
            update(entry.id, { status: 'held-locked' });
            res.held++;
            unresolved = true;
          } else {
            // Visible event, refused anyway: counts once per server snapshot.
            const counts = prevAttemptAt === undefined || snapshotAt > prevAttemptAt;
            const attempts = entry.attempts + (counts ? 1 : 0);
            if (attempts >= MAX_ATTEMPTS) {
              reject(entry, 'not-member');
              res.rejected++;
            } else {
              update(entry.id, { status: 'pending', attempts });
              unresolved = true;
            }
          }
        } else {
          const last = entry.lastCountedAt;
          const counts = last === undefined || now - last >= COUNT_WINDOW_MS;
          const attempts = entry.attempts + (counts ? 1 : 0);
          if (attempts >= MAX_ATTEMPTS) {
            reject(entry, 'server-error');
            res.rejected++;
          } else {
            update(entry.id, counts ? { status: 'pending', attempts, lastCountedAt: now } : { status: 'pending' });
            unresolved = true;
          }
        }
        if (unresolved && saleId !== undefined) blockedSales.add(saleId);
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
        // Undo of a sale the server never saw (never attempted): drop both instead of sending a pair.
        const unsent = entries.find(
          (e) =>
            e.kind === 'insertSale' &&
            e.version === 1 &&
            e.sale.id === op.saleId &&
            e.lastAttemptAt === undefined &&
            e.id !== inFlightId,
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
      for (const r of rejected) removedRejected.add(r.opId);
      rejected = [];
      commit();
    },
    rejectAll(reason) {
      const all = entries;
      for (const e of all) reject(e, reason);
      if (all.length > 0) commit();
      return all.length;
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
      if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
  };
}
