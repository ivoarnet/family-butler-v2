# Supabase Setup & Cutover Guide

This guide replaces the previous Azure SQL + Prisma setup.

## Groceries and Bring!

1. Run (or **rerun for existing grocery installations**) `docs/sql/groceries.sql` in the Supabase SQL Editor. The updated function supports local list deletion and checks connection revisions before linking or acquiring a sync lease, preventing stale accounts from using replacement mappings. List deletion removes local items/history, leaves Bring! unchanged, and is blocked while synchronization holds an active lease. It does not change calendar tables. Keep the service-role/secret key server-side.
2. Apply `docs/sql/bring-connections.sql` after the updated grocery migration, then deploy the updated API and worker together. Do not leave old worker/API versions running while enabling settings, because they do not enforce connection revision checks. Set **server-side** `BRING_CREDENTIALS_KEY` to the canonical base64 encoding of 32 cryptographically random bytes, using Azure application settings or an approved secret store. Generate it with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` in a trusted operator environment; do not paste it into source, logs, or frontend `VITE_` settings. Keep the same key on the API and optional worker. Without a valid key, saved-credential editing is disabled; local lists still work.
3. Open **Shop & Cook → Settings** to enter the household's Bring! email and password. Saving verifies the connection before encrypting and storing it. Credentials are write-only: settings show connection status, not the saved email/password. **Test connection** checks the current account. **Disconnect** disables the account and unlinks all remote lists, preserving local items and leaving Bring! itself unchanged. Replacing the account also unlinks existing mappings; reconnect lists explicitly afterward.
4. Existing **server-side** `BRING_ACCOUNTS_JSON` remains an optional fallback: a JSON object keyed by household UUID whose values contain `mail` and `password`. A saved connection overrides it, and an explicit settings disconnect suppresses fallback for that household. Use an approved secret store; never commit actual values. The `.env.example` contains empty configuration only.
5. Create a local list and select an existing Bring! list to link/import. Create remote lists in Bring! itself. Use a dedicated account/list when possible; changes affect everyone sharing that remote list. Do not connect the same remote list to unrelated households. **Sync** pulls remote changes and retries pending edits; local edits work during provider outages.
6. For unattended synchronization, run `npm run build:grocery-worker` from the repository root, then `npm install --omit=dev --prefix workers/grocery-sync-package`. Deploy the contents of that generated directory to a separate timer-capable Azure Functions host with the same Supabase, encryption key, and Bring! settings and the host's required `AzureWebJobsStorage`. The worker polls every five minutes and includes saved connections as well as environment-configured accounts. Its source lives outside `/api` under `workers/`, keeping the SWA artifact HTTP-only. Azure Static Web Apps **managed APIs support HTTP triggers only**, so they retain manual sync but do not run the timer. Configure the timer host separately; no Azure resources or infrastructure-as-code are provisioned by this repository.

For provider-derived grocery icons, rerun **both** `docs/sql/groceries.sql` and then `docs/sql/bring-connections.sql` before deploying the updated API and worker. This adds cached item icon metadata and updates account-disconnect cleanup. Sync each linked list to populate image references; existing lists are not backfilled until synchronization runs. Unlinked local items have a generic fallback. Bring catalog/details outages preserve cached references and do not prevent item synchronization. CDN availability/CORS restrictions can still produce a fallback image.

Credential payloads use AES-256-GCM with a fresh nonce and household-bound authenticated data. Only the API's service identity can access encrypted records. Restrict database backups and secret-store access accordingly. Back up the encryption key separately: losing or replacing it without re-encryption makes saved connections unreadable. This release does not provide transparent key rotation; disconnect and save the credentials again after an intentional key change, and relink lists. Coordinate key/configuration changes across API and worker deployments to avoid stale in-flight clients. Credential settings are available only to the existing authenticated household owner.

The community Bring! SDK requires Node 18+. Its API/terms can change; deployment operators must verify their permitted use. No live Bring! calls are made in unit tests. Verify `GET /api/health?checks=1` and authenticated grocery endpoints against your configured Supabase instance after applying the migration.

### Bring settings fails to load after migrations

The SWA deployment must include `bring-shopping` inside the API artifact, not only in the repository's root workspace `node_modules`. Oryx's default workspace install can hoist the SDK out of `/api` even when deployment succeeds. The workflow's `api_build_command` performs a standalone production install after that step. Redeploy the updated workflow; rerunning SQL alone cannot repair an incomplete API artifact.

Metadata/settings and local-list handlers defer SDK loading, so an optional client-loading failure does not prevent them starting. If settings still fail after redeployment, inspect the status/body of the `/api/households/…/groceries/connection` request and API host logs. Do not share authorization headers, credentials, or encrypted payloads. A missing/invalid encryption key disables credential editing but does not itself fail the settings read.

## 1) Create a Supabase project

1. Create a new Supabase project.
2. From **Project Settings → API**, copy:
   - `Project URL` (use as `SUPABASE_URL`)
   - `publishable` key (optional frontend read-only usage)
   - `secret` key (API server-side usage only)

## 2) Configure runtime architecture

Recommended architecture:

- Browser calls only `/api/*` endpoints.
- Azure Functions use Supabase server-side with `SUPABASE_SECRET_KEY`.
- Do **not** expose `SUPABASE_SECRET_KEY` to the browser.

## 3) Configure environment variables

### Azure Static Web Apps (API runtime)

Set app settings:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DEFAULT_HOLIDAY_REGION` (optional, defaults to `CH`)

### Frontend build-time vars (optional when using runtime auth config endpoint)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## 4) Create tables in Supabase (SQL Editor)

Run:

```sql
create table if not exists public.households (
  id uuid primary key,
  name text not null,
  holiday_region text not null default 'CH',
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  first_name text not null,
  role text,
  is_child boolean not null default false,
  hatch_parenting_away boolean not null default false,
  school_building text,
  school_class text,
  avatar_color text not null,
  visible_in_calendar boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, sort_order)
);

create table if not exists public.contacts (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  first_name text not null,
  last_name text,
  mobile_phone text,
  email text,
  birth_day smallint,
  birth_month smallint,
  birth_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_types (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, sort_order)
);

create table if not exists public.events (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  event_date date not null,
  end_date date,
  member_ids uuid[] not null default '{}',
  all_day boolean not null default true,
  start_time time,
  end_time time,
  event_type_id uuid references public.event_types(id) on delete set null,
  repeat_rule text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.day_configurations (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null check (category in ('school_off', 'bank_holiday', 'bridge_day')),
  start_date date not null,
  end_date date not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_household_members_household_sort_order
  on public.household_members (household_id, sort_order);

create index if not exists idx_contacts_household_name
  on public.contacts (household_id, first_name, last_name);

create index if not exists idx_households_created_by_user
  on public.households (created_by_user_id, created_at);

create index if not exists idx_event_types_household_sort
  on public.event_types (household_id, sort_order);

create index if not exists idx_events_household_date
  on public.events (household_id, event_date);

create index if not exists idx_day_configurations_household_dates
  on public.day_configurations (household_id, start_date, end_date);
```

If your `households` table already exists, run this migration before deploying:

```sql
alter table public.households
  add column if not exists created_by_user_id uuid references auth.users(id);

-- Backfill this value with the correct owner user id for each existing household before enforcing NOT NULL.
-- Example:
-- update public.households
-- set created_by_user_id = 'YOUR_AUTH_USER_UUID'
-- where id = 'YOUR_HOUSEHOLD_UUID';

alter table public.households
  alter column created_by_user_id set not null;

create index if not exists idx_households_created_by_user
  on public.households (created_by_user_id, created_at);

alter table public.event_types
  add column if not exists color text;

alter table public.events
  add column if not exists end_date date;
```

### Childcare migration

After creating the core tables above, run `docs/sql/childcare.sql` in the Supabase SQL Editor before using the childcare endpoints. **Existing installations must rerun it before deploying childcare added-day support** to allow the new `add` override action. The repeatable migration creates separate provider, weekly arrangement, and occurrence override tables, same-household constraints, child-reference validation, and owner-scoped RLS policies. It does not create generic events or Azure resources.

The server-side secret key bypasses RLS, so the childcare Azure Function authenticates users and verifies `households.created_by_user_id` before every read/write. Do not expose that key to clients. Direct authenticated childcare access is restricted by RLS to the household owner; anonymous access has no policy.

See [Childcare model and API](DATA_MODEL.md#childcare--implemented) for request examples and scheduling decisions. To verify after migration, create a provider and arrangement via the childcare API, reload `GET /api/households/{householdId}/childcare`, and request `/occurrences?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Apply an override and repeat the range request to confirm that only its original occurrence changes.

### Parenting-time migration

After the core tables above, run `docs/sql/parenting-time.sql` in the Supabase SQL Editor before using parenting-time endpoints. It creates household-scoped parenting parties, one household-wide plan with an optional effective-through date, and dated changes, with same-household party/plan references and owner-scoped RLS. A party may optionally link to a same-household member; co-parents are not required to be `household_members`. Parenting time is not stored in `events` or `day_configurations`.

Before deploying event-write changes, run `docs/sql/event-tenant-safety.sql`. It makes household ownership immutable for household resources and installs an atomic, household-scoped event replacement command. Both HTTP and agent event writes use this command; event IDs not already present in the target household are generated server-side. The migration and API deployment must be coordinated so event writes are not deployed before the SQL function exists.

Before deploying member classification/school details, run `docs/sql/household-member-details.sql`. The member migration adds `is_child` and `hatch_parenting_away` (both default false), `school_building`, and `school_class` to `household_members`. On its first run it preserves previously explicit parenting child-column selections as child classification and enables their hatch preference only if the previous display preference was enabled; reruns do not override later user changes. Neither free-text roles nor school details imply child status.

The previous `parenting_time_calendar_settings` table and authorized endpoint are retained for compatibility, but the current calendar no longer reads them. Hatching uses child members' explicit preferences and active parenting parties' optional household-member links. On a fresh installation, apply the core schema, the member-details migration, and the parenting-time migration; existing parenting installations only need the member-details migration for this update.

Review parenting-party member links in Settings → Parenting Time after upgrading. The migration does not infer a member link from the previous comparison-party selection; until at least one active parenting party is explicitly linked to a current household member, no absence background is shown.

The Azure Function verifies household ownership before using the server-side Supabase secret key. Settings → Parenting Time uses this API to manage and archive parties, save plans and one-off changes, and preview drafts with `POST .../preview`; saved intervals are reloaded from `/resolve?startAt=...&endAt=...`. The resolver reads persisted plan and change data. See [Parenting time model and API](DATA_MODEL.md#parenting-time--persisted-plan-and-server-resolver) for payloads and the ISO-week resolution contract.

## 5) Seed an initial household

Run:

```sql
insert into public.households (id, name, holiday_region)
values ('00000000-0000-0000-0000-000000000001', 'Family Butler', 'CH')
on conflict (id) do nothing;
```

## 6) Verify locally

1. Copy env templates:

   ```bash
   cp /home/runner/work/family-butler-v2/family-butler-v2/api/.env.example /home/runner/work/family-butler-v2/family-butler-v2/api/.env
   cp /home/runner/work/family-butler-v2/family-butler-v2/frontend/.env.example /home/runner/work/family-butler-v2/family-butler-v2/frontend/.env
   ```

2. Fill real keys in `api/.env`.
3. Start app: `npm run dev`
4. Verify endpoints:
   - `GET /api/health?checks=1`
   - `GET /api/households`
   - `POST /api/households`
   - `GET /api/households/{householdId}`
   - `PUT /api/households/{householdId}`
   - Verify event and event type data persists through `PUT /api/households/{householdId}` payloads

## 7) Production cutover checklist

1. Configure SWA app settings with Supabase vars.
2. Deploy latest branch.
3. Verify `GET /api/health?checks=1` returns `200`.
4. Verify household read/write from UI Settings page.
5. Remove any remaining Azure SQL secrets (`DATABASE_URL`, `SQL_CONNECTION_STRING`, `DATABASE_CONNECTION_STRING`) from environments.
