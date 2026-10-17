import { loadEntries, outboxStorageKey, toRejected, type RejectedSale } from './outbox';

/**
 * Sales still queued for `uid` when its session died (disabled account,
 * revoked or expired token), in the rejected-list form so the login view can
 * list and export them. Read-only: the queue stays for a later sign-in of the
 * same account.
 */
export function readStrandedSales(uid: string): RejectedSale[] {
  const at = Date.now();
  return loadEntries(outboxStorageKey(uid)).map((e) => toRejected(e, 'disabled', at));
}
