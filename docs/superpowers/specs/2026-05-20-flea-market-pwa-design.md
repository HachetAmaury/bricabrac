# Flea Market Sales PWA — Design

**Date:** 2026-05-20
**Status:** Approved (design phase)

## Purpose

A simple, installable, offline-first Progressive Web App used at a flea market stall to:

1. Build a cart from a fixed list of items, displaying a running total.
2. Confirm sales with an optional change calculator (cash given − total).
3. Track every sale across the day and produce an end-of-day report.
4. Support recovery from mistakes by undoing the last sale.

The app runs entirely on a phone or tablet with no network connectivity after first install. No backend, no accounts, no sync.

## Scope

**In scope:**
- Cart with `+` / `−` controls per item, sticky total, validate-to-confirm flow.
- Cash-given input and change calculation at sale validation.
- Persistent per-day sales log with per-item totals, transaction history, and undo of last sale.
- Manual "Start new day" reset that archives the current day.
- Fully offline operation after first load (precached app shell + items list).

**Out of scope (deferred):**
- Editing item prices (would corrupt historical sale totals; explicitly excluded).
- Adding new items at runtime (planned for a later iteration).
- Stock / inventory tracking.
- Payment method split (cash vs. card).
- Cloud sync, multi-device, accounts, exports beyond JSON.

## Tech Stack

- **Build:** Vite + React + TypeScript.
- **PWA:** `vite-plugin-pwa` with Workbox (`registerType: 'autoUpdate'`).
- **State:** React Context + `useReducer`. No external state library.
- **Persistence:** `localStorage` (small payloads, synchronous API, simpler than IndexedDB).
- **Tests:** Vitest for unit tests, Playwright for one smoke flow.
- **Manifest:** `manifest.webmanifest` with 192/512 icons, `display: standalone`, theme color. iOS meta tags for add-to-home.

## Data Model

All money is stored as **integer cents** to avoid floating-point bugs. Display formats to `XX.XX`.

```ts
// public/items.json — static, shipped with the app
type Item = {
  id: string;     // stable slug, e.g. "mug-red"
  name: string;
  price: number;  // cents
};

// In-memory cart (not persisted; cleared on validate)
type CartLine = { itemId: string; qty: number };

type Sale = {
  id: string;          // uuid
  timestamp: number;   // ms epoch
  lines: CartLine[];   // snapshot taken at sale time
  total: number;       // cents, frozen at sale time
  cashGiven?: number;  // cents, optional
  change?: number;     // cents, optional
};

type Day = {
  id: string;       // e.g. "2026-05-20-1"
  startedAt: number;
  sales: Sale[];
};
```

**Storage keys (`localStorage`):**
- `day:current` — the active `Day`.
- `days:archive` — array of completed `Day` objects, pushed when "Start new day" runs.

Sales store a `lines` snapshot rather than referencing the live items list so that future edits to `items.json` cannot retroactively change historical totals.

## Architecture

- Single React app, three top-level views, switched by a bottom tab bar: **Sell**, **Report**, **Settings**.
- One Context provider wraps the app and exposes:
  - `items` (loaded once from `items.json`)
  - `cart` state and dispatch (`add`, `remove`, `clear`)
  - `day` state and dispatch (`recordSale`, `undoLastSale`, `startNewDay`)
- A small `money.ts` module handles cents → display formatting and parsing.
- A persistence middleware writes `day` to `localStorage` on every change.

## Views

### Sell view (main screen)

Top → bottom:

1. **Header:** app title, current day grand total badge.
2. **Item list (scrollable):** one row per item.
   - Left: name and price.
   - Right: `[−]  qty  [+]`. The `qty` indicator and `[−]` are hidden when qty is 0.
3. **Sticky footer:**
   - Big total in the form `€42.50`.
   - `[Validate]` button, disabled while cart is empty.

**Validate flow:**

1. Tap `[Validate]` → opens a modal.
2. Modal shows the total and a numeric input "Cash given".
3. Live `change = cashGiven − total` displayed under the input (negative ⇒ still owed; positive ⇒ change owed to customer).
4. Buttons: `[Confirm sale]` / `[Cancel]`.
5. Confirm pushes the `Sale` into `day:current`, clears the cart, closes the modal.
6. Cash input is optional — confirming with it empty stores `cashGiven` and `change` as `undefined`.

### Report view

Three stacked blocks:

1. **Summary card:** grand total + total number of sales.
2. **Per-item table:** rows `name | qty sold | subtotal`, sorted by subtotal descending. Empty state shown if no sales yet.
3. **Transactions list:** one row per sale, `time · €total · N items`. Tapping a row expands it to show the line breakdown and (if present) cash / change. The most recent sale exposes an `[Undo]` button that removes it from the log and restores those lines to the cart.

### Settings view

- Current day id and started date.
- `[Start new day]` button → confirmation dialog → archive `day:current` into `days:archive`, then create a fresh `day:current`.
- `[Export sales (JSON)]` — downloads `days:archive + day:current` as a JSON file (paranoia backup; not required for normal use).
- App version string.

## Offline & Install

- `vite-plugin-pwa` precaches the built app shell and `items.json`.
- After first successful load, the app must work entirely offline. Manual airplane-mode verification is part of the test plan.
- `manifest.webmanifest` provides icons (192, 512), `display: standalone`, theme color, name, short name.
- iOS-specific `<meta name="apple-mobile-web-app-capable">` and apple-touch-icon link so add-to-home behaves like a native app.

## Error & Edge Cases

- **Cash given < total:** allowed; modal displays the negative delta as "still owed", but the confirm button stays enabled (user can be paid the rest in another tender; tracking that is out of scope).
- **Undo with non-empty cart:** confirmation dialog warns that the current cart will be replaced by the undone sale's lines.
- **`items.json` fails to load on first run:** show a clear error screen; do not silently render an empty list.
- **`localStorage` quota or corruption:** wrap reads in try/catch, fall back to an in-memory-only day with a banner warning.

## Testing

- **Unit (Vitest):**
  - Cart reducer: add, increment, decrement, remove-at-zero, clear.
  - Money helpers: cents ↔ display string, never produce `NaN`.
  - Sale recording: total equals sum of line subtotals; lines are snapshotted.
  - Undo: pops the last sale and restores cart lines.
- **End-to-end (Playwright, one happy path):** load app → add two items → validate → enter cash given → confirm → verify the sale appears in the report with correct totals.
- **Manual:** airplane-mode check after first install; confirm full offline functionality.

## File Layout (planned)

```
public/
  items.json
  icons/{192,512}.png
src/
  main.tsx
  App.tsx
  state/
    AppContext.tsx
    cartReducer.ts
    dayReducer.ts
    persistence.ts
  views/
    SellView.tsx
    ReportView.tsx
    SettingsView.tsx
  components/
    ItemRow.tsx
    ValidateModal.tsx
    TabBar.tsx
  lib/
    money.ts
    uuid.ts
  styles/
docs/superpowers/specs/2026-05-20-flea-market-pwa-design.md
```

## Deployment — GitHub Pages

Hosted as a GitHub Pages project site at `https://hachetamaury.github.io/bricabrac/`.

**Vite config:**
- `base: '/bricabrac/'` so all built asset URLs include the subpath.

**PWA config (`vite-plugin-pwa`):**
- `scope: '/bricabrac/'` and `start_url: '/bricabrac/'` in the manifest so the service worker controls only the app subpath and install opens the correct route.
- Icons referenced with relative paths so they resolve under the subpath.

**CI/CD (GitHub Actions):**
- Workflow at `.github/workflows/deploy.yml`.
- Trigger: push to `main`.
- Steps: checkout → setup Node → `npm ci` → `npm run build` → upload `dist/` as a Pages artifact → `actions/deploy-pages@v4`.
- Permissions: `pages: write`, `id-token: write`.
- One job, one environment: `github-pages`.

**Repo setup (manual, one-time):**
- Settings → Pages → Source: **GitHub Actions**.

**SPA routing:** the app is a single route — no client-side router needed initially, so the standard Pages 404 redirect trick is not required.

## Open Items

- The exact item list (names + prices in cents) will be provided by the user before implementation begins. Until then, `public/items.json` will contain a short placeholder seed used only for development.
