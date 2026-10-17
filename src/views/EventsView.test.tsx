import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChromeProvider } from '../components/ui/chrome';
import type { SaleEvent } from '../types';

const h = vi.hoisted(() => ({ isAdmin: false }));

const event: SaleEvent = {
  id: 'e1',
  catalogId: 'c1',
  name: 'Tournoi',
  kind: 'tournoi',
  createdAt: 1,
  enabledItemIds: [],
  sales: [],
  locked: false,
  lockedAt: null
};

vi.mock('../state/AppContext', () => ({
  useApp: () => ({
    events: [event],
    catalogs: [{ id: 'c1', name: 'Buvette' }],
    activeEventId: null,
    activeEvent: null,
    setActiveEvent: () => {},
    dispatchEvents: () => {}
  })
}));
vi.mock('../state/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', displayName: 'Nat', isAdmin: h.isAdmin, disabled: false } })
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { EventsView } from './EventsView';

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ChromeProvider openMenu={() => {}}>
        <EventsView />
      </ChromeProvider>
    )
  );
}

const buttonLabels = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim());

beforeEach(() => {
  h.isAdmin = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('EventsView', () => {
  it('Suppr. hidden for non-admin', () => {
    render();
    expect(buttonLabels()).toContain('Renommer');
    expect(buttonLabels()).not.toContain('Suppr.');
  });

  it('Suppr. shown for an admin', () => {
    h.isAdmin = true;
    render();
    expect(buttonLabels()).toContain('Suppr.');
  });
});
