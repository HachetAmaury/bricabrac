import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RejectedSale } from '../sync/outbox';

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  lastError: null as string | null,
  strandedSales: [] as RejectedSale[],
  dismissStranded: vi.fn()
}));

vi.mock('../state/AuthContext', () => ({
  useAuth: () => ({
    signIn: h.signIn,
    lastError: h.lastError,
    strandedSales: h.strandedSales,
    dismissStranded: h.dismissStranded
  })
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { LoginView } from './LoginView';

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<LoginView />));
}

function fill(label: string, value: string) {
  const l = Array.from(container.querySelectorAll('label')).find((el) =>
    el.textContent?.includes(label)
  )!;
  const input = l.querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submitButton() {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Se connecter')
  )!;
}

async function click() {
  await act(async () => {
    submitButton().click();
  });
}

beforeEach(() => {
  h.signIn.mockReset();
  h.lastError = null;
  h.strandedSales = [];
  h.dismissStranded.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LoginView', () => {
  it('shows the error returned by signIn and stays on the form', async () => {
    h.signIn.mockResolvedValue('Email ou mot de passe incorrect.');
    render();
    fill('Email', 'a@b.c');
    fill('Mot de passe', 'x');
    await click();
    expect(h.signIn).toHaveBeenCalledWith('a@b.c', 'x');
    expect(container.textContent).toContain('Email ou mot de passe incorrect.');
    expect(container.querySelector('input[type=password]')).not.toBeNull();
  });

  it('disables the button while signIn is pending', async () => {
    let resolve!: (v: string | null) => void;
    h.signIn.mockReturnValue(new Promise<string | null>((r) => (resolve = r)));
    render();
    fill('Email', 'a@b.c');
    fill('Mot de passe', 'x');
    await click();
    expect(submitButton().disabled).toBe(true);
    await act(async () => resolve('Connexion impossible. Vérifiez le réseau.'));
    expect(submitButton().disabled).toBe(false);
  });

  it('shows the initial lastError from the auth context', () => {
    h.lastError = 'Compte désactivé.';
    render();
    expect(container.textContent).toContain('Compte désactivé.');
  });

  it('shows no stranded-sales dialog when nothing is stranded', () => {
    render();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lists the stranded sales over the form; OK dismisses them', () => {
    const ts = new Date(2026, 9, 17, 14, 5).getTime();
    h.strandedSales = [
      {
        sale: { id: 's1', sellerId: 'u1', timestamp: ts, lines: [], total: 750 },
        eventId: 'e1',
        reason: 'disabled',
        opId: 'o1',
        kind: 'insertSale',
        rejectedAt: ts,
        entry: {}
      }
    ];
    render();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Ventes non synchronisées');
    expect(dialog.querySelector('li')!.textContent).toBe('14:05 · 7,50 € · compte désactivé');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toContain('Exporter en JSON');
    const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'OK')!;
    act(() => ok.click());
    expect(h.dismissStranded).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDefined();
  });
});
