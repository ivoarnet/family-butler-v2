-- Run after the core tables in docs/SUPABASE.md.
begin;

create table if not exists public.parenting_time_parties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid references public.household_members(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

alter table public.parenting_time_parties
  add column if not exists active boolean not null default true;

alter table public.parenting_time_parties
  add column if not exists member_id uuid references public.household_members(id) on delete set null;

create table if not exists public.parenting_time_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  effective_from date not null,
  time_zone text not null default 'UTC',
  recurrence_mode text not null check (recurrence_mode in ('weekly', 'alternating')),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

-- Keep databases that applied an earlier draft migration writable without
-- relying on or requiring the former default-party column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parenting_time_plans'
      and column_name = 'default_party_id'
  ) then
    alter table public.parenting_time_plans alter column default_party_id drop not null;
  end if;
end;
$$;

create table if not exists public.parenting_time_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_id uuid not null,
  party_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  label text not null check (length(trim(label)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, plan_id)
    references public.parenting_time_plans(household_id, id) on delete cascade,
  foreign key (household_id, party_id)
    references public.parenting_time_parties(household_id, id),
  check (end_at > start_at)
);

create index if not exists idx_parenting_time_changes_household_range
  on public.parenting_time_changes (household_id, start_at, end_at);

create or replace function public.validate_parenting_time_plan()
returns trigger language plpgsql set search_path = public as $$
declare
  rule jsonb;
  rule_party uuid;
  start_minute integer;
  end_minute integer;
begin
  if jsonb_typeof(new.rules) <> 'array' or jsonb_array_length(new.rules) > 100 then
    raise exception 'parenting-time rules must be an array with at most 100 entries';
  end if;
  for rule in select value from jsonb_array_elements(new.rules)
  loop
    rule_party := (rule->>'partyId')::uuid;
    if not exists (
      select 1 from public.parenting_time_parties p
      where p.id = rule_party and p.household_id = new.household_id
    ) then
      raise exception 'parenting-time rule party is not part of this household';
    end if;
    if coalesce(rule->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(rule->>'weekday', '') !~ '^[1-7]$'
      or coalesce(rule->>'endWeekday', '') !~ '^[1-7]$'
      or coalesce(rule->>'startTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(rule->>'endTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (new.recurrence_mode = 'weekly' and rule->>'weekParity' is not null)
      or (new.recurrence_mode = 'alternating'
        and rule->>'weekParity' is not null
        and rule->>'weekParity' not in ('odd', 'even'))
    then
      raise exception 'parenting-time rule is invalid';
    end if;
    start_minute := ((rule->>'weekday')::integer - 1) * 1440
      + split_part(rule->>'startTime', ':', 1)::integer * 60
      + split_part(rule->>'startTime', ':', 2)::integer;
    end_minute := ((rule->>'endWeekday')::integer - 1) * 1440
      + split_part(rule->>'endTime', ':', 1)::integer * 60
      + split_part(rule->>'endTime', ':', 2)::integer;
    if end_minute <= start_minute then end_minute := end_minute + 7 * 1440; end if;
    if end_minute - start_minute >= 7 * 1440 then
      raise exception 'parenting-time rule must end within seven days';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists parenting_time_plan_valid on public.parenting_time_plans;
create trigger parenting_time_plan_valid before insert or update on public.parenting_time_plans
for each row execute function public.validate_parenting_time_plan();

create or replace function public.validate_parenting_time_party_member()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.member_id is not null and not exists (
    select 1 from public.household_members m
    where m.id = new.member_id and m.household_id = new.household_id
  ) then
    raise exception 'parenting party member is not part of this household';
  end if;
  return new;
end;
$$;

drop trigger if exists parenting_time_party_member_valid on public.parenting_time_parties;
create trigger parenting_time_party_member_valid before insert or update on public.parenting_time_parties
for each row execute function public.validate_parenting_time_party_member();

create or replace function public.protect_parenting_time_member_transfer()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.id <> old.id or new.household_id <> old.household_id) and exists (
    select 1 from public.parenting_time_parties p
    where p.household_id = old.household_id and p.member_id = old.id
  ) then
    raise exception 'member is linked to a parenting party';
  end if;
  return new;
end;
$$;

drop trigger if exists parenting_time_member_transfer on public.household_members;
create trigger parenting_time_member_transfer before update of id, household_id on public.household_members
for each row execute function public.protect_parenting_time_member_transfer();

create or replace function public.protect_parenting_time_party()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.parenting_time_plans p
    where p.household_id = old.household_id
      and exists (
        select 1 from jsonb_array_elements(p.rules) as item(rule)
        where item.rule->>'partyId' = old.id::text
      )
  ) or exists (
    select 1 from public.parenting_time_changes c
    where c.household_id = old.household_id and c.party_id = old.id
  ) then
    raise exception 'parenting party is referenced by a plan or one-off change';
  end if;
  return old;
end;
$$;

drop trigger if exists parenting_time_party_references on public.parenting_time_parties;
create trigger parenting_time_party_references before delete on public.parenting_time_parties
for each row execute function public.protect_parenting_time_party();

do $$
declare table_name text;
begin
  foreach table_name in array array['parenting_time_parties', 'parenting_time_plans', 'parenting_time_changes']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists parenting_time_household_owner on public.%I', table_name);
    execute format(
      'create policy parenting_time_household_owner on public.%I for all to authenticated
       using (exists (select 1 from public.households h where h.id = household_id and h.created_by_user_id = auth.uid()))
       with check (exists (select 1 from public.households h where h.id = household_id and h.created_by_user_id = auth.uid()))',
      table_name
    );
  end loop;
end;
$$;

commit;
