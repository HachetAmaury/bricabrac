# Flea Market Sales PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable, offline-first PWA that lets the user manage a global item catalog, run multiple events in parallel, take cart-based sales with a change calculator, and view per-event reports — deployed to GitHub Pages at `https://hachetamaury.github.io/bricabrac/`.

**Architecture:** A Vite + React + TypeScript SPA wrapped by `vite-plugin-pwa` (Workbox). State lives in a React Context with three `useReducer`-driven slices (catalog, events, cart); persistence syncs catalog + events to `localStorage` on every change. Four bottom tabs (Events / Sell / Report / Catalog), no client-side router. The build is shipped to GitHub Pages via GitHub Actions.

**Tech Stack:** Vite, React 18, TypeScript, `vite-plugin-pwa`, Vitest, Playwright, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-05-20-flea-market-pwa-design.md](../specs/2026-05-20-flea-market-pwa-design.md)

---

## File Structure

```
public/
  icons/192.png
  icons/512.png
src/
  main.tsx                  React entry
  App.tsx                   Top-level shell: provider + tabs + active view
  types.ts                  Shared types (Item, Event, Sale, …)
  lib/
    money.ts                cents ↔ display string + parsing
    money.test.ts
    uuid.ts                 crypto.randomUUID wrapper
  state/
    persistence.ts          localStorage read/write with try/catch
    persistence.test.ts
    catalogReducer.ts       Item CRUD + archive/restore
    catalogReducer.test.ts
    eventsReducer.ts        Event CRUD + active + toggleItemEnabled + recordSale + undo
    eventsReducer.test.ts
    cartReducer.ts          In-memory cart (add/remove/clear)
    cartReducer.test.ts
    AppContext.tsx          Provider that wires the three reducers + persistence
  components/
    TabBar.tsx              Bottom tab navigation
    Modal.tsx               Reusable centred modal with backdrop
    ItemRow.tsx             Catalog item row (used by Catalog + Sell)
    ValidateModal.tsx       Cart validation + cash/change input
  views/
    EventsView.tsx
    CatalogView.tsx
    SellView.tsx
    ReportView.tsx
  styles/
    global.css              Reset + tokens + base layout
.github/
  workflows/
    deploy.yml              Build + deploy to GitHub Pages
index.html                  Vite entry HTML
vite.config.ts              Vite + PWA config with base: '/bricabrac/'
tsconfig.json
tsconfig.node.json
package.json
.gitignore
playwright.config.ts
e2e/
  smoke.spec.ts
```

Each `*Reducer.ts` is a pure function `(state, action) => state` — no React imports, fully unit-testable. Views are thin: they call dispatchers via context and render. Persistence is a single module that the context wires to reducer dispatch via `useEffect`.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules
dist
.vite
.DS_Store
*.log
coverage
playwright-report
test-results
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "bricabrac",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "e2e"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/bricabrac/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bric-à-brac',
        short_name: 'Bric-à-brac',
        description: 'Flea market sales companion',
        theme_color: '#1f2937',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/bricabrac/',
        scope: '/bricabrac/',
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}']
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: []
  }
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#1f2937" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="apple-touch-icon" href="/bricabrac/icons/192.png" />
    <title>Bric-à-brac</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/styles/global.css`**

```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #111827;
  background: #f9fafb;
}
button { font: inherit; cursor: pointer; }
input { font: inherit; }
:root {
  --color-accent: #2563eb;
  --color-danger: #dc2626;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --tab-height: 64px;
}
```

- [ ] **Step 8: Create `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Create stub `src/App.tsx`**

```tsx
export default function App() {
  return <div style={{ padding: 16 }}>Bric-à-brac — scaffold ready</div>;
}
```

- [ ] **Step 10: Install + verify dev boot**

Run: `npm install && npm run dev`
Expected: dev server starts; opening the browser shows "Bric-à-brac — scaffold ready" and no console errors. Stop the server with `Ctrl+C`.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "chore: scaffold Vite + React + TS + PWA project"
```

---

## Task 2: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Pages deploy workflow"
```

- [ ] **Step 3: Manual one-time setup (not a code step)**

In GitHub → repo Settings → Pages → Source: **GitHub Actions**. Push later will trigger deployment.

---

## Task 3: `money` library (TDD)

**Files:**
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/money.test.ts
import { describe, it, expect } from 'vitest';
import { formatCents, parseAmount, addCents, sumLines } from './money';

describe('formatCents', () => {
  it('formats whole euros', () => {
    expect(formatCents(500)).toBe('5,00 €');
  });
  it('formats sub-euro values', () => {
    expect(formatCents(42)).toBe('0,42 €');
  });
  it('formats large values', () => {
    expect(formatCents(123456)).toBe('1234,56 €');
  });
  it('handles zero', () => {
    expect(formatCents(0)).toBe('0,00 €');
  });
  it('handles negative values', () => {
    expect(formatCents(-150)).toBe('-1,50 €');
  });
});

describe('parseAmount', () => {
  it('parses "5"', () => {
    expect(parseAmount('5')).toBe(500);
  });
  it('parses "5,50"', () => {
    expect(parseAmount('5,50')).toBe(550);
  });
  it('parses "5.50"', () => {
    expect(parseAmount('5.50')).toBe(550);
  });
  it('parses "0,05"', () => {
    expect(parseAmount('0,05')).toBe(5);
  });
  it('returns null for empty', () => {
    expect(parseAmount('')).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(parseAmount('abc')).toBeNull();
  });
  it('rounds extra decimals', () => {
    expect(parseAmount('1,234')).toBe(123);
  });
});

describe('addCents', () => {
  it('adds two values', () => {
    expect(addCents(100, 250)).toBe(350);
  });
});

describe('sumLines', () => {
  it('sums price*qty across lines', () => {
    expect(
      sumLines([
        { price: 500, qty: 2 },
        { price: 150, qty: 3 }
      ])
    ).toBe(1450);
  });
  it('returns 0 for empty array', () => {
    expect(sumLines([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- money`
Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement `money.ts`**

```ts
// src/lib/money.ts
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const remainder = abs % 100;
  const decimals = remainder.toString().padStart(2, '0');
  return `${sign}${euros},${decimals} €`;
}

export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const normalised = trimmed.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  const asFloat = Number(normalised);
  if (!Number.isFinite(asFloat)) return null;
  return Math.round(asFloat * 100);
}

export function addCents(a: number, b: number): number {
  return a + b;
}

export function sumLines(lines: { price: number; qty: number }[]): number {
  return lines.reduce((acc, l) => acc + l.price * l.qty, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- money`
Expected: PASS, all `money` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat(lib): add money helpers with TDD"
```

---

## Task 4: Shared types module

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/types.ts
export type Item = {
  id: string;
  name: string;
  price: number;     // cents
  archived: boolean;
};

export type EventKind = 'tournoi' | 'bric-a-brac' | 'autre';

export type CartLine = { itemId: string; qty: number };

export type SaleLine = {
  itemId: string;
  name: string;
  price: number;   // cents, snapshotted at sale time
  qty: number;
};

export type Sale = {
  id: string;
  timestamp: number;
  lines: SaleLine[];
  total: number;        // cents, frozen at sale time
  cashGiven?: number;   // cents, optional
  change?: number;      // cents, optional
};

export type SaleEvent = {
  id: string;
  name: string;
  kind: EventKind;
  createdAt: number;
  enabledItemIds: string[];
  sales: Sale[];
};
```

Note: the type is called `SaleEvent` (not `Event`) to avoid clashing with the DOM `Event` global.

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add shared domain types"
```

---

## Task 5: `uuid` helper

**Files:**
- Create: `src/lib/uuid.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/uuid.ts
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes; tests run in jsdom where randomUUID exists.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/uuid.ts
git commit -m "feat(lib): add uuid helper"
```

---

## Task 6: `persistence` module (TDD)

**Files:**
- Create: `src/state/persistence.ts`
- Test: `src/state/persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/state/persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadJSON, saveJSON } from './persistence';

beforeEach(() => {
  localStorage.clear();
});

describe('saveJSON / loadJSON', () => {
  it('round-trips a value', () => {
    saveJSON('k', { a: 1 });
    expect(loadJSON('k', { a: 0 })).toEqual({ a: 1 });
  });

  it('returns the fallback when nothing is stored', () => {
    expect(loadJSON('missing', 42)).toBe(42);
  });

  it('returns the fallback when stored JSON is corrupt', () => {
    localStorage.setItem('bad', '{not json');
    expect(loadJSON('bad', 'fallback')).toBe('fallback');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- persistence`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/state/persistence.ts
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or serialisation failure — silently skip; AppContext shows a banner.
  }
}

export const KEYS = {
  catalog: 'catalog:items',
  events: 'events:list',
  activeEventId: 'events:activeId'
} as const;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- persistence`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/persistence.ts src/state/persistence.test.ts
git commit -m "feat(state): add localStorage persistence helpers"
```

---

## Task 7: `catalogReducer` (TDD)

**Files:**
- Create: `src/state/catalogReducer.ts`
- Test: `src/state/catalogReducer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/state/catalogReducer.test.ts
import { describe, it, expect } from 'vitest';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import type { Item } from '../types';

const empty: Item[] = [];

describe('catalogReducer', () => {
  it('adds a new item', () => {
    const next = catalogReducer(empty, { type: 'add', name: 'Mug', price: 500 });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Mug', price: 500, archived: false });
    expect(next[0].id).toBeTruthy();
  });

  it('edits an existing item by id', () => {
    const seeded: Item[] = [{ id: 'a', name: 'Old', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'edit', id: 'a', name: 'New', price: 250 });
    expect(next[0]).toMatchObject({ id: 'a', name: 'New', price: 250, archived: false });
  });

  it('archives an item (soft delete)', () => {
    const seeded: Item[] = [{ id: 'a', name: 'X', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'archive', id: 'a' });
    expect(next[0].archived).toBe(true);
  });

  it('restores an archived item', () => {
    const seeded: Item[] = [{ id: 'a', name: 'X', price: 100, archived: true }];
    const next = catalogReducer(seeded, { type: 'restore', id: 'a' });
    expect(next[0].archived).toBe(false);
  });

  it('replaces the entire list (hydrate)', () => {
    const next = catalogReducer(empty, {
      type: 'hydrate',
      items: [{ id: '1', name: 'A', price: 100, archived: false }]
    });
    expect(next).toHaveLength(1);
  });

  it('returns the same state for unknown ids on edit', () => {
    const seeded: Item[] = [{ id: 'a', name: 'X', price: 100, archived: false }];
    const next = catalogReducer(seeded, { type: 'edit', id: 'b', name: 'Y', price: 200 });
    expect(next).toBe(seeded);
  });

  // Type check (no runtime assertion needed)
  it('accepts the documented action shapes', () => {
    const actions: CatalogAction[] = [
      { type: 'add', name: 'x', price: 1 },
      { type: 'edit', id: 'x', name: 'y', price: 1 },
      { type: 'archive', id: 'x' },
      { type: 'restore', id: 'x' },
      { type: 'hydrate', items: [] }
    ];
    expect(actions.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- catalogReducer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/state/catalogReducer.ts
import { uuid } from '../lib/uuid';
import type { Item } from '../types';

export type CatalogAction =
  | { type: 'add'; name: string; price: number }
  | { type: 'edit'; id: string; name: string; price: number }
  | { type: 'archive'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'hydrate'; items: Item[] };

export function catalogReducer(state: Item[], action: CatalogAction): Item[] {
  switch (action.type) {
    case 'add':
      return [...state, { id: uuid(), name: action.name, price: action.price, archived: false }];
    case 'edit': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], name: action.name, price: action.price };
      return next;
    }
    case 'archive': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], archived: true };
      return next;
    }
    case 'restore': {
      const idx = state.findIndex((i) => i.id === action.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], archived: false };
      return next;
    }
    case 'hydrate':
      return action.items;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- catalogReducer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/catalogReducer.ts src/state/catalogReducer.test.ts
git commit -m "feat(state): catalog reducer with add/edit/archive/restore"
```

---

## Task 8: `eventsReducer` (TDD)

**Files:**
- Create: `src/state/eventsReducer.ts`
- Test: `src/state/eventsReducer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/state/eventsReducer.test.ts
import { describe, it, expect } from 'vitest';
import { eventsReducer } from './eventsReducer';
import type { SaleEvent, Item } from '../types';

const item = (id: string, price = 100): Item => ({ id, name: id, price, archived: false });

describe('eventsReducer', () => {
  it('creates a new event', () => {
    const next = eventsReducer([], {
      type: 'create',
      name: 'Bric-à-brac',
      kind: 'bric-a-brac',
      enabledItemIds: ['a', 'b']
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      name: 'Bric-à-brac',
      kind: 'bric-a-brac',
      enabledItemIds: ['a', 'b'],
      sales: []
    });
    expect(next[0].id).toBeTruthy();
    expect(next[0].createdAt).toBeGreaterThan(0);
  });

  it('renames an event', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'Old', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] }
    ];
    const next = eventsReducer(seeded, { type: 'rename', id: 'e1', name: 'New' });
    expect(next[0].name).toBe('New');
  });

  it('deletes an event', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] },
      { id: 'e2', name: 'B', kind: 'autre', createdAt: 2, enabledItemIds: [], sales: [] }
    ];
    const next = eventsReducer(seeded, { type: 'delete', id: 'e1' });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('e2');
  });

  it('toggles enabled items', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: ['x'], sales: [] }
    ];
    const enabled = eventsReducer(seeded, { type: 'toggleItem', eventId: 'e1', itemId: 'y' });
    expect(enabled[0].enabledItemIds.sort()).toEqual(['x', 'y']);

    const disabled = eventsReducer(enabled, { type: 'toggleItem', eventId: 'e1', itemId: 'x' });
    expect(disabled[0].enabledItemIds).toEqual(['y']);
  });

  it('records a sale (snapshots name + price from catalog)', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: ['a'], sales: [] }
    ];
    const next = eventsReducer(seeded, {
      type: 'recordSale',
      eventId: 'e1',
      cart: [{ itemId: 'a', qty: 2 }],
      catalog: [item('a', 150)],
      cashGiven: 500,
      now: 12345
    });
    expect(next[0].sales).toHaveLength(1);
    const sale = next[0].sales[0];
    expect(sale.timestamp).toBe(12345);
    expect(sale.lines).toEqual([{ itemId: 'a', name: 'a', price: 150, qty: 2 }]);
    expect(sale.total).toBe(300);
    expect(sale.cashGiven).toBe(500);
    expect(sale.change).toBe(200);
  });

  it('records a sale with no cash given (change undefined)', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: ['a'], sales: [] }
    ];
    const next = eventsReducer(seeded, {
      type: 'recordSale',
      eventId: 'e1',
      cart: [{ itemId: 'a', qty: 1 }],
      catalog: [item('a', 200)],
      now: 1
    });
    const sale = next[0].sales[0];
    expect(sale.cashGiven).toBeUndefined();
    expect(sale.change).toBeUndefined();
    expect(sale.total).toBe(200);
  });

  it('undoes the last sale', () => {
    const seeded: SaleEvent[] = [
      {
        id: 'e1',
        name: 'A',
        kind: 'autre',
        createdAt: 1,
        enabledItemIds: ['a'],
        sales: [
          { id: 's1', timestamp: 1, lines: [], total: 0 },
          { id: 's2', timestamp: 2, lines: [], total: 0 }
        ]
      }
    ];
    const next = eventsReducer(seeded, { type: 'undoLast', eventId: 'e1' });
    expect(next[0].sales.map((s) => s.id)).toEqual(['s1']);
  });

  it('undoLast on empty sales list is a no-op', () => {
    const seeded: SaleEvent[] = [
      { id: 'e1', name: 'A', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] }
    ];
    const next = eventsReducer(seeded, { type: 'undoLast', eventId: 'e1' });
    expect(next).toBe(seeded);
  });

  it('hydrates from persisted state', () => {
    const next = eventsReducer([], {
      type: 'hydrate',
      events: [
        { id: 'e1', name: 'X', kind: 'autre', createdAt: 1, enabledItemIds: [], sales: [] }
      ]
    });
    expect(next).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- eventsReducer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/state/eventsReducer.ts
import { uuid } from '../lib/uuid';
import { sumLines } from '../lib/money';
import type { SaleEvent, EventKind, CartLine, Item, SaleLine, Sale } from '../types';

export type EventsAction =
  | { type: 'create'; name: string; kind: EventKind; enabledItemIds: string[] }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'toggleItem'; eventId: string; itemId: string }
  | {
      type: 'recordSale';
      eventId: string;
      cart: CartLine[];
      catalog: Item[];
      cashGiven?: number;
      now: number;
    }
  | { type: 'undoLast'; eventId: string }
  | { type: 'hydrate'; events: SaleEvent[] };

function mapEvent(state: SaleEvent[], id: string, fn: (e: SaleEvent) => SaleEvent): SaleEvent[] {
  const idx = state.findIndex((e) => e.id === id);
  if (idx < 0) return state;
  const next = state.slice();
  next[idx] = fn(next[idx]);
  return next;
}

export function eventsReducer(state: SaleEvent[], action: EventsAction): SaleEvent[] {
  switch (action.type) {
    case 'create':
      return [
        ...state,
        {
          id: uuid(),
          name: action.name,
          kind: action.kind,
          createdAt: Date.now(),
          enabledItemIds: [...action.enabledItemIds],
          sales: []
        }
      ];
    case 'rename':
      return mapEvent(state, action.id, (e) => ({ ...e, name: action.name }));
    case 'delete':
      return state.filter((e) => e.id !== action.id);
    case 'toggleItem':
      return mapEvent(state, action.eventId, (e) => {
        const has = e.enabledItemIds.includes(action.itemId);
        return {
          ...e,
          enabledItemIds: has
            ? e.enabledItemIds.filter((id) => id !== action.itemId)
            : [...e.enabledItemIds, action.itemId]
        };
      });
    case 'recordSale':
      return mapEvent(state, action.eventId, (e) => {
        const lines: SaleLine[] = action.cart
          .map((cl) => {
            const item = action.catalog.find((i) => i.id === cl.itemId);
            if (!item) return null;
            return { itemId: item.id, name: item.name, price: item.price, qty: cl.qty };
          })
          .filter((x): x is SaleLine => x !== null);
        const total = sumLines(lines);
        const sale: Sale = {
          id: uuid(),
          timestamp: action.now,
          lines,
          total,
          cashGiven: action.cashGiven,
          change: action.cashGiven !== undefined ? action.cashGiven - total : undefined
        };
        return { ...e, sales: [...e.sales, sale] };
      });
    case 'undoLast': {
      const idx = state.findIndex((e) => e.id === action.eventId);
      if (idx < 0) return state;
      if (state[idx].sales.length === 0) return state;
      const next = state.slice();
      next[idx] = { ...next[idx], sales: next[idx].sales.slice(0, -1) };
      return next;
    }
    case 'hydrate':
      return action.events;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- eventsReducer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/eventsReducer.ts src/state/eventsReducer.test.ts
git commit -m "feat(state): events reducer with sale + undo"
```

---

## Task 9: `cartReducer` (TDD)

**Files:**
- Create: `src/state/cartReducer.ts`
- Test: `src/state/cartReducer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/state/cartReducer.test.ts
import { describe, it, expect } from 'vitest';
import { cartReducer } from './cartReducer';
import type { CartLine } from '../types';

const empty: CartLine[] = [];

describe('cartReducer', () => {
  it('adds a new line at qty 1', () => {
    expect(cartReducer(empty, { type: 'add', itemId: 'a' })).toEqual([{ itemId: 'a', qty: 1 }]);
  });

  it('increments existing line', () => {
    expect(cartReducer([{ itemId: 'a', qty: 1 }], { type: 'add', itemId: 'a' })).toEqual([
      { itemId: 'a', qty: 2 }
    ]);
  });

  it('decrements existing line', () => {
    expect(cartReducer([{ itemId: 'a', qty: 2 }], { type: 'remove', itemId: 'a' })).toEqual([
      { itemId: 'a', qty: 1 }
    ]);
  });

  it('removes line when qty reaches zero', () => {
    expect(cartReducer([{ itemId: 'a', qty: 1 }], { type: 'remove', itemId: 'a' })).toEqual([]);
  });

  it('remove on missing item is a no-op', () => {
    const state: CartLine[] = [{ itemId: 'a', qty: 1 }];
    expect(cartReducer(state, { type: 'remove', itemId: 'b' })).toBe(state);
  });

  it('clear returns an empty cart', () => {
    expect(cartReducer([{ itemId: 'a', qty: 1 }], { type: 'clear' })).toEqual([]);
  });

  it('dropItem removes any matching line regardless of qty', () => {
    expect(
      cartReducer(
        [
          { itemId: 'a', qty: 5 },
          { itemId: 'b', qty: 2 }
        ],
        { type: 'dropItem', itemId: 'a' }
      )
    ).toEqual([{ itemId: 'b', qty: 2 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- cartReducer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/state/cartReducer.ts
import type { CartLine } from '../types';

export type CartAction =
  | { type: 'add'; itemId: string }
  | { type: 'remove'; itemId: string }
  | { type: 'dropItem'; itemId: string }
  | { type: 'clear' };

export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const idx = state.findIndex((l) => l.itemId === action.itemId);
      if (idx < 0) return [...state, { itemId: action.itemId, qty: 1 }];
      const next = state.slice();
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    }
    case 'remove': {
      const idx = state.findIndex((l) => l.itemId === action.itemId);
      if (idx < 0) return state;
      const current = state[idx];
      if (current.qty <= 1) return state.filter((_, i) => i !== idx);
      const next = state.slice();
      next[idx] = { ...current, qty: current.qty - 1 };
      return next;
    }
    case 'dropItem':
      return state.filter((l) => l.itemId !== action.itemId);
    case 'clear':
      return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- cartReducer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/cartReducer.ts src/state/cartReducer.test.ts
git commit -m "feat(state): cart reducer with add/remove/clear"
```

---

## Task 10: `AppContext` provider

**Files:**
- Create: `src/state/AppContext.tsx`

- [ ] **Step 1: Implement the provider**

```tsx
// src/state/AppContext.tsx
import { createContext, useContext, useEffect, useReducer, useMemo, type ReactNode } from 'react';
import type { Item, SaleEvent, CartLine } from '../types';
import { catalogReducer, type CatalogAction } from './catalogReducer';
import { eventsReducer, type EventsAction } from './eventsReducer';
import { cartReducer, type CartAction } from './cartReducer';
import { loadJSON, saveJSON, KEYS } from './persistence';

type AppState = {
  catalog: Item[];
  events: SaleEvent[];
  activeEventId: string | null;
  cart: CartLine[];
};

type AppContextValue = AppState & {
  activeEvent: SaleEvent | null;
  setActiveEvent: (id: string | null) => void;
  dispatchCatalog: (a: CatalogAction) => void;
  dispatchEvents: (a: EventsAction) => void;
  dispatchCart: (a: CartAction) => void;
};

const AppCtx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [catalog, dispatchCatalog] = useReducer(
    catalogReducer,
    undefined,
    () => loadJSON<Item[]>(KEYS.catalog, [])
  );
  const [events, dispatchEvents] = useReducer(
    eventsReducer,
    undefined,
    () => loadJSON<SaleEvent[]>(KEYS.events, [])
  );
  const [activeEventId, _setActiveEventId] = useReducer(
    (_: string | null, next: string | null) => next,
    undefined,
    () => loadJSON<string | null>(KEYS.activeEventId, null)
  );
  const [cart, dispatchCart] = useReducer(cartReducer, []);

  useEffect(() => { saveJSON(KEYS.catalog, catalog); }, [catalog]);
  useEffect(() => { saveJSON(KEYS.events, events); }, [events]);
  useEffect(() => { saveJSON(KEYS.activeEventId, activeEventId); }, [activeEventId]);

  // Clean activeEventId if the referenced event no longer exists.
  useEffect(() => {
    if (activeEventId && !events.some((e) => e.id === activeEventId)) {
      _setActiveEventId(null);
    }
  }, [events, activeEventId]);

  // Clear cart when switching events.
  useEffect(() => {
    dispatchCart({ type: 'clear' });
  }, [activeEventId]);

  // If a cart item gets archived in the catalog, drop it from the cart.
  useEffect(() => {
    const archived = new Set(catalog.filter((i) => i.archived).map((i) => i.id));
    cart.forEach((line) => {
      if (archived.has(line.itemId)) {
        dispatchCart({ type: 'dropItem', itemId: line.itemId });
      }
    });
  }, [catalog, cart]);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [events, activeEventId]
  );

  const value: AppContextValue = {
    catalog,
    events,
    activeEventId,
    cart,
    activeEvent,
    setActiveEvent: _setActiveEventId,
    dispatchCatalog,
    dispatchEvents,
    dispatchCart
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npm run build`
Expected: build succeeds; `dist/` is produced. (We still render the stub `App`; that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/state/AppContext.tsx
git commit -m "feat(state): wire AppContext with persistence + active event"
```

---

## Task 11: TabBar + App shell

**Files:**
- Create: `src/components/TabBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the `TabBar` component**

```tsx
// src/components/TabBar.tsx
export type TabId = 'events' | 'sell' | 'report' | 'catalog';

const tabs: { id: TabId; label: string }[] = [
  { id: 'events', label: 'Événements' },
  { id: 'sell', label: 'Vente' },
  { id: 'report', label: 'Rapport' },
  { id: 'catalog', label: 'Catalogue' }
];

export function TabBar({
  active,
  onSelect
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'var(--tab-height)',
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        background: '#ffffff',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: active === t.id ? 'var(--color-accent)' : 'var(--color-muted)',
            fontWeight: active === t.id ? 600 : 400
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite `App.tsx` with provider + tab state**

```tsx
// src/App.tsx
import { useState } from 'react';
import { AppProvider } from './state/AppContext';
import { TabBar, type TabId } from './components/TabBar';

function Placeholder({ label }: { label: string }) {
  return <div style={{ padding: 16 }}>{label}</div>;
}

function Shell() {
  const [tab, setTab] = useState<TabId>('events');
  return (
    <div style={{ minHeight: '100%', paddingBottom: 'calc(var(--tab-height) + 16px)' }}>
      {tab === 'events' && <Placeholder label="Events" />}
      {tab === 'sell' && <Placeholder label="Sell" />}
      {tab === 'report' && <Placeholder label="Report" />}
      {tab === 'catalog' && <Placeholder label="Catalog" />}
      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
```

- [ ] **Step 3: Boot dev server and verify tabs switch**

Run: `npm run dev`
Expected: clicking each tab swaps the placeholder text; no console errors. Stop with `Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.tsx src/App.tsx
git commit -m "feat(ui): app shell with bottom tab bar"
```

---

## Task 12: Reusable `Modal` component

**Files:**
- Create: `src/components/Modal.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/Modal.tsx
import { type ReactNode, useEffect } from 'react';

export function Modal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: 16,
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Modal.tsx
git commit -m "feat(ui): reusable Modal component"
```

---

## Task 13: `CatalogView`

**Files:**
- Create: `src/views/CatalogView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement `CatalogView`**

```tsx
// src/views/CatalogView.tsx
import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { formatCents, parseAmount } from '../lib/money';
import type { Item } from '../types';

type Editing = { mode: 'create' } | { mode: 'edit'; item: Item } | null;

export function CatalogView() {
  const { catalog, dispatchCatalog, activeEvent, dispatchEvents } = useApp();
  const [editing, setEditing] = useState<Editing>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = catalog.filter((i) => !i.archived);
  const archived = catalog.filter((i) => i.archived);

  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Catalogue</h1>
        <button
          onClick={() => setEditing({ mode: 'create' })}
          style={{
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px'
          }}
        >
          + Nouvel article
        </button>
      </header>

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Actifs</h2>
      {active.length === 0 && <p style={{ color: 'var(--color-muted)' }}>Aucun article.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {active.map((item) => {
          const enabled = activeEvent?.enabledItemIds.includes(item.id) ?? false;
          return (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>{formatCents(item.price)}</div>
              </div>
              {activeEvent && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() =>
                      dispatchEvents({ type: 'toggleItem', eventId: activeEvent.id, itemId: item.id })
                    }
                  />
                  Actif
                </label>
              )}
              <button onClick={() => setEditing({ mode: 'edit', item })}>Modifier</button>
              <button onClick={() => dispatchCatalog({ type: 'archive', id: item.id })}>Archiver</button>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => setShowArchived((v) => !v)}
        style={{ marginTop: 16, background: 'transparent', border: 'none', color: 'var(--color-muted)' }}
      >
        {showArchived ? '▾' : '▸'} Archivés ({archived.length})
      </button>
      {showArchived && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {archived.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border)',
                opacity: 0.6
              }}
            >
              <div style={{ flex: 1 }}>
                <div>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>{formatCents(item.price)}</div>
              </div>
              <button onClick={() => dispatchCatalog({ type: 'restore', id: item.id })}>Restaurer</button>
            </li>
          ))}
        </ul>
      )}

      <EditModal editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditModal({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  if (!editing) return null;
  // Force a fresh component instance per editing target by keying on the parent.
  return <EditModalInner key={editing.mode === 'edit' ? editing.item.id : 'create'} editing={editing} onClose={onClose} />;
}

function EditModalInner({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const { dispatchCatalog } = useApp();
  const initialName = editing.mode === 'edit' ? editing.item.name : '';
  const initialPrice = editing.mode === 'edit' ? (editing.item.price / 100).toString().replace('.', ',') : '';
  const [name, setName] = useState(initialName);
  const [priceText, setPriceText] = useState(initialPrice);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return setError('Le nom est obligatoire.');
    const cents = parseAmount(priceText);
    if (cents === null || cents < 0) return setError('Le prix est invalide.');
    if (editing.mode === 'create') {
      dispatchCatalog({ type: 'add', name: trimmed, price: cents });
    } else {
      dispatchCatalog({ type: 'edit', id: editing.item.id, name: trimmed, price: cents });
    }
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title={editing.mode === 'create' ? 'Nouvel article' : 'Modifier'}>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Nom
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Prix (€)
        <input
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          placeholder="0,00"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      {error && <p style={{ color: 'var(--color-danger)', margin: '4px 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose}>Annuler</button>
        <button
          onClick={onSubmit}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6 }}
        >
          Valider
        </button>
      </div>
    </Modal>
  );
}

```

- [ ] **Step 2: Mount `CatalogView` in `App.tsx`**

Replace the catalog placeholder line:

```tsx
{tab === 'catalog' && <CatalogView />}
```

Add the import at the top of `App.tsx`:

```tsx
import { CatalogView } from './views/CatalogView';
```

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`
Expected: open the Catalog tab → create an item (e.g., "Mug" / "5,00") → it appears in the Actifs list → edit it → archive it → toggle Archivés → restore.

- [ ] **Step 4: Commit**

```bash
git add src/views/CatalogView.tsx src/App.tsx
git commit -m "feat(ui): catalog view with add/edit/archive/restore"
```

---

## Task 14: `EventsView`

**Files:**
- Create: `src/views/EventsView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/views/EventsView.tsx
import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Modal } from '../components/Modal';
import { formatCents } from '../lib/money';
import type { EventKind, SaleEvent } from '../types';

const KIND_LABELS: Record<EventKind, string> = {
  tournoi: 'Tournoi',
  'bric-a-brac': 'Bric-à-brac',
  autre: 'Autre'
};

export function EventsView() {
  const { events, activeEventId, setActiveEvent, dispatchEvents, activeEvent } = useApp();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SaleEvent | null>(null);

  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Événements</h1>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px'
          }}
        >
          + Nouvel événement
        </button>
      </header>

      {events.length === 0 && (
        <p style={{ color: 'var(--color-muted)', marginTop: 24 }}>
          Aucun événement. Créez-en un pour commencer.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {events.map((e) => {
          const total = e.sales.reduce((acc, s) => acc + s.total, 0);
          const isActive = e.id === activeEventId;
          return (
            <li
              key={e.id}
              style={{
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
                background: isActive ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                border: isActive ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <button
                onClick={() => setActiveEvent(e.id)}
                style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none' }}
              >
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                  {KIND_LABELS[e.kind]} · {e.sales.length} vente(s) · {formatCents(total)}
                </div>
              </button>
              <button onClick={() => setRenaming(e)}>Renommer</button>
              <button
                onClick={() => {
                  if (confirm(`Supprimer "${e.name}" et toutes ses ventes ?`)) {
                    dispatchEvents({ type: 'delete', id: e.id });
                  }
                }}
                style={{ color: 'var(--color-danger)' }}
              >
                Suppr.
              </button>
            </li>
          );
        })}
      </ul>

      <CreateModal
        open={creating}
        onClose={() => setCreating(false)}
        copyFrom={activeEvent}
        onCreate={(name, kind, copy) => {
          dispatchEvents({
            type: 'create',
            name,
            kind,
            enabledItemIds: copy && activeEvent ? [...activeEvent.enabledItemIds] : []
          });
          setCreating(false);
        }}
      />
      <RenameModal
        target={renaming}
        onClose={() => setRenaming(null)}
        onRename={(name) => {
          if (renaming) dispatchEvents({ type: 'rename', id: renaming.id, name });
          setRenaming(null);
        }}
      />
    </div>
  );
}

function CreateModal({
  open,
  onClose,
  copyFrom,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  copyFrom: SaleEvent | null;
  onCreate: (name: string, kind: EventKind, copy: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<EventKind>('bric-a-brac');
  const [copy, setCopy] = useState(true);

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Nouvel événement">
      <label style={{ display: 'block', marginBottom: 8 }}>
        Nom
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Bric-à-brac 14 juin"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EventKind)}
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        >
          <option value="bric-a-brac">Bric-à-brac</option>
          <option value="tournoi">Tournoi</option>
          <option value="autre">Autre</option>
        </select>
      </label>
      {copyFrom && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          Copier les articles activés de "{copyFrom.name}"
        </label>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose}>Annuler</button>
        <button
          onClick={() => name.trim() && onCreate(name.trim(), kind, copy)}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6 }}
        >
          Créer
        </button>
      </div>
    </Modal>
  );
}

function RenameModal({
  target,
  onClose,
  onRename
}: {
  target: SaleEvent | null;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(target?.name ?? '');
  if (!target) return null;
  return (
    <Modal open={true} onClose={onClose} title="Renommer">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: '100%', padding: 8 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onClose}>Annuler</button>
        <button
          onClick={() => name.trim() && onRename(name.trim())}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6 }}
        >
          Valider
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`**

Replace the events placeholder line and add import:

```tsx
import { EventsView } from './views/EventsView';
// ...
{tab === 'events' && <EventsView />}
```

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`
Expected: open Events → create "Bric-à-brac 14 juin" → it becomes active → rename → delete with confirmation.

- [ ] **Step 4: Commit**

```bash
git add src/views/EventsView.tsx src/App.tsx
git commit -m "feat(ui): events view with create/rename/delete/active"
```

---

## Task 15: `SellView` + `ValidateModal`

**Files:**
- Create: `src/components/ValidateModal.tsx`
- Create: `src/views/SellView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `ValidateModal`**

```tsx
// src/components/ValidateModal.tsx
import { useState } from 'react';
import { Modal } from './Modal';
import { formatCents, parseAmount } from '../lib/money';

export function ValidateModal({
  open,
  total,
  onCancel,
  onConfirm
}: {
  open: boolean;
  total: number;
  onCancel: () => void;
  onConfirm: (cashGiven?: number) => void;
}) {
  const [cashText, setCashText] = useState('');
  const parsed = parseAmount(cashText);
  const change = parsed !== null ? parsed - total : null;

  return (
    <Modal open={open} onClose={onCancel} title="Encaisser">
      <p style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 16px' }}>
        Total : {formatCents(total)}
      </p>
      <label style={{ display: 'block' }}>
        Montant reçu (optionnel)
        <input
          inputMode="decimal"
          value={cashText}
          onChange={(e) => setCashText(e.target.value)}
          placeholder="0,00"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
          autoFocus
        />
      </label>
      {change !== null && (
        <p style={{ marginTop: 8 }}>
          {change >= 0 ? 'À rendre : ' : 'Reste dû : '}
          <strong>{formatCents(Math.abs(change))}</strong>
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onCancel}>Annuler</button>
        <button
          onClick={() => onConfirm(parsed ?? undefined)}
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6 }}
        >
          Confirmer
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Create `SellView`**

```tsx
// src/views/SellView.tsx
import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { ValidateModal } from '../components/ValidateModal';
import { formatCents, sumLines } from '../lib/money';

export function SellView() {
  const { catalog, activeEvent, cart, dispatchCart, dispatchEvents } = useApp();
  const [showValidate, setShowValidate] = useState(false);

  // Hooks must run unconditionally before any early return.
  const enabledItems = useMemo(
    () =>
      activeEvent
        ? catalog.filter((i) => !i.archived && activeEvent.enabledItemIds.includes(i.id))
        : [],
    [catalog, activeEvent]
  );

  if (!activeEvent) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Vente</h1>
        <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>
          Aucun événement actif. Créez ou sélectionnez un événement pour commencer.
        </p>
      </div>
    );
  }

  const lineSubtotals = cart.map((c) => {
    const item = catalog.find((i) => i.id === c.itemId);
    return { price: item?.price ?? 0, qty: c.qty };
  });
  const total = sumLines(lineSubtotals);
  const dayTotal = activeEvent.sales.reduce((acc, s) => acc + s.total, 0);

  return (
    <div style={{ padding: 16, paddingBottom: 'calc(var(--tab-height) + 96px)' }}>
      <header>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{activeEvent.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Vente</h1>
          <span style={{ color: 'var(--color-muted)' }}>Journée : {formatCents(dayTotal)}</span>
        </div>
      </header>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {enabledItems.length === 0 && (
          <li style={{ color: 'var(--color-muted)' }}>
            Aucun article activé pour cet événement. Activez-en depuis le Catalogue.
          </li>
        )}
        {enabledItems.map((item) => {
          const line = cart.find((l) => l.itemId === item.id);
          const qty = line?.qty ?? 0;
          return (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--color-border)'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>{formatCents(item.price)}</div>
              </div>
              {qty > 0 && (
                <button
                  onClick={() => dispatchCart({ type: 'remove', itemId: item.id })}
                  style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid var(--color-border)' }}
                >
                  −
                </button>
              )}
              {qty > 0 && <span style={{ minWidth: 24, textAlign: 'center' }}>{qty}</span>}
              <button
                onClick={() => dispatchCart({ type: 'add', itemId: item.id })}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 'none',
                  background: 'var(--color-accent)',
                  color: 'white'
                }}
              >
                +
              </button>
            </li>
          );
        })}
      </ul>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'var(--tab-height)',
          padding: 12,
          background: '#ffffff',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>{formatCents(total)}</div>
        <button
          disabled={cart.length === 0}
          onClick={() => setShowValidate(true)}
          style={{
            background: cart.length === 0 ? 'var(--color-muted)' : 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 600
          }}
        >
          Valider
        </button>
      </footer>

      <ValidateModal
        open={showValidate}
        total={total}
        onCancel={() => setShowValidate(false)}
        onConfirm={(cashGiven) => {
          dispatchEvents({
            type: 'recordSale',
            eventId: activeEvent.id,
            cart,
            catalog,
            cashGiven,
            now: Date.now()
          });
          dispatchCart({ type: 'clear' });
          setShowValidate(false);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Mount in `App.tsx`**

```tsx
import { SellView } from './views/SellView';
// ...
{tab === 'sell' && <SellView />}
```

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`
Expected: with an active event and at least one enabled item, `+`/`−` adjust the cart, total updates live, Validate opens the modal, entering "10" with a 5,00 total shows "À rendre : 5,00 €", Confirm clears the cart and the event's "Journée" total grows.

- [ ] **Step 5: Commit**

```bash
git add src/views/SellView.tsx src/components/ValidateModal.tsx src/App.tsx
git commit -m "feat(ui): sell view + validate modal with change calc"
```

---

## Task 16: `ReportView`

**Files:**
- Create: `src/views/ReportView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/views/ReportView.tsx
import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { formatCents } from '../lib/money';

export function ReportView() {
  const { activeEvent, dispatchEvents } = useApp();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Hooks must run unconditionally before any early return.
  const perItem = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; subtotal: number }>();
    if (!activeEvent) return [];
    for (const sale of activeEvent.sales) {
      for (const line of sale.lines) {
        const existing = map.get(line.itemId) ?? { name: line.name, qty: 0, subtotal: 0 };
        existing.qty += line.qty;
        existing.subtotal += line.price * line.qty;
        existing.name = line.name; // keep last seen name
        map.set(line.itemId, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal);
  }, [activeEvent]);

  if (!activeEvent) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Rapport</h1>
        <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>Aucun événement actif.</p>
      </div>
    );
  }

  const total = activeEvent.sales.reduce((acc, s) => acc + s.total, 0);

  const sortedSales = [...activeEvent.sales].sort((a, b) => b.timestamp - a.timestamp);
  const lastSaleId = sortedSales[0]?.id;

  return (
    <div style={{ padding: 16 }}>
      <header>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{activeEvent.name}</div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Rapport</h1>
      </header>

      <section
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(37, 99, 235, 0.08)',
          border: '1px solid rgba(37, 99, 235, 0.2)'
        }}
      >
        <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Total</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{formatCents(total)}</div>
        <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>
          {activeEvent.sales.length} vente(s)
        </div>
      </section>

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Par article</h2>
      {perItem.length === 0 && <p style={{ color: 'var(--color-muted)' }}>Aucune vente.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {perItem.map((row) => (
          <li
            key={row.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)'
            }}
          >
            <div style={{ flex: 1 }}>{row.name}</div>
            <div style={{ color: 'var(--color-muted)' }}>× {row.qty}</div>
            <div style={{ fontWeight: 500 }}>{formatCents(row.subtotal)}</div>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 14, color: 'var(--color-muted)', marginTop: 24 }}>Transactions</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sortedSales.map((sale) => {
          const time = new Date(sale.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const isExpanded = expanded[sale.id];
          return (
            <li key={sale.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <button
                onClick={() => setExpanded((m) => ({ ...m, [sale.id]: !m[sale.id] }))}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {time} · {formatCents(sale.total)} · {sale.lines.reduce((a, l) => a + l.qty, 0)} article(s)
                </span>
                {sale.id === lastSaleId && (
                  <span
                    role="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (confirm('Annuler la dernière vente ?')) {
                        dispatchEvents({ type: 'undoLast', eventId: activeEvent.id });
                      }
                    }}
                    style={{ color: 'var(--color-danger)', fontWeight: 500 }}
                  >
                    Annuler
                  </span>
                )}
              </button>
              {isExpanded && (
                <div style={{ paddingLeft: 8, marginTop: 4, fontSize: 14 }}>
                  {sale.lines.map((l) => (
                    <div key={l.itemId} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ flex: 1 }}>{l.name}</span>
                      <span style={{ color: 'var(--color-muted)' }}>× {l.qty}</span>
                      <span>{formatCents(l.price * l.qty)}</span>
                    </div>
                  ))}
                  {sale.cashGiven !== undefined && (
                    <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>
                      Reçu : {formatCents(sale.cashGiven)} · Rendu : {formatCents(sale.change ?? 0)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `App.tsx`**

```tsx
import { ReportView } from './views/ReportView';
// ...
{tab === 'report' && <ReportView />}
```

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`
Expected: with at least one recorded sale, the report shows the grand total, per-item table sorted by subtotal desc, transactions list with expand on tap, undo button on the most recent sale.

- [ ] **Step 4: Commit**

```bash
git add src/views/ReportView.tsx src/App.tsx
git commit -m "feat(ui): report view with per-item, transactions, undo"
```

---

## Task 17: PWA icons

**Files:**
- Create: `public/icons/192.png`
- Create: `public/icons/512.png`

- [ ] **Step 1: Generate placeholder icons**

Any simple square PNGs work for now. One quick option using ImageMagick if installed:

Run:
```bash
mkdir -p public/icons
magick -size 192x192 xc:'#1f2937' -fill white -gravity center -pointsize 96 -annotate +0+0 'BB' public/icons/192.png
magick -size 512x512 xc:'#1f2937' -fill white -gravity center -pointsize 240 -annotate +0+0 'BB' public/icons/512.png
```

If ImageMagick is not available, drop any 192×192 and 512×512 PNGs into `public/icons/`. The build only requires the files to exist.

- [ ] **Step 2: Verify build embeds them**

Run: `npm run build`
Expected: build succeeds; `dist/icons/192.png` and `dist/icons/512.png` are present; `dist/manifest.webmanifest` references them.

- [ ] **Step 3: Commit**

```bash
git add public/icons/192.png public/icons/512.png
git commit -m "chore(pwa): add app icons (placeholders)"
```

---

## Task 18: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`

- [ ] **Step 1: Create the Playwright config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173/bricabrac/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  use: {
    baseURL: 'http://localhost:5173/bricabrac/'
  }
});
```

- [ ] **Step 2: Write the smoke test**

```ts
// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test('happy path: create item, create event, sell, validate, report', async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(() => localStorage.clear());

  await page.goto('/');

  // Catalog tab → create item "Mug" at 5,00
  await page.getByRole('button', { name: 'Catalogue' }).click();
  await page.getByRole('button', { name: '+ Nouvel article' }).click();
  await page.getByLabel('Nom').fill('Mug');
  await page.getByLabel('Prix (€)').fill('5,00');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Mug')).toBeVisible();

  // Events tab → create event
  await page.getByRole('button', { name: 'Événements' }).click();
  await page.getByRole('button', { name: '+ Nouvel événement' }).click();
  await page.getByLabel('Nom').fill('Bric-à-brac test');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByText('Bric-à-brac test')).toBeVisible();

  // Catalog tab → enable Mug in active event
  await page.getByRole('button', { name: 'Catalogue' }).click();
  await page.getByLabel('Actif').check();

  // Sell tab → add two Mugs, validate with 20,00 cash
  await page.getByRole('button', { name: 'Vente' }).click();
  await page.getByRole('button', { name: '+' }).first().click();
  await page.getByRole('button', { name: '+' }).first().click();
  await expect(page.getByText('10,00 €')).toBeVisible();
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.getByLabel('Montant reçu (optionnel)').fill('20,00');
  await expect(page.getByText('À rendre :')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  // Report tab → verify total
  await page.getByRole('button', { name: 'Rapport' }).click();
  await expect(page.getByText('10,00 €').first()).toBeVisible();
  await expect(page.getByText('1 vente(s)')).toBeVisible();
});
```

- [ ] **Step 3: Install Playwright browsers**

Run: `npx playwright install --with-deps chromium`
Expected: chromium downloaded.

- [ ] **Step 4: Run the e2e test**

Run: `npm run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/smoke.spec.ts
git commit -m "test(e2e): playwright smoke covering catalog → event → sale → report"
```

---

## Task 19: Build + deploy verification

**Files:** none

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build succeeds; `dist/sw.js`, `dist/manifest.webmanifest`, `dist/icons/*` all present.

- [ ] **Step 2: Preview locally**

Run: `npm run preview`
Open `http://localhost:4173/bricabrac/`.
Expected: app loads, all four tabs work; in DevTools → Application → Service Workers, the SW is registered with scope `/bricabrac/`. Stop with `Ctrl+C`.

- [ ] **Step 3: Push and let Actions deploy**

```bash
git push
```

Expected: the workflow at `.github/workflows/deploy.yml` runs and succeeds. The Pages URL prints in the job output, and `https://hachetamaury.github.io/bricabrac/` serves the app.

- [ ] **Step 4: Manual offline check on the deployed site**

Open the deployed URL on a mobile device, install to home screen, then enable airplane mode and relaunch.
Expected: app loads from the SW cache and is fully usable offline.

- [ ] **Step 5 (optional): Tag the first deploy**

```bash
git tag v0.1.0
git push --tags
```

---

## Self-Review Notes (kept inline for the executing engineer)

- **Spec coverage:**
  - Catalog with add/edit/archive/restore → Task 7 (reducer) + Task 13 (view).
  - Events with create/rename/delete/active → Task 8 (reducer) + Task 14 (view).
  - Per-event enabled item subset → Task 8 (`toggleItem`) + Task 13 (checkbox) + Task 15 (filter).
  - Cart with +/−/total → Task 9 (reducer) + Task 15 (view).
  - Validate flow with change calc → Task 15 (`ValidateModal`).
  - Sale snapshots name + price → Task 8 (`recordSale` builds `SaleLine` from catalog).
  - Per-event report (per-item + transactions + undo) → Task 8 (`undoLast`) + Task 16 (view).
  - Offline PWA → Task 1 (Vite + plugin-pwa) + Task 17 (icons) + Task 19 (verify).
  - GitHub Pages deploy → Task 2 + Task 19.
  - Tests: Vitest units in Tasks 3, 6, 7, 8, 9; Playwright smoke in Task 18.

- **No placeholders:** every code-bearing step contains the actual code; the only placeholder asset is the icon PNGs in Task 17, which is intentional and called out.

- **Type consistency:**
  - Event domain type is `SaleEvent` everywhere (avoiding DOM `Event` clash).
  - Reducer action types are named `CatalogAction`, `EventsAction`, `CartAction`, exported alongside their reducers.
  - Cart actions: `add`, `remove`, `dropItem`, `clear` — used identically across `cartReducer`, `AppContext`, and views.
  - `recordSale` builds `SaleLine` with the same shape declared in `types.ts`.
