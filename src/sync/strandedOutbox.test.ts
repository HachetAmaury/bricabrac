import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readStrandedSales } from './strandedOutbox';
import { outboxStorageKey } from './outbox';

const sale = (id: string, total: number) => ({ id, sellerId: 'u1', timestamp: 1000, lines: [], total });
const entry = (id: string, s: ReturnType<typeof sale>) => ({
  id,
  version: 1,
  kind: 'insertSale',
  eventId: 'e1',
  sale: s,
  status: 'pending',
  attempts: 0,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('readStrandedSales', () => {
  it('lists pending insertSale entries as disabled rejected sales without touching storage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    const stored = JSON.stringify([entry('o1', sale('s1', 750)), entry('o2', sale('s2', 200))]);
    localStorage.setItem(outboxStorageKey('u1'), stored);
    localStorage.setItem('sync:rejected:u1', '[]');
    const before = { ...localStorage };

    const out = readStrandedSales('u1');

    expect(out.map((r) => [r.opId, r.kind, r.reason, r.sale.total, r.eventId, r.rejectedAt])).toEqual([
      ['o1', 'insertSale', 'disabled', 750, 'e1', 5000],
      ['o2', 'insertSale', 'disabled', 200, 'e1', 5000],
    ]);
    expect(out[0].entry).toEqual(JSON.parse(stored)[0]);
    expect({ ...localStorage }).toEqual(before);
  });

  it('turns a pending undo into the annulation placeholder', () => {
    localStorage.setItem(
      outboxStorageKey('u1'),
      JSON.stringify([{ id: 'o3', version: 1, kind: 'deleteSale', eventId: 'e1', saleId: 's9', status: 'pending', attempts: 0 }]),
    );
    const [r] = readStrandedSales('u1');
    expect(r.kind).toBe('deleteSale');
    expect(r.sale.id).toBe('s9');
  });

  it('returns nothing for an empty or missing outbox', () => {
    expect(readStrandedSales('u2')).toEqual([]);
    localStorage.setItem(outboxStorageKey('u2'), '[]');
    expect(readStrandedSales('u2')).toEqual([]);
  });
});
