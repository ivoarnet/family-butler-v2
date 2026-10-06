-- Run after the core tables in docs/SUPABASE.md; existing parenting SQL need not be rerun.
-- On upgrades apply before discarding any legacy parenting calendar preferences.
-- Apply before deploying the member-details API. Roles remain unrestricted text.
begin;

do $$
begin
  -- Column creation is the migration marker: never reclassify an opted-out child
  -- on subsequent runs, even when obsolete calendar selections remain stored.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'household_members'
      and column_name = 'is_child'
  ) then
    alter table public.household_members
      add column is_child boolean not null default false;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'parenting_time_calendar_settings'
        and column_name = 'child_member_ids'
    ) then
      execute '
        update public.household_members m set is_child = true
        where exists (
          select 1 from public.parenting_time_calendar_settings s
          where s.household_id = m.household_id and m.id = any(s.child_member_ids)
        )';
    end if;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'household_members'
      and column_name = 'hatch_parenting_away'
  ) then
    alter table public.household_members
      add column hatch_parenting_away boolean not null default false;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'parenting_time_calendar_settings'
        and column_name = 'child_member_ids'
    ) then
      -- If classification was already migrated, respect any subsequent opt-out.
      execute '
        update public.household_members m set hatch_parenting_away = true
        where m.is_child and exists (
          select 1 from public.parenting_time_calendar_settings s
          where s.household_id = m.household_id and s.show_away_hatching
            and m.id = any(s.child_member_ids)
        )';
    end if;
  end if;
end;
$$;

alter table public.household_members
  add column if not exists school_building text,
  add column if not exists school_class text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.household_members'::regclass
      and conname = 'household_members_school_building_length'
  ) then
    alter table public.household_members
      add constraint household_members_school_building_length
      check (school_building is null or length(school_building) <= 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.household_members'::regclass
      and conname = 'household_members_school_class_length'
  ) then
    alter table public.household_members
      add constraint household_members_school_class_length
      check (school_class is null or length(school_class) <= 50);
  end if;
end;
$$;

commit;
