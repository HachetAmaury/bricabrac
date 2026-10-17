# Supabase Auth, Storage and Live Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local-only PWA storage with Supabase (auth, Postgres, Realtime) so several logged-in phones share one event live, with sales still working offline.

**Architecture:** The existing reducers stay as the in-memory copy of what the server holds. A new `src/sync/` layer fetches rows into them, mirrors every local action to Supabase, applies Realtime changes back by id, and keeps an outbox for sales when offline. Auth wraps the app in a login gate; one Edge Function does the service-role work (user creation / password / disable). Schema and policies live in `supabase/migrations/`.

**Tech Stack:** Vite + React 18 + TypeScript, Context + `useReducer`, Vitest, Playwright, `@supabase/supabase-js` v2, Supabase CLI 2.x (installed), Supabase MCP for applying migrations to project `bkppqrnfxyacngmmamkw`, Deno Edge Function.

**Spec:** `docs/superpowers/specs/2026-10-17-supabase-auth-sync-design.md`

## Global Constraints

- Only new runtime dependency: `@supabase/supabase-js`. Dev deps may add `@types/node` already present; nothing else.
- Money stays integer cents. UI copy in French.
- All ids are client-generated UUIDs via `src/lib/uuid.ts`.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client). `SUPABASE_SERVICE_ROLE_KEY` only in local `.env` and Edge Function secrets, never in the bundle.
- `.env` must be git-ignored before any commit that touches it.
- Everything committed directly on `main`. Each task ends green: `npm test` and `npx tsc -b` pass.
- Keep the existing iOS-style component kit (`ListSection`, `Row`, `Button`, `Modal`, `NavBar`). No new UI library.
- Supabase project: `bkppqrnfxyacngmmamkw`. Migrations are applied with the Supabase MCP `apply_migration` (or `supabase db push`); SQL files are the source of truth in the repo.
- Existing tests keep passing or are updated in the same task that changes behavior.

## Review Focus

Inputs the spec implies but no happy-path test exercises. Each has a pinned test in the owning task.

1. **Login with wrong password or a disabled account** → French error message, stays on login, no crash. (Task 4)
2. **A Realtime payload for a row the user can no longer see** (removed from event) → ignored, no exception. (Task 8)
3. **Outbox replay returns `23505` duplicate key** → treated as success, op removed. (Task 9)
4. **Outbox entry with an unknown `version`** → surfaced as "ventes non synchronisables" with export, never thrown. (Task 9)
5. **Import of old local data whose item ids are slugs like `eau-cafe` (not UUIDs)** → ids remapped to UUIDs and references inside sales lines / enabledItemIds follow. (Task 10)

---

### Task 1: Schema, RLS and Realtime migration

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261017000000_initial.sql`
- Create: `supabase/tests/rls.sql`
- Modify: `.gitignore` (add `.env`, `supabase/.temp`)

**Interfaces:**
- Produces: tables `profiles`, `catalogs`, `categories`, `items`, `events`, `event_items`, `event_members`, `sales`; SQL helpers `public.is_admin()`, `public.is_event_member(uuid)`, `public.can_access_catalog(uuid)`; trigger that creates a `profiles` row from `auth.users` using `raw_user_meta_data->>'display_name'` and `(raw_user_meta_data->>'is_admin')::bool`; `updated_at` triggers; Realtime publication on `sales, items, categories, events, event_items, event_members`.

- [ ] **Step 1: Init Supabase folder and ignore secrets**

Run: `cd /Users/amauryhachet/Documents/Nat && supabase init` (answer no to VS Code / IntelliJ settings). Append `.env` and `supabase/.temp` to `.gitignore`.
Expected: `supabase/config.toml` exists; `git status` no longer lists `.env`.

- [ ] **Step 2: Write the migration**

`supabase/migrations/20261017000000_initial.sql`, exact column set from the spec's "Data model" table:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.catalogs (id uuid primary key, name text not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.categories (id uuid primary key, catalog_id uuid not null references public.catalogs(id) on delete cascade, name text not null, color text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.items (id uuid primary key, catalog_id uuid not null references public.catalogs(id) on delete cascade, name text not null, price integer not null, icon text, category_id uuid references public.categories(id) on delete set null, archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.events (id uuid primary key, catalog_id uuid not null references public.catalogs(id), name text not null, kind text not null check (kind in ('tournoi','bric-a-brac','autre')), locked_at timestamptz, cash_float integer, cash_count jsonb, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.event_items (event_id uuid references public.events(id) on delete cascade, item_id uuid references public.items(id) on delete cascade, primary key (event_id, item_id));
create table public.event_members (event_id uuid references public.events(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, primary key (event_id, user_id));
create table public.sales (id uuid primary key, event_id uuid not null references public.events(id) on delete cascade, seller_id uuid not null references public.profiles(id), "timestamp" bigint not null, lines jsonb not null, total integer not null, cash_given integer, change integer, created_at timestamptz not null default now());
```

Then: `set_updated_at()` trigger function applied to every table with `updated_at`; `handle_new_user()` trigger on `auth.users` insert; helper functions as `security definer` with `set search_path = public`:

- `is_admin()`: `exists(select 1 from profiles where id = auth.uid() and is_admin and not disabled)`
- `is_event_member(e uuid)`: `is_admin() or exists(select 1 from event_members where event_id = e and user_id = auth.uid())`
- `can_access_catalog(c uuid)`: `is_admin() or exists(select 1 from events ev join event_members m on m.event_id = ev.id where ev.catalog_id = c and m.user_id = auth.uid())`
- `shares_event_with(p uuid)`: `exists(select 1 from event_members a join event_members b on a.event_id = b.event_id where a.user_id = auth.uid() and b.user_id = p)` (security definer so it is not filtered by the `event_members` policy)

`alter table ... enable row level security` on all eight tables. Policies, one per spec bullet:

- profiles select: `id = auth.uid() or is_admin() or shares_event_with(id)`; update: own row (`id = auth.uid()`) with check that `is_admin` and `disabled` are unchanged unless `is_admin()`. Implement the "unchanged" check as a `before update` trigger that raises when a non-admin changes `is_admin` or `disabled`.
- event_members select: `user_id = auth.uid() or is_admin()`; insert/delete: `is_admin()`.
- events select/update: `is_event_member(id)`; insert: `can_access_catalog(catalog_id)` (members may create events on catalogs they already see); an `after insert` trigger (security definer) inserts `(new.id, auth.uid())` into `event_members` so the creator sees it; delete: `is_admin()`.
- catalogs select/update: `can_access_catalog(id)`; insert/delete: `is_admin()`.
- categories, items select/insert/update/delete: `can_access_catalog(catalog_id)`.
- event_items all: `is_event_member(event_id)`.
- sales select: `is_event_member(event_id)`; insert: `is_event_member(event_id) and seller_id = auth.uid() and sale_allowed_at(event_id, "timestamp")` where `sale_allowed_at(e uuid, ts bigint)` is a security-definer helper returning `locked_at is null or ts < (extract(epoch from locked_at) * 1000)::bigint` for that event; delete: `seller_id = auth.uid() and sale_allowed_at(event_id, (extract(epoch from now())*1000)::bigint)` (i.e. event not locked); no update policy.

Finish with `alter publication supabase_realtime add table public.sales, public.items, public.categories, public.events, public.event_items, public.event_members;` and `alter table public.sales replica identity full;` (same for `event_items`, `event_members` so deletes carry their keys).

- [ ] **Step 3: Apply to the project**

Run via Supabase MCP `apply_migration` with name `initial` and the file's SQL (or `supabase link --project-ref bkppqrnfxyacngmmamkw && supabase db push`).
Expected: MCP `list_tables` for `public` shows the eight tables; `get_advisors` type `security` reports no "RLS disabled" findings.

- [ ] **Step 4: Write the RLS test script**

`supabase/tests/rls.sql`: a transaction that creates two fake users directly in `auth.users` (`u_admin`, `u_member`, `u_other` with fixed UUIDs), inserts a catalog, an event granted to `u_member`, then uses

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
```

to assert with `do $$ ... raise exception ... $$` blocks:
1. `u_other` selects 0 rows from `events`.
2. `u_member` inserts a sale with `seller_id = u_member` → ok; with `seller_id = u_admin` → fails.
3. After `update events set locked_at = now()`, `u_member` insert with `"timestamp" = (extract(epoch from now())*1000)::bigint - 60000` → ok; with `"timestamp"` 60 s in the future → fails.
4. `u_member` deletes `u_admin`'s sale → 0 rows affected.
5. `u_member` cannot `update profiles set is_admin = true where id = u_member` (trigger raises).

Ends with `rollback;`.

- [ ] **Step 5: Run the RLS script**

Run through MCP `execute_sql` with the file contents (or `psql "$SUPABASE_DB_URL" -f supabase/tests/rls.sql`).
Expected: output ends with `ROLLBACK` and no `ERROR` lines other than those caught inside the `do` blocks (each assert block prints `notice: ok <n>`).

- [ ] **Step 6: Commit**

```bash
git add .gitignore supabase/
git commit -m "feat(db): initial Supabase schema, RLS and realtime publication"
```

---

### Task 2: First-admin script

**Files:**
- Create: `scripts/create-first-admin.mjs`
- Modify: `package.json` (script `"admin:create": "node scripts/create-first-admin.mjs"`)

**Interfaces:**
- Consumes: Task 1 `handle_new_user` trigger (reads `display_name`, `is_admin` from user metadata).

- [ ] **Step 1: Write the script**

Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (load `.env` with `node --env-file=.env`, so the npm script becomes `node --env-file=.env scripts/create-first-admin.mjs`), and `email`, `password`, `displayName` from `process.argv[2..4]`. Calls `createClient(url, key, { auth: { persistSession: false } }).auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name, is_admin: true } })`. Prints the new user id or the error and exits 1 on error.

- [ ] **Step 2: Install the dependency**

Run: `npm install @supabase/supabase-js@^2`
Expected: `package.json` dependencies lists `@supabase/supabase-js`.

- [ ] **Step 3: Run it once for the owner**

Run: `npm run admin:create -- <email> <password> "<display name>"` with the owner's values (ask the owner for them at execution time; never commit them).
Expected: prints a UUID; MCP `execute_sql` `select display_name, is_admin from profiles` returns one row with `is_admin = true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-first-admin.mjs package.json package-lock.json
git commit -m "feat(db): script to create the first admin account"
```

---

### Task 3: Supabase client and generated types

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/database.types.ts`
- Modify: `src/vite-env.d.ts` (declare `ImportMetaEnv` with the two `VITE_SUPABASE_*` strings)
- Test: `src/lib/supabase.test.ts`

**Interfaces:**
- Produces: `export const supabase: SupabaseClient<Database>` (from `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)`), `export function hasSupabaseConfig(): boolean`, `export type Database` and row aliases `ProfileRow`, `CatalogRow`, `CategoryRow`, `ItemRow`, `EventRow`, `EventItemRow`, `EventMemberRow`, `SaleRow` (each `Database['public']['Tables'][name]['Row']`).

- [ ] **Step 1: Generate types**

Run MCP `generate_typescript_types`, save output to `src/lib/database.types.ts`.
Expected: file exports `Database` with the eight tables.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/supabase.test.ts
it('hasSupabaseConfig is false when env vars are missing', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  expect(hasSupabaseConfig()).toBe(false);
});
```

- [ ] **Step 3: Run, expect FAIL** (`npx vitest run src/lib/supabase.test.ts`, "hasSupabaseConfig is not defined").

- [ ] **Step 4: Implement `src/lib/supabase.ts`** with `createClient<Database>(url || 'http://localhost', key || 'anon', { auth: { persistSession: true, autoRefreshToken: true } })` so tests without env still import cleanly, and `hasSupabaseConfig()` returning `Boolean(url && key)`.

- [ ] **Step 5: Run, expect PASS.** Also `npx tsc -b` passes.

- [ ] **Step 6: Commit** — `git add src/lib/supabase.ts src/lib/database.types.ts src/lib/supabase.test.ts src/vite-env.d.ts && git commit -m "feat(sync): supabase client and generated types"`

---

### Task 4: Auth context, login screen, app gate

**Files:**
- Create: `src/state/AuthContext.tsx`, `src/views/LoginView.tsx`
- Modify: `src/App.tsx` (wrap `AppProvider` in `AuthProvider`; render `LoginView` when no session, a "Chargement…" screen while the session is unknown, `Shell` otherwise)
- Test: `src/views/LoginView.test.tsx`

**Interfaces:**
- Consumes: Task 3 `supabase`.
- Produces: `AuthProvider`, `useAuth(): { status: 'loading' | 'signedOut' | 'signedIn'; session: Session | null; profile: Profile | null; signIn(email: string, password: string): Promise<string | null>; signOut(): Promise<void> }`. `Profile = { id: string; displayName: string; isAdmin: boolean; disabled: boolean }` added to `src/types.ts`. `signIn` resolves to `null` on success or a French message: `'Email ou mot de passe incorrect.'` for `invalid_credentials`, `'Compte désactivé.'` for a banned user (`error.code === 'user_banned'`), otherwise `'Connexion impossible. Vérifiez le réseau.'`.

- [ ] **Step 1: Write the failing test** (same `createRoot` + `act` pattern as `src/views/CashView.test.tsx`, mocking `../state/AuthContext` with `signIn: vi.fn()`):

```ts
it('shows the error returned by signIn and stays on the form', async () => {
  h.signIn.mockResolvedValue('Email ou mot de passe incorrect.');
  render();
  fill('Email', 'a@b.c'); fill('Mot de passe', 'x');
  await act(() => click('Se connecter'));
  expect(container.textContent).toContain('Email ou mot de passe incorrect.');
  expect(container.querySelector('input[type=password]')).not.toBeNull();
});
it('disables the button while signIn is pending', ...)
```

- [ ] **Step 2: Run, expect FAIL** (module not found).

- [ ] **Step 3: Implement `AuthContext.tsx`**: `supabase.auth.getSession()` on mount, `onAuthStateChange` listener, then `from('profiles').select().eq('id', session.user.id).single()` to fill `profile`. If `profile.disabled` is true, call `signOut()` and set the error for the login screen. Implement `LoginView.tsx` with the `NavBar` title `'Connexion'`, two labelled inputs (`Email`, `Mot de passe`), a `Button variant="filled" size="lg"` labelled `'Se connecter'`, the error text in `var(--ios-red)`.

- [ ] **Step 4: Gate in `App.tsx`** as described in Files.

- [ ] **Step 5: Run tests, expect PASS.** Manually: `npm run dev`, open the app, log in with the Task 2 account, see the (still local) shell.

- [ ] **Step 6: Commit** — `git commit -m "feat(auth): email/password login gate with Supabase Auth"`

---

### Task 5: App types and reducers learn catalogs, sellers and lock timestamps

**Files:**
- Modify: `src/types.ts`, `src/state/eventsReducer.ts`, `src/state/catalogReducer.ts`, `src/state/categoriesReducer.ts`
- Modify tests: `src/state/eventsReducer.test.ts`, `src/state/catalogReducer.test.ts`, `src/state/categoriesReducer.test.ts`, `src/views/CashView.test.tsx`
- Modify callers: `src/views/SellView.tsx:264-276`, `src/views/EventsView.tsx:93-101`, `src/views/CatalogView.tsx` (add/edit dispatches), `src/views/ReportView.tsx:123`

**Interfaces:**
- Produces, in `src/types.ts`:
  - `Catalog = { id: string; name: string }`
  - `Item` gains `catalogId: string`; `Category` gains `catalogId: string`.
  - `SaleEvent` gains `catalogId: string` and `lockedAt: number | null`; `locked` stays as a boolean kept equal to `lockedAt !== null` by the reducer.
  - `Sale` gains `sellerId: string`.
- Produces, actions: every creating action takes the id from the caller so the sync layer can mirror it: `catalog add` gets `id: string, catalogId: string`; `categories add` gets `id, catalogId`; `events create` gets `id, catalogId`; `recordSale` gets `saleId: string, sellerId: string`; `undoLast` becomes `undoMyLast: { eventId, sellerId }` removing the latest sale with that `sellerId`; `setLocked` becomes `{ id, lockedAt: number | null }`. New actions for Realtime: `catalog upsert {item}` / `remove {id}`, `categories upsert/remove`, `events upsertEvent {event: Omit<SaleEvent,'sales'>}` (keeps existing sales), `events removeEvent {id}`, `events upsertSale {eventId, sale}`, `events removeSale {eventId, saleId}`, `events setEnabledItems {eventId, itemIds}`.

- [ ] **Step 1: Update the failing tests** — add to `eventsReducer.test.ts`:

```ts
it('undoMyLast removes only the latest sale of that seller', () => {
  const seeded = [{ ...base, sales: [sale('s1','alice',1), sale('s2','bob',2), sale('s3','alice',3)] }];
  const next = eventsReducer(seeded, { type: 'undoMyLast', eventId: 'e1', sellerId: 'bob' });
  expect(next[0].sales.map(s => s.id)).toEqual(['s1','s3']);
});
it('setLocked with a timestamp sets locked=true and lockedAt', ...);
it('upsertSale replaces a sale with the same id instead of duplicating it', ...);
it('upsertEvent keeps existing sales', ...);
it('recordSale uses the given saleId and sellerId', ...);
```
and in `catalogReducer.test.ts` / `categoriesReducer.test.ts`: `add` uses the given id; `upsert` inserts or replaces; `remove` filters.

- [ ] **Step 2: Run, expect FAIL** on the new cases.

- [ ] **Step 3: Implement** the type and reducer changes. Update the four view call sites to pass `id: uuid()`, `catalogId: activeEvent.catalogId`, `saleId: uuid()`, `sellerId: <from useAuth().profile!.id>`, and `lockedAt: e.locked ? null : Date.now()`.

- [ ] **Step 4: Run all tests + `npx tsc -b`, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "refactor(state): catalog ids, seller ids, lock timestamps and upsert actions"`

---

### Task 6: Row mappers and full fetch

**Files:**
- Create: `src/sync/mappers.ts`, `src/sync/fetch.ts`
- Test: `src/sync/mappers.test.ts`

**Interfaces:**
- Consumes: Task 3 row types, Task 5 app types.
- Produces (`mappers.ts`): `itemFromRow(r: ItemRow): Item`, `itemToRow(i: Item): ItemRow` (without timestamps), `categoryFromRow/ToRow`, `catalogFromRow`, `saleFromRow(r: SaleRow): Sale`, `saleToRow(s: Sale, eventId: string): Omit<SaleRow,'created_at'>`, `eventFromRows(e: EventRow, enabledItemIds: string[], sales: Sale[]): SaleEvent`, `eventToRow(e: SaleEvent): Omit<EventRow,'created_at'|'updated_at'>`. `locked_at` ↔ `lockedAt` converts ISO string ↔ ms epoch.
- Produces (`fetch.ts`): `fetchAll(client: SupabaseClient<Database>): Promise<Snapshot>` with `Snapshot = { catalogs: Catalog[]; items: Item[]; categories: Category[]; events: SaleEvent[]; profiles: Profile[] }`. Six selects, then assembles events from `event_items` and `sales`. RLS does the scoping; no client-side filtering by user.

- [ ] **Step 1: Write the failing tests** — round-trip each mapper (`itemFromRow(itemToRow(item))` deep-equals `item`), and `eventFromRows` with `locked_at: '2026-10-17T10:00:00.000Z'` yields `lockedAt === Date.parse(...)` and `locked === true`; with `null` yields `lockedAt: null, locked: false`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement both files.**

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(sync): row mappers and fetchAll snapshot"`

---

### Task 7: AppContext reads from Supabase and mirrors writes

**Files:**
- Create: `src/sync/writes.ts`
- Modify: `src/state/AppContext.tsx` (whole file), `src/state/persistence.ts` (new `KEYS`: `cache:catalogs`, `cache:items`, `cache:categories`, `cache:events`, `cache:profiles`, `events:activeId`; keep the old keys exported as `LEGACY_KEYS` for Task 10)
- Test: `src/sync/writes.test.ts`

**Interfaces:**
- Consumes: Task 6 `fetchAll`, mappers; Task 5 actions.
- Produces (`writes.ts`): `mirrorCatalog(client, a: CatalogAction, state: Item[]): Promise<void>`, `mirrorCategories(client, a, state)`, `mirrorEvents(client, a: EventsAction, state: SaleEvent[]): Promise<void>`. Each maps one local action to one Supabase call: `add/edit/archive/restore/clearCategory` → `upsert` of the resulting row(s); `delete` → `delete().eq('id', …)`; `events create` → insert event row then insert `event_items`; `toggleItem` → insert or delete one `event_items` row; `rename/setLocked/setCashFloat/setCashCount` → `update`; `recordSale` → `insert` into `sales`, `undoMyLast` → `delete` of that sale id (Task 9 reroutes these two through the outbox and adds an `outbox` parameter). `hydrate`/`upsert*`/`remove*` → no-op (they come *from* the server).
- Produces (`AppContext.tsx`): same `useApp()` shape as today plus `catalogs: Catalog[]`, `profiles: Profile[]`, `syncStatus: 'online' | 'offline' | 'syncing'`, `refresh(): Promise<void>`. `catalog` and `categories` exposed by `useApp()` are already filtered to `activeEvent.catalogId` (all items/categories live in context state as `allItems`, `allCategories`). Dispatchers are wrapped: local reducer first, then the mirror call; a mirror failure logs and sets `syncStatus`.

- [ ] **Step 1: Write the failing tests** for `writes.ts` with a fake client (`{ from: vi.fn(() => chain) }` where `chain` records `upsert/update/delete/insert/eq` calls):

```ts
it('catalog edit upserts the edited row', ...);           // expect from('items') and upsert({ id, name, price, ... })
it('toggleItem inserts when the item was disabled', ...);
it('toggleItem deletes when the item was enabled', ...);
it('setLocked writes locked_at as ISO string', ...);
it('hydrate does not touch the client', ...);
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `writes.ts`.**

- [ ] **Step 4: Rewrite `AppContext.tsx`**: initial state from `cache:*` keys (so the app renders instantly offline), `useEffect` on sign-in → `fetchAll` → dispatch `hydrate` for each slice → persist to cache. Drop the demo event, `DEFAULT_CATALOG` seeding and the `storage` event listener (the server is now the shared source). Keep `user` out: display name comes from `useAuth().profile`. `activeEventId` stays local per device.

- [ ] **Step 5: Run all tests + tsc, expect PASS.** Manual: create an item and an event in the app; MCP `execute_sql` `select count(*) from items` increases.

- [ ] **Step 6: Commit** — `git commit -m "feat(sync): app state fetched from Supabase, writes mirrored"`

---

### Task 8: Realtime subscriptions and reconnect

**Files:**
- Create: `src/sync/realtime.ts`
- Modify: `src/state/AppContext.tsx` (subscribe after hydrate; refetch on `visibilitychange` visible, `online`, and on channel `CHANNEL_ERROR`/`TIMED_OUT`)
- Test: `src/sync/realtime.test.ts`

**Interfaces:**
- Consumes: Task 6 mappers; Task 5 upsert/remove actions.
- Produces: `subscribeAll(client, scope: { eventIds: string[]; catalogIds: string[]; userId: string }, handlers: { onItem(a: CatalogAction), onCategory(a: CategoriesAction), onEvent(a: EventsAction), onMembershipChanged(): void }): () => void`. One channel `sync:<userId>` with `postgres_changes` listeners: `items`/`categories` filtered `catalog_id=in.(…)`; `events` filtered `id=in.(…)`; `event_items`, `sales` filtered `event_id=in.(…)`; `event_members` filtered `user_id=eq.<userId>` → `onMembershipChanged`. Also exports the pure `applyChange(payload, handlers)` so it can be tested without a socket. `DELETE` payloads use `payload.old`. `event_items` changes map to `setEnabledItems` only after a refetch of that event's `event_items` (one select), because a single row change does not carry the full list.

- [ ] **Step 1: Write the failing tests** for `applyChange`:

```ts
it('INSERT on sales → upsertSale with the mapped sale', ...);
it('DELETE on sales → removeSale(eventId, saleId) from payload.old', ...);
it('UPDATE on events → upsertEvent without touching sales', ...);
it('a payload whose event_id is not in scope is ignored', ...);   // Review Focus 2
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `realtime.ts`** and the wiring in `AppContext`: after each `fetchAll`, compute scope from the snapshot and (re)subscribe; `onMembershipChanged` → `refresh()`. Foreground/online handler: `refresh()` then resubscribe. Unsubscribe on sign-out.

- [ ] **Step 4: Run tests, expect PASS.** Manual: two browsers (one normal, one private) logged in as the same account, same event; a sale in one appears in the other's Rapport within a second.

- [ ] **Step 5: Commit** — `git commit -m "feat(sync): realtime subscriptions with refetch on foreground and reconnect"`

---

### Task 9: Offline outbox for sales

**Files:**
- Create: `src/sync/outbox.ts`, `src/components/SyncBanner.tsx`
- Modify: `src/sync/writes.ts` (`mirrorEvents` gains a fourth parameter `outbox: Outbox`; `recordSale`/`undoMyLast` → `outbox.enqueue`), `src/state/AppContext.tsx` (flush on online/foreground before `refresh()`; expose `outbox` state), `src/views/SellView.tsx` (render `SyncBanner` under the `NavBar`), `src/App.tsx` (rejected-sales dialog)
- Test: `src/sync/outbox.test.ts`

**Interfaces:**
- Produces: `type OutboxOp = { id: string; version: 1; kind: 'insertSale'; eventId: string; sale: Sale } | { id: string; version: 1; kind: 'deleteSale'; eventId: string; saleId: string }`; `type OutboxEntry = OutboxOp & { status: 'pending' | 'held-locked'; attempts: number }`; `type RejectedSale = { sale: Sale; eventId: string; reason: 'event-deleted' | 'not-member' | 'disabled' | 'unknown-version' }`.
  `createOutbox(storageKey = 'sync:outbox'): Outbox` with `enqueue(op)`, `entries(): OutboxEntry[]`, `rejected(): RejectedSale[]`, `dismissRejected()`, `flush(client, ctx: { eventsById: Map<string, SaleEvent> }): Promise<FlushResult>` where `FlushResult = { sent: number; held: number; rejected: number; stoppedOnNetworkError: boolean }`.
  Classification inside `flush`, per spec edge cases: success or Postgres `23505` → remove (case 6); network error (`TypeError`/`fetch failed`) → stop, keep everything; RLS failure (`42501` or PostgREST `PGRST301`) → look at `ctx.eventsById.get(eventId)`: event present and `lockedAt !== null && sale.timestamp >= lockedAt` → `held-locked`, keep (case 1); event absent → `rejected` with `event-deleted` or `not-member` (cases 2, 3); auth error `401`/`403` on a disabled user → `rejected: 'disabled'` and stop (case 4). Entry with `version !== 1` → `rejected: 'unknown-version'` without calling the client (case 15). `held-locked` entries are retried on the next flush (the event may have been unlocked).
- `SyncBanner` shows `'Hors ligne · N vente(s) en attente'` when `entries().length > 0` and offline, `'Synchronisation…'` while flushing, `'N vente(s) bloquée(s) : événement verrouillé'` when any `held-locked` exist. The rejected dialog (in `App.tsx`) lists each rejected sale (time, total, reason in French), offers **Exporter en JSON** (same blob download as the drawer export, payload `{ rejectedSales }`) and **OK** → `dismissRejected()`.

- [ ] **Step 1: Write the failing tests** with a fake client whose `insert` resolves/rejects per test:

```ts
it('sends pending ops in order and removes them on success', ...);
it('treats 23505 as success', ...);                                  // Review Focus 3
it('stops on a network error and keeps all entries', ...);
it('holds a sale timestamped after lockedAt as held-locked', ...);   // edge 1
it('accepts a sale timestamped before lockedAt', ...);               // edge 1 (server would accept; fake returns ok)
it('rejects with event-deleted when the event is unknown', ...);     // edge 2/3
it('rejects with disabled on 403 and stops', ...);                   // edge 4
it('rejects unknown version entries without calling the client', ...); // edge 15, Review Focus 4
it('deleteSale ops go through the same path', ...);
it('persists entries across createOutbox calls (localStorage)', ...);
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `outbox.ts`, `SyncBanner.tsx`, the rejected dialog, and the wiring.** `recordSale` now: reducer (instant UI) → `outbox.enqueue` → `flush` if `navigator.onLine`. The Realtime echo for a sale we inserted is a no-op `upsertSale`.

- [ ] **Step 4: Run tests + tsc, expect PASS.** Manual: DevTools → Network offline → sell twice → banner shows 2 pending → online → banner clears, sales visible in a second browser.

- [ ] **Step 5: Commit** — `git commit -m "feat(sync): offline outbox for sales with lock/rejection handling"`

---

### Task 10: One-time import of the admin's local data; clear legacy keys on members

**Files:**
- Create: `src/sync/importLocal.ts`, `src/components/ImportLocalModal.tsx`
- Modify: `src/App.tsx` (show the modal once when `useAuth().profile.isAdmin` and `hasLegacyData()`; for non-admins call `clearLegacyData()` silently on first signed-in render)
- Test: `src/sync/importLocal.test.ts`

**Interfaces:**
- Consumes: `LEGACY_KEYS` from Task 7, `parseBackup` from `src/lib/backup.ts`, Task 6 mappers.
- Produces: `hasLegacyData(): boolean`, `clearLegacyData(): void`, `buildImport(legacy: Backup, opts: { catalogId: string; catalogName: string; sellerId: string }): { catalog: CatalogRow; categories: CategoryRow[]; items: ItemRow[]; events: EventRow[]; eventItems: EventItemRow[]; sales: Omit<SaleRow,'created_at'>[] }` (pure), `runImport(client, ...)` which inserts in that order and then `clearLegacyData()`. `buildImport` remaps every non-UUID id (regex `/^[0-9a-f]{8}-[0-9a-f]{4}-/i` fails) to a fresh UUID and rewrites `categoryId`, `enabledItemIds`, and `sales[].lines[].itemId` accordingly; `locked: true` becomes `locked_at = createdAt` ISO; all sales get `seller_id = sellerId`.
- `ImportLocalModal`: title `'Données locales trouvées'`, body `'Importer les données de ce téléphone dans le compte ?'`, buttons `'Importer'` / `'Ignorer'` (Ignorer → `clearLegacyData()` after a `confirm('Les données locales seront effacées. Continuer ?')`). Catalog name `'Catalogue importé'`.

- [ ] **Step 1: Write the failing tests** for `buildImport`:

```ts
it('remaps slug ids to UUIDs and keeps references consistent', () => {   // Review Focus 5
  const out = buildImport({ catalog: [{ id: 'eau-cafe', ... }], categories: [], events: [{ ..., enabledItemIds: ['eau-cafe'], sales: [{ ..., lines: [{ itemId: 'eau-cafe', ... }] }] }] }, opts);
  const newId = out.items[0].id;
  expect(newId).not.toBe('eau-cafe');
  expect(out.eventItems[0].item_id).toBe(newId);
  expect((out.sales[0].lines as SaleLine[])[0].itemId).toBe(newId);
});
it('keeps existing UUID ids', ...);
it('converts locked:true to locked_at and stamps seller_id on every sale', ...);
it('hasLegacyData is true only when events:list or catalog:items exist', ...);
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run tests, expect PASS.** Manual: on the owner's phone (or a browser seeded with an old export), log in as admin → modal → Importer → events appear.

- [ ] **Step 5: Commit** — `git commit -m "feat(sync): one-time import of legacy local data for admins"`

---

### Task 11: Edge Function `admin-users`

**Files:**
- Create: `supabase/functions/admin-users/index.ts`, `src/sync/adminApi.ts`
- Test: `src/sync/adminApi.test.ts`

**Interfaces:**
- Request body: `{ action: 'create'; email: string; password: string; displayName: string; isAdmin: boolean } | { action: 'update'; userId: string; displayName?: string; password?: string; isAdmin?: boolean } | { action: 'setDisabled'; userId: string; disabled: boolean }`. Response `{ ok: true; userId?: string } | { ok: false; error: string }`.
- Function logic: read caller JWT from `Authorization`; service client `getUser(jwt)`; select `profiles.is_admin, disabled` for that id; refuse with 403 unless admin and not disabled. `create` → `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name, is_admin } })`. `update` → `auth.admin.updateUserById(userId, { password, user_metadata })` plus `update profiles set display_name, is_admin`. `setDisabled` → `updateUserById(userId, { ban_duration: disabled ? '876600h' : 'none' })` plus `update profiles set disabled`. Refuse `setDisabled` / `update isAdmin=false` on the caller's own id with `'Impossible de modifier votre propre compte.'`.
- `adminApi.ts`: `adminUsers(body): Promise<{ ok: true; userId?: string } | { ok: false; error: string }>` via `supabase.functions.invoke('admin-users', { body })`.

- [ ] **Step 1: Write the failing test** for `adminApi.ts` (mock `supabase.functions.invoke`): forwards body, returns `{ ok:false, error }` when `invoke` yields an error.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement both files.** Deploy: `supabase functions deploy admin-users --project-ref bkppqrnfxyacngmmamkw` (or MCP `deploy_edge_function`). `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically into Edge Functions; no secret to set.

- [ ] **Step 4: Run tests, expect PASS.** Manual: `curl` the function with the admin's access token and `{ "action": "create", ... }` → `{ ok: true, userId }`; with no token → 401/403.

- [ ] **Step 5: Commit** — `git commit -m "feat(admin): edge function for user creation, password and disable"`

---

### Task 12: Admin UI — users, grants, catalogs; event creation picks a catalog

**Files:**
- Create: `src/views/AdminView.tsx` (sections: Utilisateurs, Catalogues), `src/components/UserModal.tsx`, `src/components/GrantsModal.tsx`
- Modify: `src/App.tsx` (`tab` type gains `'admin'`, reached from the drawer; `TabBar` unchanged), `src/components/ui/Drawer.tsx` (row `'Administration'` when `profile.isAdmin`; session row shows `profile.displayName` and a `'Se déconnecter'` row calling `signOut`; remove the free-text user editing and the JSON import row + `parseBackup` usage; keep export), `src/views/EventsView.tsx` `CreateModal` (add a `<select>` labelled `'Catalogue'` over `catalogs`, required; default = active event's catalog)
- Test: `src/views/AdminView.test.tsx`

**Interfaces:**
- Consumes: Task 11 `adminUsers`, Task 7 `catalogs`, `profiles`, dispatchers; direct Supabase writes for `catalogs` (insert/update/delete by admin) and `event_members` (insert/delete), done in `src/sync/writes.ts` as `mirrorCatalogs(client, action)` and `setGrant(client, eventId, userId, granted: boolean)`.
- `AdminView`: list of profiles (name, email not available client-side → show display name + "admin" badge + "désactivé" badge), `+` → `UserModal` (create: email, mot de passe, nom, admin toggle; edit: nom, nouveau mot de passe optional, admin toggle, désactiver/réactiver button), row tap → `GrantsModal` (checkbox per event, writes `setGrant`). Catalogues section: list, `+` with name prompt, rename, delete (confirm; refused with message if an event uses it — rely on the FK error and show `'Catalogue utilisé par un événement.'`).

- [ ] **Step 1: Write the failing test**: mocking `useApp`/`useAuth`/`adminUsers`, `AdminView` renders one row per profile and tapping `+` then submitting calls `adminUsers` with `{ action: 'create', ... }`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** views, modals, drawer changes, event-creation catalog select.

- [ ] **Step 4: Run tests + tsc, expect PASS.** Manual: create a second user from the UI, grant an event, log in as that user in a private window: only that event and its catalog are visible.

- [ ] **Step 5: Commit** — `git commit -m "feat(admin): user, grant and catalog management screens"`

---

### Task 13: Report per seller, seller names, undo my last sale

**Files:**
- Modify: `src/views/ReportView.tsx`, `src/views/SellView.tsx` (banner already added), `src/views/EventsView.tsx` (subtitle unchanged)
- Test: `src/views/ReportView.test.tsx`

**Interfaces:**
- Consumes: `profiles` from `useApp()` for `sellerId → displayName`, `useAuth().profile.id` as "me".
- Report layout: existing total card and "Par article" over all sellers; then one `ListSection` per seller, header `'<Nom> · <n> vente(s) · <total>'`, my section first; the **Annuler** accessory appears only on my own latest sale and dispatches `undoMyLast`. Unknown seller id → `'Vendeur inconnu'`.

- [ ] **Step 1: Write the failing tests**: two sellers → two sections, mine first; **Annuler** present only on my latest sale; event locked → no **Annuler**.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run tests, expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(report): per-seller sections and undo of my own last sale"`

---

### Task 14: End-to-end smoke behind login, Vercel env, docs

**Files:**
- Modify: `e2e/smoke.spec.ts`, `e2e/layout.spec.ts` (log in first using `E2E_EMAIL` / `E2E_PASSWORD` env; `test.skip` when missing), `playwright.config.ts` (pass those env vars through)
- Modify: `docs/superpowers/BACKLOG.md` (item 8 → ✅, note the Supabase project and env vars), `README` section if one exists (else a short `docs/SETUP.md`: env vars, `npm run admin:create`, `supabase functions deploy`, Vercel env config)

- [ ] **Step 1: Update the e2e specs** to log in, create an event with the catalog select, sell, and check the report. Each run names its event with `Date.now()` and deletes it at the end so the real project stays clean.

- [ ] **Step 2: Run** `E2E_EMAIL=… E2E_PASSWORD=… npm run e2e`.
Expected: both specs pass.

- [ ] **Step 3: Set Vercel env vars** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (values from MCP `get_project_url` / `get_publishable_keys`) via `vercel env add` or the dashboard, then redeploy and log in on the deployed URL.

- [ ] **Step 4: Write docs, commit** — `git commit -m "test(e2e): smoke flow behind login; docs: setup and backlog"`

---

## Edge-case coverage map (spec section "Sync edge cases")

| Spec # | Covered by |
|--------|-----------|
| 1 | Task 1 RLS test 3; Task 9 held-locked tests |
| 2, 3 | Task 9 event-deleted test; Task 8 out-of-scope payload test |
| 4 | Task 9 disabled test; Task 4 disabled login message |
| 5 | Existing snapshot behavior in `recordSale`; no change |
| 6 | Task 9 `23505` test |
| 7, 8 | Last write wins by construction (`update` by id); Task 7 `setLocked` test |
| 9, 10 | Task 5 `undoMyLast` test |
| 11 | Accepted risk; `sales.created_at` exists for later display |
| 12 | Task 8 refetch on foreground/online |
| 13 | Task 8 out-of-scope payload test |
| 14 | Cart is separate reducer state; `refresh()` never dispatches to `cart` (Task 7) |
| 15 | Task 9 unknown-version test |
