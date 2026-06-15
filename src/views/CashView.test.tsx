import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChromeProvider } from '../components/ui/chrome';
import type { SaleEvent } from '../types';

const h = vi.hoisted(() => ({
  event: null as SaleEvent | null,
  dispatchEvents: vi.fn()
}));

vi.mock('../state/AppContext', () => ({
  useApp: () => ({ activeEvent: h.event, dispatchEvents: h.dispatchEvents })
}));

// Tell React this is a proper act() environment so createRoot/act don't warn.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CashView } from './CashView';

const baseEvent: SaleEvent = {
  id: 'e1',
  name: 'Bric-à-brac',
  kind: 'bric-a-brac',
  createdAt: 1,
  enabledItemIds: [],
  sales: [],
  cashFloat: 25000,
  cashCount: { '20000': 1 }
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
        <CashView />
      </ChromeProvider>
    )
  );
}

function floatInput() {
  return container.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
}
function buttonByText(text: string) {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text)
  )!;
}

beforeEach(() => {
  h.dispatchEvents.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CashView — locked event is read-only', () => {
  it('disables the fond-de-caisse input and steppers when locked', () => {
    h.event = { ...baseEvent, locked: true };
    render();

    expect(floatInput().disabled).toBe(true);
    expect(buttonByText('Enregistrer').disabled).toBe(true);
    // Every cash-count stepper (+ / −) must be disabled.
    const plusBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.getAttribute('aria-label')?.startsWith('Plus ')
    );
    expect(plusBtns.length).toBeGreaterThan(0);
    expect(plusBtns.every((b) => b.disabled)).toBe(true);
  });

  it('shows the locked banner when locked', () => {
    h.event = { ...baseEvent, locked: true };
    render();
    expect(container.textContent).toContain('Événement verrouillé');
  });

  it('does not dispatch a cash mutation when the locked "Enregistrer" is clicked', () => {
    h.event = { ...baseEvent, locked: true };
    render();
    act(() => buttonByText('Enregistrer').click());
    expect(h.dispatchEvents).not.toHaveBeenCalled();
  });

  it('keeps the fond-de-caisse input editable when the event is unlocked', () => {
    h.event = { ...baseEvent, locked: false };
    render();
    expect(floatInput().disabled).toBe(false);
    expect(buttonByText('Enregistrer').disabled).toBe(false);
  });
});
