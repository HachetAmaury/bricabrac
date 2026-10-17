import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RejectedSale } from '../sync/outbox';

const h = vi.hoisted(() => ({ app: {} as Record<string, unknown> }));
vi.mock('../state/AppContext', () => ({ useApp: () => h.app, AppProvider: () => null }));
vi.mock('../state/AuthContext', () => ({ useAuth: () => ({}), AuthProvider: () => null }));
vi.mock('../lib/supabase', () => ({ supabase: {}, hasSupabaseConfig: () => true }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SyncBanner } from './SyncBanner';
import { RejectedSalesDialog } from '../App';

let container: HTMLDivElement;
let root: Root;
const render = (el: JSX.Element) => {
  act(() => root.render(el));
  return container.textContent;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SyncBanner', () => {
  const show = (syncStatus: string, outbox: { pending: number; held: number; flushing: boolean }) => {
    h.app = { syncStatus, outbox };
    return render(<SyncBanner />);
  };

  it('is empty when nothing waits', () => {
    expect(show('offline', { pending: 0, held: 0, flushing: false })).toBe('');
  });

  it('counts waiting sales while offline', () => {
    expect(show('offline', { pending: 2, held: 0, flushing: false })).toBe('Hors ligne · 2 vente(s) en attente');
  });

  it('says it is syncing during a flush', () => {
    expect(show('online', { pending: 1, held: 0, flushing: true })).toBe('Synchronisation…');
  });

  it('re-renders when the browser goes offline', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(show('online', { pending: 2, held: 0, flushing: false })).toBe('');
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(container.textContent).toBe('Hors ligne · 2 vente(s) en attente');
  });

  it('reports sales held by a locked event', () => {
    expect(show('online', { pending: 0, held: 3, flushing: false })).toBe(
      '3 vente(s) bloquée(s) : événement verrouillé',
    );
  });
});

describe('RejectedSalesDialog', () => {
  const ts = new Date(2026, 9, 17, 14, 5).getTime();
  const rejected: RejectedSale[] = [
    {
      sale: { id: 's1', sellerId: 'u1', timestamp: ts, lines: [], total: 750 },
      eventId: 'e1',
      reason: 'event-deleted',
      opId: 'o1',
      kind: 'insertSale',
      rejectedAt: ts,
      entry: {},
    },
    {
      sale: { id: 's2', sellerId: 'u1', timestamp: ts, lines: [], total: 200 },
      eventId: 'e1',
      reason: 'server-error',
      opId: 'o2',
      kind: 'insertSale',
      rejectedAt: ts,
      entry: {},
    },
  ];

  it('renders nothing when there is no rejected sale', () => {
    h.app = { rejected: [], dismissRejected: vi.fn() };
    render(<RejectedSalesDialog />);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lists each sale with time, total and French reason; OK dismisses', () => {
    const dismissRejected = vi.fn();
    h.app = { rejected, dismissRejected };
    render(<RejectedSalesDialog />);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Ventes non synchronisées');
    expect([...dialog.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '14:05 · 7,50 € · événement supprimé',
      '14:05 · 2,00 € · erreur serveur',
    ]);
    const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'OK')!;
    act(() => ok.click());
    expect(dismissRejected).toHaveBeenCalledTimes(1);
  });

  it('exports the rejected sales as JSON', async () => {
    h.app = { rejected, dismissRejected: vi.fn() };
    const blobs: Blob[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:x';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<RejectedSalesDialog />);
    const btn = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Exporter en JSON')!;
    act(() => btn.click());
    expect(click).toHaveBeenCalledTimes(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blobs[0]);
    });
    expect(JSON.parse(text)).toEqual({ rejectedSales: rejected });
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });
});
