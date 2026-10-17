import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChromeProvider } from '../components/ui/chrome';
import type { Profile, Sale, SaleEvent } from '../types';

const h = vi.hoisted(() => ({
  event: null as SaleEvent | null,
  profiles: [] as Profile[],
  dispatchEvents: vi.fn()
}));

vi.mock('../state/AppContext', () => ({
  useApp: () => ({ activeEvent: h.event, profiles: h.profiles, dispatchEvents: h.dispatchEvents })
}));
vi.mock('../state/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } })
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ReportView } from './ReportView';

const profile = (id: string, displayName: string): Profile => ({ id, displayName, isAdmin: false, disabled: false });
const sale = (id: string, sellerId: string, timestamp: number, total: number): Sale => ({
  id,
  timestamp,
  sellerId,
  total,
  lines: [{ itemId: 'i1', name: 'Café', price: total, qty: 1 }]
});

const baseEvent: SaleEvent = {
  id: 'e1',
  catalogId: 'c1',
  name: 'Bric-à-brac',
  kind: 'bric-a-brac',
  createdAt: 1,
  enabledItemIds: [],
  sales: [
    sale('s1', 'me', 1000, 200),
    sale('s2', 'zoe', 2000, 300),
    sale('s3', 'me', 3000, 100),
    sale('s4', 'abel', 4000, 500)
  ],
  locked: false,
  lockedAt: null,
  cashFloat: 0,
  cashCount: {}
};

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ChromeProvider openMenu={() => {}}>
        <ReportView />
      </ChromeProvider>
    )
  );
}
const annuler = () =>
  Array.from(container.querySelectorAll('[role="button"]')).filter((e) => e.textContent === 'Annuler');
const text = () => container.textContent ?? '';

beforeEach(() => {
  h.dispatchEvents.mockClear();
  h.event = baseEvent;
  h.profiles = [profile('me', 'Nat'), profile('zoe', 'Zoé'), profile('abel', 'Abel')];
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('ReportView per seller', () => {
  it('shows my section first, then others by name, with count and total', () => {
    render();
    const nat = text().indexOf('Nat · 2 vente(s)');
    const abel = text().indexOf('Abel · 1 vente(s)');
    const zoe = text().indexOf('Zoé · 1 vente(s)');
    expect(nat).toBeGreaterThan(-1);
    expect(abel).toBeGreaterThan(nat);
    expect(zoe).toBeGreaterThan(abel);
    expect(text()).toMatch(/Nat · 2 vente\(s\) · 3,00\s€/);
    expect(text()).toMatch(/Abel · 1 vente\(s\) · 5,00\s€/);
  });

  it('offers Annuler exactly once, on my latest sale, and dispatches undoMyLast', () => {
    render();
    const buttons = annuler();
    expect(buttons).toHaveLength(1);
    // my latest sale (s3, total 1,00 €) is the row holding the button
    expect(buttons[0].closest('[data-testid]')?.getAttribute('data-testid')).toBe('sale-s3');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    act(() => (buttons[0] as HTMLElement).click());
    expect(h.dispatchEvents).toHaveBeenCalledWith({ type: 'undoMyLast', eventId: 'e1', sellerId: 'me' });
  });

  it('hides Annuler when the event is locked', () => {
    h.event = { ...baseEvent, locked: true, lockedAt: 9 };
    render();
    expect(annuler()).toHaveLength(0);
  });

  it('labels an unknown seller as Vendeur inconnu', () => {
    h.event = { ...baseEvent, sales: [sale('s9', 'ghost', 5000, 100)] };
    render();
    expect(text()).toContain('Vendeur inconnu · 1 vente(s)');
    expect(annuler()).toHaveLength(0);
  });
});
