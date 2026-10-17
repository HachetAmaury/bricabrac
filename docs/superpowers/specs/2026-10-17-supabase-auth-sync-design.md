# Supabase auth, storage and live sync — Design

**Date:** 2026-10-17
**Status:** Draft, awaiting approval
**Builds on:** `2026-05-20-flea-market-pwa-design.md`, `2026-06-14-pos-features.md`
**Backlog item:** #8 (multi-device sync)

## Intent

Several people from one small association sell at the same event with their own
phones. Today the app is a local-only PWA: each phone has its own data, sync
only works between tabs of the same device. We want every phone on the same
event to see the same sales, items, lock state and cash figures, live, and we
want the data to survive the phone.

Supabase becomes the source of truth: Postgres for data, Supabase Auth for
accounts, Supabase Realtime for live propagation. The app stays a PWA that keeps
selling without network.

## Goals

- Real accounts (email + password). No email sending of any kind.
- One global admin role that manages users and access from inside the app.
- Catalogs and events stored in Postgres, scoped by access grants.
- Two or more phones on the same event see each other's adds, edits and
  removes without refreshing.
- Sales keep working offline and reach the server when network returns.
- One-time import of the data already on the user's phone.

## Non-goals

- Invitations by email or link. Accounts are created by the admin and
  credentials passed by hand (WhatsApp).
- Fine-grained permissions. Inside an event, every member has full rights.
- Presence ("who is online"), typing indicators, per-field merging.
- Public sign-up, password reset by email, multi-tenant SaaS.
- Offline support for anything other than recording and deleting sales.

## Anti-goals

- Losing a sale. A sale recorded offline must never be dropped or duplicated.
- A member seeing or touching an event they were not granted.
- A seller deleting someone else's sale.
- Shipping the Supabase service key to the browser.

## Constraints

- Existing stack: Vite + React 18 + TypeScript, Context + `useReducer`, no state
  library. Tests: Vitest + Playwright. Deployed on Vercel (and GitHub Pages).
- Existing Supabase project `bkppqrnfxyacngmmamkw`, currently empty. MCP
  access from this workspace is available for migrations.
- Money stays in integer cents. UI language stays French.
- New runtime dependency allowed: `@supabase/supabase-js`. Nothing else.
- Team is small (single association, a handful of accounts). Design for tens of
  users and thousands of sales per event, not more.

## Decisions made with the owner

### Accounts and roles

- Auth = Supabase Auth, email + password. Email confirmation disabled.
- `profiles` table, one row per auth user: `display_name`, `is_admin`.
- **Admin** (`is_admin = true`): sees and edits everything; creates, edits and
  disables other users; grants and revokes access to events. Users are never
  deleted (their sales reference them): "disable" bans the auth user and sets
  `profiles.disabled = true`; a disabled user cannot log in but keeps their
  name on past sales. (Builder-check call.)
- **Member**: sees only granted events and the catalogs those events use; full
  edit rights inside them (sell, edit items and categories, toggle enabled
  items, lock/unlock, rename, cash float, cash count).
- First admin is created once by a script (SQL migration or Supabase MCP) with
  an email and password given by the owner. Everything after that happens in
  the app.
- Creating a user, changing another user's password or deleting a user needs
  the service role. That lives in one Supabase Edge Function,
  `admin-users`, callable only by a logged-in admin (the function checks
  `profiles.is_admin` from the caller's JWT before acting).

### Data model

Catalogs become first-class. An event uses exactly one catalog. Access is
granted per event; access to an event implies access to its catalog.

```
profiles        id (= auth.users.id), display_name, is_admin, disabled, created_at
catalogs        id, name, created_by, created_at
categories      id, catalog_id, name, color, created_at
items           id, catalog_id, name, price, icon, category_id, archived, created_at
events          id, catalog_id, name, kind, locked_at (nullable timestamptz),
                cash_float, cash_count (jsonb), created_by, created_at
event_items     event_id, item_id            -- enabled subset (replaces enabledItemIds)
event_members   event_id, user_id            -- access grants
sales           id, event_id, seller_id, timestamp, lines (jsonb), total,
                cash_given, change, created_at
```

Notes:
- `sales.lines` stays a JSON snapshot (`SaleLine[]`), as today. No `sale_lines`
  table; reports only ever read a whole sale.
- `cash_count` stays JSON (`Record<denominationCents, qty>`).
- All ids are UUIDs generated on the client (`lib/uuid.ts`), so offline rows and
  retries are idempotent.
- `updated_at` on every mutable table, maintained by a trigger, so the client
  can refetch "everything changed since X" on reconnect.

### Row Level Security

RLS is on for every table. Policies, in words:

- `profiles`: a user reads their own row and the rows of people who share an
  event with them (needed to show seller names). Admin reads all. Only admin
  updates `is_admin`; a user may update their own `display_name`.
- `event_members`: readable by its user and by admins. Written by admins only.
- `events`: readable and writable by members (`event_members`) and admins.
  Delete by admins only.
- `catalogs`, `categories`, `items`, `event_items`: readable and writable by
  anyone who is a member of an event using that catalog, and by admins.
  Catalog creation and deletion by admins only.
- `sales`: readable by event members. Insert allowed if the caller is a member
  of the event and `seller_id = auth.uid()` and (`events.locked_at` is null or
  `sales.timestamp < events.locked_at`). Delete allowed only if
  `seller_id = auth.uid()` and the event is not locked. No update.

Lock is a timestamp, not a boolean, so a sale recorded offline *before* the
lock is still accepted when it reaches the server later. A sale is never
dropped because of a lock. (Builder-check call: resolves the conflict between
the "never lose a sale" anti-goal and the earlier "rejected op is dropped"
rule.) The lock rule is enforced server-side, mirroring the reducer's current
behavior.

### Live sync

- Source of truth is Postgres. Each phone keeps a local copy of the events it
  can see, in the existing reducers.
- On login and on every app foreground / reconnect: fetch all granted events,
  their catalogs, members, and sales; hydrate the reducers; then subscribe.
- Supabase Realtime (`postgres_changes`) subscriptions on `sales`, `items`,
  `categories`, `events`, `event_items`, filtered to the granted event / catalog
  ids. Each change is applied to local state by id (upsert or remove).
- Local writes: apply to local state first, then send to Supabase. The echo
  coming back through Realtime is a no-op upsert.
- Conflicts: sales are append-only with per-seller delete, so none. All other
  rows are last write wins.

### Offline

- Only sales (insert and own-sale delete) work offline.
- Outbox in localStorage: an ordered list of pending operations. Flushed in
  order when `navigator.onLine` becomes true and on app foreground. Each op is
  retried until the server accepts it. A sale predating the lock is accepted
  (see RLS). An op the server definitively rejects (member removed from the
  event, event deleted) is dropped and the local sale rolled back with a
  visible message. A duplicate-key error on replay counts as success.
- Everything else (catalog edits, lock, rename, cash, admin actions) requires
  network; the UI disables or errors clearly when offline.
- The sell screen shows a small "hors ligne, N ventes en attente" indicator
  while the outbox is non-empty.

### Behavior changes in the app

- The free-text "utilisateur" in the drawer is replaced by the logged-in
  profile. Logout lives there too.
- "Annuler la dernière vente" undoes **my** last sale on this event.
- Report: one transaction list per seller, with per-seller subtotal, plus the
  event total and the existing per-item breakdown over all sellers.
- A sale shows its seller's display name.
- Events list shows only granted events. Admin sees all.
- Creating an event asks which catalog to use. Members choose among catalogs
  they can see; admin among all.
- Catalog tab shows the active event's catalog.
- The demo event is removed.
- JSON export stays. JSON import is removed (DB is the truth).
- New admin screens, reachable from the drawer when `is_admin`:
  - Users: list, create (email, password, display name, admin flag), edit,
    disable / re-enable.
  - Per user: event grants (checkbox list of events).
  - Catalogs: list, create, rename, delete.

### Migration of existing local data

On first successful login on a device whose localStorage still holds the old
`catalog:items` / `catalog:categories` / `events:list` keys, the app offers once:
"Importer les données de ce téléphone dans le compte ?" Accepting creates one
catalog named after the device ("Catalogue importé"), its items and categories,
and every local event with its sales, all attributed to the current user as
seller. Declining or completing clears the old keys. The offer is shown only to
admins: the admin's phone is the source of truth. On a member's phone the old
keys are cleared at first login without import; anyone who cares about data on
another phone exports it to JSON before the rollout.

### Deployment

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Vercel env vars
  and in a local `.env` (already git-ignored).
- Schema lives in `supabase/migrations/*.sql` in the repo, applied with the
  Supabase MCP / CLI.
- Edge function source in `supabase/functions/admin-users/`.

## Sync edge cases (must be handled, each one tested)

Owner's requirement: every one of these gets an explicit behavior and a test.
The behaviors below are the design intent; the plan refines them.

| # | Situation | Behavior |
|---|-----------|----------|
| 1 | Event locked by A while B is offline and keeps selling | B's sales dated **before** `locked_at` are accepted on reconnect. Sales dated **after** are refused by the server; they stay in B's outbox flagged "événement verrouillé", visible to B with a warning, and are retried automatically if the event gets unlocked. Never silently dropped. |
| 2 | Event deleted (admin) while B has pending sales for it | Server refuses. B sees a message listing the lost sales with their totals and can export them to JSON. Then they are removed from the outbox. |
| 3 | B removed from the event while offline with pending sales | Same as #2. |
| 4 | B disabled by admin while offline with pending sales | Same as #2, plus B is logged out on reconnect. |
| 5 | Item price/name edited or archived while B sells it offline | Sale lines are snapshots; B's sale keeps the price B saw. Accepted. |
| 6 | Same outbox op sent twice (retry after timeout) | Client-generated UUID → duplicate-key error → treated as success. |
| 7 | Two phones edit cash count / cash float / rename at the same time | Last write wins. Realtime pushes the winner to both. |
| 8 | Lock and unlock toggled on two phones at the same time | Last write wins. |
| 9 | A and B each undo "their last sale" at the same time | Independent, per seller. No clash. |
| 10 | Same account logged in on two phones | Both are the same seller. "My last sale" = that account's last sale on the event, whichever phone made it. |
| 11 | Phone clock is wrong | Sale timestamps come from the phone. The lock comparison (#1) uses that timestamp. Accepted risk for a trusting team; the plan may add a server `created_at` for display. |
| 12 | App backgrounded, Realtime socket dropped, changes missed | On foreground and on reconnect: full refetch of granted events, then resubscribe. Outbox flushed first, then refetch. |
| 13 | Realtime delivers a change for an event the user was just removed from | Ignored; the refetch no longer returns that event and it disappears from the list. |
| 14 | Network returns while the user is mid-cart | Outbox flush and refetch never touch the cart. |
| 15 | Schema changes deployed while a phone still holds an old-format outbox | Outbox entries carry a version; unknown versions are shown to the user as "ventes non synchronisables" with JSON export, not crashed on. |

## Left to the builder

- Exact Realtime channel layout (one channel per event vs one per table).
- Whether the local copy stays in localStorage or moves to IndexedDB. Keep
  localStorage unless size bites.
- Shape of the Supabase client wrapper and how reducers receive remote changes
  (new action types vs reuse of `hydrate`).
- Login screen design, within the existing iOS-style design system.
- How admin screens are laid out, within the existing component kit.
- Test strategy: unit tests for outbox and reducers; one Playwright flow
  against a local Supabase or a test project.

## Delivery order

Nobody is using the app during this work, so all work is committed directly
on `main`. The steps below are commit groups, each leaving `main` working
(login wall included; accounts are hand-created until step 4).

1. Schema, RLS, first-admin script. Supabase client, login screen, session
   handling. App still local-only behind login.
2. Read/write catalogs, events, sales through Supabase. Realtime subscriptions.
   Local import of old data.
3. Offline outbox for sales, online/offline indicator.
4. Admin UI: users, grants, catalogs. Edge function.
5. Report per seller, undo-my-last-sale, drawer cleanup, demo event removal.
