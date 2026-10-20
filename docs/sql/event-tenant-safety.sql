begin;

create or replace function public.prevent_household_resource_transfer()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception using
      errcode = '42501',
      message = 'resource is not authorized for this household';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_household_member_transfer on public.household_members;
create trigger protect_household_member_transfer
  before update of household_id on public.household_members
  for each row execute function public.prevent_household_resource_transfer();

drop trigger if exists protect_contact_transfer on public.contacts;
create trigger protect_contact_transfer
  before update of household_id on public.contacts
  for each row execute function public.prevent_household_resource_transfer();

drop trigger if exists protect_event_type_transfer on public.event_types;
create trigger protect_event_type_transfer
  before update of household_id on public.event_types
  for each row execute function public.prevent_household_resource_transfer();

drop trigger if exists protect_event_transfer on public.events;
create trigger protect_event_transfer
  before update of household_id on public.events
  for each row execute function public.prevent_household_resource_transfer();

drop trigger if exists protect_day_configuration_transfer on public.day_configurations;
create trigger protect_day_configuration_transfer
  before update of household_id on public.day_configurations
  for each row execute function public.prevent_household_resource_transfer();

create or replace function public.replace_household_events(p_household_id uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_ids uuid[];
  v_event_count bigint;
  v_unique_event_count bigint;
  v_written_count bigint;
begin
  if p_household_id is null or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'event replacement payload is invalid';
  end if;

  select count(*), count(distinct (event.value ->> 'id')::uuid)
    into v_event_count, v_unique_event_count
    from jsonb_array_elements(p_events) as event(value);

  if v_event_count <> v_unique_event_count
     or exists (
       select 1
       from jsonb_array_elements(p_events) as event(value)
       where event.value ->> 'id' is null
     ) then
    raise exception using errcode = '22023', message = 'event IDs must be present and unique';
  end if;

  select coalesce(array_agg((event.value ->> 'id')::uuid), '{}'::uuid[])
    into v_event_ids
    from jsonb_array_elements(p_events) as event(value);

  delete from public.events
    where household_id = p_household_id
      and not (id = any(v_event_ids));

  insert into public.events as existing (
    id, household_id, title, event_date, end_date, member_ids, all_day,
    start_time, end_time, event_type_id, repeat_rule, location, notes
  )
  select
    incoming.id, p_household_id, incoming.title, incoming.event_date, incoming.end_date,
    incoming.member_ids, incoming.all_day, incoming.start_time, incoming.end_time,
    incoming.event_type_id, incoming.repeat_rule, incoming.location, incoming.notes
  from jsonb_to_recordset(p_events) as incoming(
    id uuid,
    title text,
    event_date date,
    end_date date,
    member_ids uuid[],
    all_day boolean,
    start_time time,
    end_time time,
    event_type_id uuid,
    repeat_rule text,
    location text,
    notes text
  )
  on conflict (id) do update set
    title = excluded.title,
    event_date = excluded.event_date,
    end_date = excluded.end_date,
    member_ids = excluded.member_ids,
    all_day = excluded.all_day,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    event_type_id = excluded.event_type_id,
    repeat_rule = excluded.repeat_rule,
    location = excluded.location,
    notes = excluded.notes,
    updated_at = now()
  where existing.household_id = p_household_id;

  get diagnostics v_written_count = row_count;
  if v_written_count <> v_event_count then
    raise exception using
      errcode = '42501',
      message = 'event id is not authorized for this household';
  end if;
end;
$$;

revoke all on function public.replace_household_events(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_household_events(uuid, jsonb) to service_role;

commit;
