import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChromeProvider } from '../components/ui/chrome';
import type { Catalog, Profile } from '../types';

const h = vi.hoisted(() => ({
  profiles: [] as Profile[],
  catalogs: [] as Catalog[],
  me: null as Profile | null,
  refresh: vi.fn(),
  dispatchCatalogs: vi.fn(),
  adminUsers: vi.fn()
}));

vi.mock('../state/AppContext', () => ({
  useApp: () => ({
    profiles: h.profiles,
    catalogs: h.catalogs,
    events: [],
    refresh: h.refresh,
    dispatchCatalogs: h.dispatchCatalogs
  })
}));
vi.mock('../state/AuthContext', () => ({
  useAuth: () => ({ profile: h.me })
}));
vi.mock('../sync/adminApi', () => ({
  adminUsers: h.adminUsers
}));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AdminView } from './AdminView';

const admin: Profile = { id: 'u1', displayName: 'Nat', isAdmin: true, disabled: false };
const member: Profile = { id: 'u2', displayName: 'Bob', isAdmin: false, disabled: false };
const gone: Profile = { id: 'u3', displayName: 'Ana', isAdmin: false, disabled: true };

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ChromeProvider openMenu={() => {}}>
        <AdminView onBack={() => {}} />
      </ChromeProvider>
    )
  );
}

function fill(label: string, value: string) {
  const l = Array.from(container.querySelectorAll('label')).find((el) => el.textContent?.includes(label))!;
  const input = l.querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const button = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

beforeEach(() => {
  h.profiles = [admin, member, gone];
  h.catalogs = [{ id: 'c1', name: 'Buvette' }];
  h.me = admin;
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.dispatchCatalogs.mockReset().mockResolvedValue(null);
  h.adminUsers.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('AdminView', () => {
  it('renders one row per profile, sorted by name, with their status', () => {
    render();
    const text = container.textContent ?? '';
    expect(text).toContain('Utilisateurs');
    expect(text.indexOf('Ana')).toBeLessThan(text.indexOf('Bob'));
    expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Nat'));
    expect(text).toContain('Administrateur');
    expect(text).toContain('Désactivé');
    expect(text).toContain('Membre');
    expect(container.querySelectorAll('[data-testid="profile-row"]')).toHaveLength(3);
  });

  it('tapping + then submitting calls adminUsers with a create action and refreshes', async () => {
    h.adminUsers.mockResolvedValue({ ok: true, userId: 'u9' });
    render();
    act(() => (container.querySelector('button[aria-label="Nouvel utilisateur"]') as HTMLButtonElement).click());
    fill('Email', 'zoe@example.fr');
    fill('Mot de passe', 'secret123');
    fill('Nom', 'Zoé');
    await act(async () => button('Créer').click());
    expect(h.adminUsers).toHaveBeenCalledWith({
      action: 'create',
      email: 'zoe@example.fr',
      password: 'secret123',
      displayName: 'Zoé',
      isAdmin: false
    });
    expect(h.refresh).toHaveBeenCalled();
  });

  it('shows the adminUsers error under the form and keeps it open', async () => {
    h.adminUsers.mockResolvedValue({ ok: false, error: 'Email déjà utilisé.' });
    render();
    act(() => (container.querySelector('button[aria-label="Nouvel utilisateur"]') as HTMLButtonElement).click());
    fill('Email', 'zoe@example.fr');
    fill('Mot de passe', 'secret123');
    fill('Nom', 'Zoé');
    await act(async () => button('Créer').click());
    expect(container.textContent).toContain('Email déjà utilisé.');
    expect(button('Créer')).toBeDefined();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('edit sends an update with only the changed name and no empty password', async () => {
    h.adminUsers.mockResolvedValue({ ok: true });
    render();
    const rows = Array.from(container.querySelectorAll('[data-testid="profile-row"]'));
    const bob = rows.find((r) => r.textContent?.includes('Bob'))!;
    act(() => (Array.from(bob.querySelectorAll('button')).find((b) => b.textContent === 'Modifier') as HTMLButtonElement).click());
    fill('Nom', 'Bobby');
    await act(async () => button('Enregistrer').click());
    expect(h.adminUsers).toHaveBeenCalledWith({ action: 'update', userId: 'u2', displayName: 'Bobby', isAdmin: false });
  });

  it('disable button sends setDisabled for the edited user', async () => {
    h.adminUsers.mockResolvedValue({ ok: true });
    render();
    const rows = Array.from(container.querySelectorAll('[data-testid="profile-row"]'));
    const bob = rows.find((r) => r.textContent?.includes('Bob'))!;
    act(() => (Array.from(bob.querySelectorAll('button')).find((b) => b.textContent === 'Modifier') as HTMLButtonElement).click());
    await act(async () => button('Désactiver').click());
    expect(h.adminUsers).toHaveBeenCalledWith({ action: 'setDisabled', userId: 'u2', disabled: true });
  });

  it('editing yourself hides the admin toggle and the disable button', () => {
    render();
    const rows = Array.from(container.querySelectorAll('[data-testid="profile-row"]'));
    const nat = rows.find((r) => r.textContent?.includes('Nat'))!;
    act(() => (Array.from(nat.querySelectorAll('button')).find((b) => b.textContent === 'Modifier') as HTMLButtonElement).click());
    expect(button('Enregistrer')).toBeDefined();
    expect(container.querySelector('[role="switch"][aria-label="Administrateur"]')).toBeNull();
    expect(button('Désactiver')).toBeUndefined();
  });

  it('shows the FK message when a catalog delete is refused', async () => {
    h.dispatchCatalogs.mockResolvedValue('Catalogue utilisé par un événement.');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render();
    await act(async () => button('Supprimer').click());
    expect(window.confirm).toHaveBeenCalledWith('Supprimer "Buvette" et tous ses articles et catégories ?');
    expect(h.dispatchCatalogs).toHaveBeenCalledWith({ type: 'delete', id: 'c1' });
    expect(container.textContent).toContain('Catalogue utilisé par un événement.');
  });

  it('refuses non-admins', () => {
    h.me = member;
    render();
    expect(container.textContent).toContain('Réservé aux administrateurs.');
    expect(container.textContent).not.toContain('Utilisateurs');
  });
});
