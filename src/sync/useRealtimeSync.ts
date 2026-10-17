import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import type { Category, Item, SaleEvent } from '../types';
import type { CatalogAction } from '../state/catalogReducer';
import type { CategoriesAction } from '../state/categoriesReducer';
import type { EventsAction } from '../state/eventsReducer';
import { subscribeAll, type SyncScope } from './realtime';

/** Ids of the last server snapshot. A new object (resubscribe) only when the ids change. */
export type RealtimeScope = { eventIds: string[]; catalogIds: string[] };

const sameIds = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

/** Keeps `prev` (so the channel stays up) when the id sets are unchanged. */
export function nextScope(prev: RealtimeScope | null, next: RealtimeScope): RealtimeScope {
  return prev && sameIds(prev.eventIds, next.eventIds) && sameIds(prev.catalogIds, next.catalogIds)
    ? prev
    : next;
}

type Options = {
  client: SupabaseClient<Database>;
  userId: string | null;
  scope: RealtimeScope | null;
  refresh: () => Promise<void>;
  /** Always the latest state (AppContext updates them synchronously on dispatch). */
  itemsRef: MutableRefObject<Item[]>;
  categoriesRef: MutableRefObject<Category[]>;
  eventsRef: MutableRefObject<SaleEvent[]>;
  onItem: (a: CatalogAction) => void;
  onCategory: (a: CategoriesAction) => void;
  onEvent: (a: EventsAction) => void;
};

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const DOWN = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

/**
 * Keeps one Realtime channel matching the last snapshot, and refetches (which
 * resubscribes) when the app comes back to the foreground or online, when the
 * channel drops, or when the user's event memberships change.
 */
export function useRealtimeSync(o: Options): void {
  const latest = useRef(o);
  latest.current = o;
  const retry = useRef<{
    delay: number;
    wasDown: boolean;
    serverClosed: boolean;
    timer?: ReturnType<typeof setTimeout>;
  }>({ delay: RETRY_MIN_MS, wasDown: false, serverClosed: false });
  // Bumped to reopen a channel the server closed (realtime-js does not rejoin those).
  const [generation, setGeneration] = useState(0);

  const { client, userId, scope: ids } = o;
  useEffect(() => {
    if (!userId || !ids) return;
    const l = () => latest.current;
    const scope: SyncScope = {
      eventIds: new Set(ids.eventIds),
      catalogIds: new Set(ids.catalogIds),
      userId,
      // Built from live state on read: sales recorded after subscribing must be routable.
      get saleEventById() {
        const m = new Map<string, string>();
        for (const e of l().eventsRef.current) for (const s of e.sales) m.set(s.id, e.id);
        return m;
      },
    };
    const unsubscribe = subscribeAll(client, scope, {
      onItem: (a) => l().onItem(a),
      onCategory: (a) => l().onCategory(a),
      onEvent: (a) => l().onEvent(a),
      onMembershipChanged: () => void l().refresh(),
      getEvent: (id) => l().eventsRef.current.find((e) => e.id === id),
      hasItem: (id) => l().itemsRef.current.some((i) => i.id === id),
      hasCategory: (id) => l().categoriesRef.current.some((c) => c.id === id),
      onStatus: (status) => {
        const r = retry.current;
        if (status === 'SUBSCRIBED') {
          r.delay = RETRY_MIN_MS;
          if (!r.wasDown) return;
          // realtime-js rejoined by itself: catch up on what the outage missed.
          r.wasDown = false;
          clearTimeout(r.timer);
          r.timer = undefined;
          void l().refresh();
          return;
        }
        if (!DOWN.has(status)) return;
        r.wasDown = true;
        if (status === 'CLOSED') r.serverClosed = true;
        // realtime-js re-errors on each of its own reconnect attempts: keep the
        // pending retry instead of pushing it back. Backoff caps repeated failures.
        if (r.timer !== undefined) return;
        r.timer = setTimeout(() => {
          r.timer = undefined;
          if (r.serverClosed) {
            r.serverClosed = false;
            setGeneration((g) => g + 1);
          }
          void l().refresh();
        }, r.delay);
        r.delay = Math.min(r.delay * 2, RETRY_MAX_MS);
      },
    });
    return () => {
      clearTimeout(retry.current.timer);
      retry.current.timer = undefined;
      unsubscribe();
    };
  }, [client, userId, ids, generation]);

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void latest.current.refresh();
    };
    const onOnline = () => void latest.current.refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);
}
