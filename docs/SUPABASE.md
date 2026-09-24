# Supabase Setup & Cutover Guide

This guide replaces the previous Azure SQL + Prisma setup.

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
```

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
