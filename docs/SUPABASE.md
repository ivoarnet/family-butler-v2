# Supabase Setup & Auth Guide

This project uses Supabase for:

- Auth (email/password)
- Postgres tables (`households`, `household_members`, `contacts`, `tasks`)
- Authorization/profile data (`household_owners`, `user_profiles`, `user_household_members`)

## 1) Create a Supabase project

From **Project Settings → API**, copy:

- `Project URL` → `SUPABASE_URL` / `VITE_SUPABASE_URL`
- `publishable` key → `VITE_SUPABASE_PUBLISHABLE_KEY`
- `secret` key → `SUPABASE_SECRET_KEY` (server-side only)

## 2) Enable email/password authentication

1. Go to **Authentication → Providers → Email**.
2. Enable Email provider.
3. Disable email confirmations for non-production test projects if you need fast Playwright/demo sign-ins.
4. Keep production confirmation + reset flows enabled.

## 3) Configure environment variables

### API (`/home/runner/work/family-butler-v2/family-butler-v2/api/.env`)

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `DEFAULT_HOLIDAY_REGION` (optional, default `CH`)
- `DEMO_HOUSEHOLD_ID` (optional, default `00000000-0000-0000-0000-000000000001`)

### Frontend (`/home/runner/work/family-butler-v2/family-butler-v2/frontend/.env`)

- `VITE_API_BASE_URL` (example: `http://localhost:7071`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_HOUSEHOLD_ID` (admin local default)
- `VITE_DEMO_HOUSEHOLD_ID` (demo household id)

## 4) Create/upgrade schema in Supabase SQL Editor

```sql
create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key,
  name text not null,
  holiday_region text not null default 'CH',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_owners (
  household_id uuid primary key references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade
);

create unique index if not exists idx_household_owners_user_household
  on public.household_owners (user_id, household_id);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_household_id uuid references public.households(id) on delete set null,
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

create table if not exists public.user_household_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  household_member_id uuid not null references public.household_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, household_member_id)
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

create index if not exists idx_household_members_household_sort_order
  on public.household_members (household_id, sort_order);

create index if not exists idx_contacts_household_name
  on public.contacts (household_id, first_name, last_name);

insert into public.households (id, name, holiday_region)
values ('00000000-0000-0000-0000-000000000001', 'Family Butler', 'CH')
on conflict (id) do nothing;
```

## 5) Add Row Level Security policies (recommended)

The API already enforces access server-side, and these policies provide defense-in-depth for direct DB use.

```sql
alter table public.households enable row level security;
alter table public.household_owners enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_household_members enable row level security;
alter table public.household_members enable row level security;
alter table public.contacts enable row level security;

drop policy if exists household_owner_read on public.households;
create policy household_owner_read on public.households
for select using (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = households.id
      and ho.user_id = auth.uid()
  )
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin') = 'demouser'
    and households.id = '00000000-0000-0000-0000-000000000001'
  )
);

drop policy if exists household_owner_write on public.households;
create policy household_owner_write on public.households
for all using (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = households.id
      and ho.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = households.id
      and ho.user_id = auth.uid()
  )
);

drop policy if exists household_owners_self_read on public.household_owners;
create policy household_owners_self_read on public.household_owners
for select using (user_id = auth.uid());

drop policy if exists user_profiles_self_access on public.user_profiles;
create policy user_profiles_self_access on public.user_profiles
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_household_members_self_read on public.user_household_members;
create policy user_household_members_self_read on public.user_household_members
for select using (user_id = auth.uid());

drop policy if exists household_members_access on public.household_members;
create policy household_members_access on public.household_members
for select using (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = household_members.household_id
      and ho.user_id = auth.uid()
  )
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin') = 'demouser'
    and household_members.household_id = '00000000-0000-0000-0000-000000000001'
  )
);

drop policy if exists household_members_owner_write on public.household_members;
create policy household_members_owner_write on public.household_members
for all using (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = household_members.household_id
      and ho.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = household_members.household_id
      and ho.user_id = auth.uid()
  )
);

drop policy if exists contacts_access on public.contacts;
create policy contacts_access on public.contacts
for select using (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = contacts.household_id
      and ho.user_id = auth.uid()
  )
  or (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'admin') = 'demouser'
    and contacts.household_id = '00000000-0000-0000-0000-000000000001'
  )
);

drop policy if exists contacts_owner_write on public.contacts;
create policy contacts_owner_write on public.contacts
for all using (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = contacts.household_id
      and ho.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_owners ho
    where ho.household_id = contacts.household_id
      and ho.user_id = auth.uid()
  )
);
```

## 6) Create users and roles

Use Supabase Auth users. Set role in `app_metadata.role`:

- missing or any other value => treated as `admin` (default)
- `demouser` => read-only demo experience

Example in SQL editor (non-production only; adapt as needed):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'demouser')
where email = 'demo@example.com';
```

For each admin household, create ownership:

```sql
insert into public.household_owners (household_id, user_id)
values ('00000000-0000-0000-0000-000000000001', '<admin-auth-user-id>')
on conflict (household_id) do update set user_id = excluded.user_id;
```

Optionally link a user to one or more `household_members` entries (used to offer additional default household choices in settings):

```sql
insert into public.user_household_members (user_id, household_member_id)
values ('<auth-user-id>', '<household-member-id>')
on conflict (user_id, household_member_id) do nothing;
```

## 7) Demo testing best practice (non-production)

Do **not** bypass auth in app code for tests.  
Best practice: create a dedicated non-production demo account and sign in through the normal UI.

- Give demo account `app_metadata.role = demouser`
- Keep credentials in secret stores only (GitHub/Azure secrets), never in repo
- Use Playwright MCP to log in with that account and verify read-only behavior

## 8) Verify locally

1. `npm install`
2. `npm run dev`
3. Sign in through the UI
4. Verify:
   - Admin can register/sign in and receives an auto-provisioned default household on first authenticated load
   - Admin can load/update owned households and create a new household via `PUT /api/households/{new-id}`
   - `GET /api/user-settings` returns available households and default household id
   - `PUT /api/user-settings` updates the default household used in Settings
   - Demo user can only read `Family Butler` household and cannot update/delete
   - `GET /api/health?checks=1` returns healthy when env is configured

## 9) Production checklist

1. Configure all API and frontend env vars in Azure Static Web Apps.
2. Keep `SUPABASE_SECRET_KEY` server-side only.
3. Ensure demo account is non-production only.
4. Verify sign-in, admin permissions, and demo read-only behavior after deploy.
