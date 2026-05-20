# Flea Market Sales PWA — Design

**Date:** 2026-05-20
**Status:** Approved (design phase)
**Repo:** `HachetAmaury/bricabrac`

## Purpose

A simple, installable, offline-first Progressive Web App used at flea markets, tournaments, and similar selling events to:

1. Manage a catalog of items the user sells.
2. Run multiple events in parallel (tournoi, bric-à-brac, etc.), each with its own enabled subset of catalog items and its own sales log.
3. Build a cart from the active event's items, displaying a running total.
4. Confirm sales with an optional change calculator (cash given − total).
5. Produce a per-event report (item-level quantities and subtotals, grand revenue, transaction history, undo last sale).

The app runs entirely on a phone or tablet with no network connectivity after first install. No backend, no accounts, no sync.

## Scope

**In scope:**
- Global catalog of items with add, edit (name + price), and soft delete (archive / restore).
- Multiple events created and switched freely; each event is fully editable while active.
- Per-event item subset (toggle catalog items on/off per event).
- Cart with `+` / `−` controls per item, sticky total, validate-to-confirm flow.
- Cash-given input and change calculation at sale validation.
- Per-event report: item totals, transaction history, undo of last sale.
- Fully offline operation after first load.
- Deployed to GitHub Pages.

**Out of scope (deferred):**
- Per-event price overrides — catalog price applies everywhere; if a price needs to change for a single event, edit the catalog.
- Hard delete of items — archive is enough.
- Stock / inventory tracking.
- Payment method split (cash vs. card).
- Cloud sync, multi-device, accounts.
- Importing / exporting catalogs across devices (apart from a paranoia JSON backup of all local data).

## Tech Stack

- **Build:** Vite + React + TypeScript.
- **PWA:** `vite-plugin-pwa` with Workbox (`registerType: 'autoUpdate'`).
- **State:** React Context + `useReducer`. No external state library.
- **Persistence:** `localStorage` (small payloads, synchronous API, simpler than IndexedDB).
- **Tests:** Vitest for unit tests, Playwright for one end-to-end smoke flow.
- **Manifest:** `manifest.webmanifest` with 192/512 icons, `display: standalone`, theme color. iOS meta tags for add-to-home.

## Data Model

All money is stored as **integer cents** to avoid floating-point bugs. Display formats to `XX.XX €`.

```ts
type Item = {
  id: string;        // stable uuid
  name: string;
  price: number;     // cents
  archived: boolean; // soft delete flag
};

type EventKind = 'tournoi' | 'bric-a-brac' | 'autre';

// In-memory cart (not persisted; cleared on validate)
type CartLine = { itemId: string; qty: number };

type SaleLine = {
  itemId: string;   // reference to catalog Item.id (may be archived later)
  name: string;     // snapshotted at sale time
  price: number;    // cents, snapshotted at sale time
  qty: number;
};

type Sale = {
  id: string;          // uuid
  timestamp: number;   // ms epoch
  lines: SaleLine[];   // each line carries its own name + price snapshot
  total: number;       // cents, frozen at sale time
  cashGiven?: number;  // cents, optional
  change?: number;     // cents, optional
};

type Event = {
  id: string;            // uuid
  name: string;          // user-given, e.g. "Bric-à-brac 14 juin"
  kind: EventKind;
  createdAt: number;
  enabledItemIds: string[]; // catalog subset enabled for this event
  sales: Sale[];
};
```

**Storage keys (`localStorage`):**
- `catalog:items` → `Item[]`
- `events:list` → `Event[]`
- `events:activeId` → `string | null`

Each `SaleLine` denormalises the item's name and price at the moment of sale, so historical reports remain correct even if the catalog is later edited or items are archived.

## Architecture

- Single React app, four top-level views, switched by a bottom tab bar: **Events**, **Sell**, **Report**, **Catalog**.
- One Context provider wraps the app and exposes:
  - `catalog` (items) — `add`, `edit`, `archive`, `restore`.
  - `events` — `createEvent`, `renameEvent`, `deleteEvent`, `setActive`, `toggleItemEnabled`.
  - `cart` — `add`, `remove`, `clear` (in-memory only, tied to active event id; switching events clears the cart).
  - `recordSale`, `undoLastSale` (operate on the active event's sales).
- A small `money.ts` module handles cents → display formatting and parsing.
- A persistence middleware writes `catalog:items` and `events:list` (plus `events:activeId`) to `localStorage` on every change.

## Views

### Events view

- List of events: each row shows name, kind, sale count, total revenue. Active event has a clear visual marker (badge, accent border).
- Tap a row → set as active.
- `[+ New event]` button → modal with: name, kind (select), checkbox "copy enabled items from active event" (default on if an active event exists). Creating sets the new event as active.
- Per-row menu: rename, delete (with confirmation; deleting also clears `activeId` if it pointed there).
- Empty state when no events exist: prominent `[Create your first event]` button.

### Sell view

Top → bottom:

1. **Header:** active event name, grand total badge for the event so far.
2. **Item list (scrollable):** only items in `event.enabledItemIds` that are not archived. Each row =
   - Left: name and price.
   - Right: `[−]  qty  [+]`. The `qty` indicator and `[−]` are hidden when qty is 0.
3. **Sticky footer:**
   - Large total in the form `€42.50`.
   - `[Validate]` button, disabled while cart is empty.

If no event is active: empty state "Create or select an event to start selling" with a button that jumps to the Events tab.

**Validate flow:**

1. Tap `[Validate]` → opens a modal.
2. Modal shows the total and a numeric input "Cash given".
3. Live `change = cashGiven − total` displayed under the input (negative ⇒ still owed; positive ⇒ change owed to customer; zero ⇒ exact).
4. Buttons: `[Confirm sale]` / `[Cancel]`.
5. Confirm pushes the `Sale` into the active event's `sales`, clears the cart, closes the modal.
6. Cash input is optional — confirming with it empty stores `cashGiven` and `change` as `undefined`.

### Report view

Scoped to the **active event**. Three stacked blocks:

1. **Summary card:** event name, grand total, total number of sales.
2. **Per-item table:** rows `name | qty sold | subtotal`, sorted by subtotal descending. Empty state if no sales yet.
3. **Transactions list:** one row per sale, `time · €total · N items`. Tapping a row expands the line breakdown and (if present) cash / change. The most recent sale exposes an `[Undo]` button that removes it from the log; the undone lines do **not** automatically refill the cart (clean and predictable; the user can re-add manually if needed).

### Catalog view

- Two collapsible sections: **Active** items and **Archived** items.
- Each row: name, price, `[Edit]`, `[Archive]` (or `[Restore]` in the archived section).
- `[+ New item]` button → modal: name + price (cents input, displayed as decimal).
- Edit: same modal, pre-filled.
- Archive: sets `archived: true`. The item disappears from Sell view and from each event's enabled list visually (it is filtered out at render time; the `enabledItemIds` entry remains so a Restore puts it back where it was).
- Per-event enable toggles: each active row shows a compact switch "Enabled in `<active event name>`" — fast access when prepping an event. When no event is active, the switch is hidden.

## Offline & Install

- `vite-plugin-pwa` precaches the built app shell.
- After first successful load, the app must work entirely offline. Manual airplane-mode verification is part of the test plan.
- `manifest.webmanifest` provides icons (192, 512), `display: standalone`, theme color, name, short name.
- iOS-specific `<meta name="apple-mobile-web-app-capable">` and apple-touch-icon link so add-to-home behaves like a native app.

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

**SPA routing:** the app uses internal tab state, not URL routes — no client-side router needed initially, so the standard Pages 404 redirect trick is not required.

## Error & Edge Cases

- **Cash given < total:** allowed; modal displays the negative delta as "still owed", but the confirm button stays enabled (user can be paid the rest in another tender; tracking that is out of scope).
- **Deleting the active event:** confirmation dialog warns that the event and all its sales will be permanently lost. After deletion, `activeId` is cleared and the user is sent to the Events tab.
- **Archiving an item that is in the current cart:** archive is allowed; the cart line is removed and a toast notifies the user.
- **Switching the active event with a non-empty cart:** confirmation dialog warns that the cart will be discarded.
- **`localStorage` quota or corruption:** wrap reads in try/catch; on corruption, render an error screen offering a "Reset all data" action rather than crashing.

## Testing

- **Unit (Vitest):**
  - Cart reducer: add, increment, decrement, remove-at-zero, clear.
  - Money helpers: cents ↔ display string, never produce `NaN`.
  - Catalog reducer: add, edit, archive, restore.
  - Events reducer: create, rename, delete, toggle item enabled, switch active.
  - Sale recording: total equals sum of line subtotals; each line captures name + price.
  - Undo: pops the last sale from the active event.
- **End-to-end (Playwright, one happy path):** load app → create catalog item → create event → enable item → add to cart → validate with cash given → confirm → verify report shows the sale.
- **Manual:** airplane-mode check after first install; confirm full offline functionality.

## File Layout (planned)

```
public/
  icons/{192,512}.png
src/
  main.tsx
  App.tsx
  state/
    AppContext.tsx
    catalogReducer.ts
    eventsReducer.ts
    cartReducer.ts
    persistence.ts
  views/
    EventsView.tsx
    SellView.tsx
    ReportView.tsx
    CatalogView.tsx
  components/
    ItemRow.tsx
    ValidateModal.tsx
    TabBar.tsx
    Modal.tsx
  lib/
    money.ts
    uuid.ts
  styles/
.github/workflows/deploy.yml
docs/superpowers/specs/2026-05-20-flea-market-pwa-design.md
```

## Open Items

- No item list to seed — the catalog starts empty; the user populates it from the Catalog tab.
