# iOS-style UX redesign — June 2026

Reskins the app to feel like a native iOS app, without adding runtime
dependencies (it stays an offline PWA). No data-model or reducer changes.

## Design system (`styles/global.css`)
iOS system tokens: system blue/red/green/orange, grouped background (`#f2f2f7`),
white elevated cards, label/secondary/tertiary text, hairline separators, radius
& shadow scale, full safe-area insets. Native touches: no tap-highlight,
momentum scroll, 44pt minimum targets, press feedback. Legacy `--color-*`
variables are aliased onto the iOS palette for back-compat.

## Component library (`components/ui/`)
- `icons.tsx` — hand-rolled inline SVG icon set (tabs, menu, plus/minus, lock,
  pencil, trash, check, chevron, user, export…). No icon dependency.
- `Button.tsx` — variants (filled / tinted / gray / plain / destructive) and
  sizes (sm / md / lg) with iOS press states.
- `NavBar.tsx` — sticky translucent (blurred) nav row with a burger button and an
  optional right action, plus a large title that scrolls beneath. `NavIconButton`
  helper for right actions.
- `ListSection.tsx` — inset-grouped list: `ListSection` (header/footer) + `Row`
  (leading / title / subtitle / trailing / accessory, tappable).
- `Toggle.tsx` — iOS switch.
- `Drawer.tsx` — burger ☰ slide-over menu: session/user identity, JSON export
  backup, about/version.
- `chrome.tsx` — tiny context so any view's `NavBar` can open the drawer.

## Chrome
- `Modal` is now an iOS **bottom sheet** (grab handle, slide-up) — every existing
  caller (Recap, Encaisser, item/category editors, create/rename event) upgrades
  automatically.
- `TabBar` rebuilt with SVG icons above labels, translucent blurred background,
  system-blue active tint, safe-area padding.
- `App` hosts the bottom tabs + the burger drawer and provides the chrome context.

## Views
All five views migrated to `NavBar` + grouped lists/buttons:
- **Événements** — each event is a card: tappable row (checkmark when active,
  lock glyph when locked) over an action row (Verrouiller / Renommer / Suppr.).
  The session/user bar moved into the burger drawer.
- **Vente** — large-title nav with day total; category-grouped big buttons; a
  blurred sticky action bar with a filled Valider.
- **Rapport** — gradient summary card (recette / fond de caisse / total en
  caisse), grouped per-article and transactions lists.
- **Caisse** — fond de caisse + denomination counter (big steppers) + bilan, all
  as grouped sections.
- **Catalogue** — grouped categories and items; per-item active **switch**;
  archive/delete moved into the edit sheets; iOS icon & colour pickers.

## PWA
`theme-color` / status-bar style / manifest colours updated to the light grouped
background.
