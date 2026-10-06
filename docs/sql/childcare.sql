-- Run after the core tables in docs/SUPABASE.md.
begin;

create table if not exists public.childcare_providers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('grandparent', 'individual_carer', 'daycare', 'school_programme', 'other')),
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

alter table public.childcare_providers
  add column if not exists active boolean not null default true;

create table if not exists public.childcare_arrangements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider_id uuid not null,
  child_ids uuid[] not null check (cardinality(child_ids) > 0 and array_position(child_ids, null) is null),
  weekdays smallint[] not null check (
    cardinality(weekdays) > 0 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    and array_position(weekdays, null) is null
  ),
  start_date date not null,
  end_date date,
  all_day boolean not null,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, provider_id) references public.childcare_providers(household_id, id),
  check (end_date is null or end_date >= start_date),
  check (
    (all_day and start_time is null and end_time is null)
    or (not all_day and start_time is not null and end_time is not null and end_time > start_time)
  )
);

create table if not exists public.childcare_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  arrangement_id uuid not null,
  original_date date not null,
  action text not null check (action in ('add', 'cancel', 'replace', 'move')),
  moved_date date,
  provider_id uuid,
  all_day boolean,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  unique (household_id, arrangement_id, original_date),
  foreign key (household_id, arrangement_id)
    references public.childcare_arrangements(household_id, id) on delete cascade,
  foreign key (household_id, provider_id) references public.childcare_providers(household_id, id),
  check (
    (action = 'move' and moved_date is not null and moved_date <> original_date)
    or (action <> 'move' and moved_date is null)
  ),
  check (
    (all_day is null and start_time is null and end_time is null)
    or (all_day is true and start_time is null and end_time is null)
    or (all_day is false and start_time is not null and end_time is not null and end_time > start_time)
  ),
  check (action <> 'cancel' or (provider_id is null and all_day is null)),
  check (action <> 'replace' or provider_id is not null or all_day is not null),
  constraint childcare_overrides_added_fields_check
    check (action <> 'add' or (provider_id is null and all_day is null and start_time is null and end_time is null))
);

alter table public.childcare_overrides
  drop constraint if exists childcare_overrides_action_check;
alter table public.childcare_overrides
  add constraint childcare_overrides_action_check check (action in ('add', 'cancel', 'replace', 'move'));
alter table public.childcare_overrides
  drop constraint if exists childcare_overrides_added_fields_check;
alter table public.childcare_overrides
  add constraint childcare_overrides_added_fields_check
  check (action <> 'add' or (provider_id is null and all_day is null and start_time is null and end_time is null));

-- Arrays match the existing event member model; validate every child against its household.
create or replace function public.validate_childcare_children()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Serialize child-reference validation with member deletion/transfer in this household.
  perform pg_advisory_xact_lock(hashtextextended(new.household_id::text, 0));
  if exists (
    select 1 from unnest(new.child_ids) child_id
    where not exists (
      select 1 from public.household_members m
      where m.id = child_id and m.household_id = new.household_id
    )
  ) then
    raise exception 'child is not part of this household';
  end if;
  if exists (
    select 1 from public.childcare_overrides o
    where o.arrangement_id = new.id and o.household_id = new.household_id and o.action <> 'add'
      and (o.original_date < new.start_date
        or (new.end_date is not null and o.original_date > new.end_date)
        or not (extract(isodow from o.original_date)::smallint = any(new.weekdays)))
  ) then
    raise exception 'schedule change would remove an occurrence with a one-off change';
  end if;
  return new;
end;
$$;

drop trigger if exists childcare_children_valid on public.childcare_arrangements;
create trigger childcare_children_valid before insert or update on public.childcare_arrangements
for each row execute function public.validate_childcare_children();

-- Do not leave dangling child references when the existing household editor removes members.
create or replace function public.protect_childcare_member()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'DELETE' and new.household_id = old.household_id and new.id = old.id then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(old.household_id::text, 0));
  if exists (select 1 from public.households where id = old.household_id)
    and exists (
      select 1 from public.childcare_arrangements
      where household_id = old.household_id and old.id = any(child_ids)
    ) then
    raise exception 'member participates in a childcare arrangement';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists childcare_member_references on public.household_members;
create trigger childcare_member_references before delete or update on public.household_members
for each row execute function public.protect_childcare_member();

create or replace function public.validate_childcare_override()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Serialize override validation with edits to its weekly arrangement.
  perform 1 from public.childcare_arrangements
  where id = new.arrangement_id and household_id = new.household_id for update;
  if (new.action = 'add' and exists (
    select 1 from public.childcare_arrangements a
    where a.id = new.arrangement_id and a.household_id = new.household_id
      and new.original_date >= a.start_date
      and (a.end_date is null or new.original_date <= a.end_date)
      and extract(isodow from new.original_date)::smallint = any(a.weekdays)
  )) then
    raise exception 'added date is already a scheduled occurrence';
  elsif new.action <> 'add' and not exists (
    select 1 from public.childcare_arrangements a
    where a.id = new.arrangement_id and a.household_id = new.household_id
      and new.original_date >= a.start_date
      and (a.end_date is null or new.original_date <= a.end_date)
      and extract(isodow from new.original_date)::smallint = any(a.weekdays)
  ) then
    raise exception 'originalDate is not a scheduled occurrence';
  end if;
  return new;
end;
$$;

drop trigger if exists childcare_override_valid on public.childcare_overrides;
create trigger childcare_override_valid before insert or update on public.childcare_overrides
for each row execute function public.validate_childcare_override();

-- The server uses its secret key, but authenticated direct access is also owner-scoped.
do $$
declare table_name text;
begin
  foreach table_name in array array['childcare_providers', 'childcare_arrangements', 'childcare_overrides']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists childcare_household_owner on public.%I', table_name);
    execute format(
      'create policy childcare_household_owner on public.%I for all to authenticated
       using (exists (select 1 from public.households h where h.id = household_id and h.created_by_user_id = auth.uid()))
       with check (exists (select 1 from public.households h where h.id = household_id and h.created_by_user_id = auth.uid()))',
      table_name
    );
  end loop;
end;
$$;

commit;
