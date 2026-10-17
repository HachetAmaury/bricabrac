import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  lastError: null as string | null
}));

vi.mock('../state/AuthContext', () => ({
  useAuth: () => ({ signIn: h.signIn, lastError: h.lastError })
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
});
