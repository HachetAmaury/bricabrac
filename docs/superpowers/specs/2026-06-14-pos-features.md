# POS feature additions — June 2026

Builds on `2026-05-20-flea-market-pwa-design.md`. Adds eight capabilities to the
sell/report flow. All data stays in `localStorage`; money is still integer cents.

## 1. Recap step before payment
`components/RecapModal.tsx`. Tapping **Valider** in the Sell view now opens a
recap listing every cart line (icon, name, qty × price, line total) and the grand
total, to be checked with the customer. **Retour** edits the cart; **Encaisser**
moves on to the existing cash/change modal.

## 2. Big category buttons in the Sell view
The flat item list is replaced by a grid of large buttons grouped by category.
Each button shows the item's icon, name and price, tinted with its category
colour, with a quantity badge and an inline `−` when in the cart. Locked events
disable the buttons.

## 3. Per-item icon picker
`lib/icons.ts` + the Catalog edit modal. Each item can carry an emoji shown on
its sell button and in lists.

## 4. Multi-session sync (same device)
`Item`/`SaleEvent`/etc. persist on every change; a `storage` event listener in
`AppContext` mirrors writes from other sessions of the same browser (tabs,
windows, installed PWA) so they behave as one shared tablet. `saveJSON` skips
no-op writes to prevent echo loops. An optional **user / appareil** identity is
stored under `app:user`.

> Limitation: true cross-*device* sync needs a backend (accounts + a sync
> service); the app is a static GitHub Pages PWA with no server, so sync is
> scoped to sessions on the same device.

## 5. Categories
`state/categoriesReducer.ts`, persisted under `catalog:categories`. Create any
number of categories, each with a colour from a fixed palette. An item belongs to
at most one category (`Item.categoryId`). Deleting a category clears it from its
items (`catalog` `clearCategory`) but keeps the items. Category colour tints the
item in the Sell grid and the Catalog list.

## 6. Cash float (fond de caisse)
`SaleEvent.cashFloat` (cents). Set in the Caisse tab. The Report shows recette
(ventes), fond de caisse, and total en caisse (= fond + recette) separately.

## 7. Cash-count tab (comptage de caisse)
`views/CashView.tsx` + `lib/cash.ts`. Count notes/coins per euro denomination
(500 € → 1 c); the tab totals them, subtracts the cash float to give the counted
revenue, and compares it against the report's recorded sales total, showing the
écart. Stored in `SaleEvent.cashCount`.

## 8. Lock / unlock an event
`SaleEvent.locked`. Toggled from the Events list. A locked event refuses new
sales (guarded in `recordSale` and disabled in the Sell view).
