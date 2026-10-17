import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Profile, SaleEvent } from '../types';

const h = vi.hoisted(() => ({
  events: [] as SaleEvent[],
  fetchGrants: vi.fn(),
  setGrant: vi.fn()
}));

vi.mock('../state/AppContext', () => ({ useApp: () => ({ events: h.events }) }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../sync/writes', () => ({ fetchGrants: h.fetchGrants, setGrant: h.setGrant }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { GrantsModal } from './GrantsModal';

const ev = (id: string, name: string): SaleEvent => ({
  id,
  catalogId: 'c1',
  name,
  kind: 'autre',
  createdAt: 1,
  enabledItemIds: [],
  sales: [],
  locked: false,
  lockedAt: null
});
const bob: Profile = { id: 'u2', displayName: 'Bob', isAdmin: false, disabled: false };

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<GrantsModal user={bob} onClose={() => {}} />));
}

const toggle = (name: string) =>
  container.querySelector(`[role="switch"][aria-label="Accès à ${name}"]`) as HTMLButtonElement;

beforeEach(() => {
  h.events = [ev('e2', 'Tournoi'), ev('e1', 'Brocante')];
  h.fetchGrants.mockReset().mockResolvedValue(['e1']);
  h.setGrant.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('GrantsModal', () => {
  it('shows the user grants once loaded', async () => {
    await render();
    expect(h.fetchGrants).toHaveBeenCalledWith({}, 'u2');
    expect(container.textContent).toContain('Accès aux événements · Bob');
    expect(toggle('Brocante').getAttribute('aria-checked')).toBe('true');
    expect(toggle('Tournoi').getAttribute('aria-checked')).toBe('false');
  });

  it('toggling writes the grant', async () => {
    await render();
    await act(async () => toggle('Tournoi').click());
    expect(h.setGrant).toHaveBeenCalledWith({}, 'e2', 'u2', true);
    expect(toggle('Tournoi').getAttribute('aria-checked')).toBe('true');
  });

  it('reverts and shows an error when the write fails', async () => {
    h.setGrant.mockRejectedValue(new Error('offline'));
    await render();
    await act(async () => toggle('Brocante').click());
    expect(h.setGrant).toHaveBeenCalledWith({}, 'e1', 'u2', false);
    expect(toggle('Brocante').getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('Modification impossible. Vérifiez le réseau.');
  });
});
