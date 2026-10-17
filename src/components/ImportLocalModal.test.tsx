import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ImportLocalModal } from './ImportLocalModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

const btn = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;

describe('ImportLocalModal', () => {
  it('shows the copy, calls onImport and disables buttons while pending', async () => {
    let resolve!: () => void;
    const onImport = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onIgnore = vi.fn();
    act(() => root.render(<ImportLocalModal open onImport={onImport} onIgnore={onIgnore} />));
    expect(document.body.textContent).toContain('Données locales trouvées');
    expect(document.body.textContent).toContain('Importer les données de ce téléphone dans le compte ?');
    await act(async () => btn('Importer').click());
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(btn('Importer').disabled).toBe(true);
    expect(btn('Ignorer').disabled).toBe(true);
    expect(document.body.textContent).toContain('Import en cours…');
    await act(async () => resolve());
  });

  it('shows an error and re-enables Importer on failure', async () => {
    const onImport = vi.fn().mockRejectedValue(new Error('x'));
    act(() => root.render(<ImportLocalModal open onImport={onImport} onIgnore={vi.fn()} />));
    await act(async () => btn('Importer').click());
    expect(document.body.textContent).toContain('Import impossible. Vérifiez le réseau et réessayez.');
    expect(btn('Importer').disabled).toBe(false);
  });
});
