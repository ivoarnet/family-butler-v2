begin;

create table if not exists public.household_revisions (
  household_id uuid primary key references public.households(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.household_revisions enable row level security;
revoke all privileges on table public.household_revisions from public, anon, authenticated;
grant select on table public.household_revisions to service_role;

alter table public.household_members drop constraint if exists household_members_household_id_sort_order_key;
alter table public.household_members
  add constraint household_members_household_id_sort_order_key
  unique (household_id, sort_order) deferrable initially deferred;
alter table public.event_types drop constraint if exists event_types_household_id_sort_order_key;
alter table public.event_types
  add constraint event_types_household_id_sort_order_key
  unique (household_id, sort_order) deferrable initially deferred;

create or replace function public.mutate_household_entity(
  p_household_id uuid,
  p_expected_revision bigint,
  p_entity_type text,
  p_operation text,
  p_entity_id uuid,
  p_entity jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_revision bigint;
  v_written_count bigint;
  v_previous_sort_order integer;
  v_target_sort_order integer;
begin
  if p_household_id is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_entity_id is null
     or p_operation not in ('upsert', 'delete') then
    raise exception using errcode = '22023', message = 'entity mutation command is invalid';
  end if;

  insert into public.household_revisions (household_id)
    values (p_household_id)
    on conflict (household_id) do nothing;

  select revision into v_revision
    from public.household_revisions
    where household_id = p_household_id
    for update;

  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'stale household revision';
  end if;

  if p_entity_type = 'householdName' and p_operation = 'upsert' then
    update public.households
      set name = p_entity ->> 'householdName', updated_at = now()
      where id = p_household_id;
  elsif p_entity_type = 'familyMember' and p_operation = 'upsert' then
    v_target_sort_order := coalesce((p_entity ->> 'order')::integer, 0);
    select sort_order into v_previous_sort_order
      from public.household_members where id = p_entity_id and household_id = p_household_id;
    if found then
      if v_target_sort_order > v_previous_sort_order then
        update public.household_members set sort_order = sort_order - 1
          where household_id = p_household_id and id <> p_entity_id
            and sort_order > v_previous_sort_order and sort_order <= v_target_sort_order;
      elsif v_target_sort_order < v_previous_sort_order then
        update public.household_members set sort_order = sort_order + 1
          where household_id = p_household_id and id <> p_entity_id
            and sort_order >= v_target_sort_order and sort_order < v_previous_sort_order;
      end if;
    else
      update public.household_members set sort_order = sort_order + 1
        where household_id = p_household_id and sort_order >= v_target_sort_order;
    end if;
    insert into public.household_members as existing (
      id, household_id, first_name, role, is_child, hatch_parenting_away,
      school_building, school_class, avatar_color, visible_in_calendar, sort_order
    ) values (
      p_entity_id, p_household_id, p_entity ->> 'firstName', p_entity ->> 'role',
      coalesce((p_entity ->> 'isChild')::boolean, false),
      coalesce((p_entity ->> 'hatchParentingAway')::boolean, false),
      p_entity ->> 'schoolBuilding', p_entity ->> 'schoolClass',
      coalesce(p_entity ->> 'avatarColor', '#3b82f6'),
      coalesce((p_entity ->> 'visibleInCalendar')::boolean, true),
      coalesce((p_entity ->> 'order')::integer, 0)
    )
    on conflict (id) do update set
      first_name = excluded.first_name, role = excluded.role, is_child = excluded.is_child,
      hatch_parenting_away = excluded.hatch_parenting_away, school_building = excluded.school_building,
      school_class = excluded.school_class, avatar_color = excluded.avatar_color,
      visible_in_calendar = excluded.visible_in_calendar, sort_order = excluded.sort_order,
      updated_at = now()
    where existing.household_id = p_household_id;
  elsif p_entity_type = 'contact' and p_operation = 'upsert' then
    insert into public.contacts as existing (
      id, household_id, first_name, last_name, birth_day, birth_month, birth_year, email, mobile_phone
    ) values (
      p_entity_id, p_household_id, p_entity ->> 'firstName', p_entity ->> 'lastName',
      (p_entity ->> 'birthDay')::smallint, (p_entity ->> 'birthMonth')::smallint,
      (p_entity ->> 'birthYear')::smallint, p_entity ->> 'email', p_entity ->> 'mobilePhone'
    )
    on conflict (id) do update set
      first_name = excluded.first_name, last_name = excluded.last_name, birth_day = excluded.birth_day,
      birth_month = excluded.birth_month, birth_year = excluded.birth_year, email = excluded.email,
      mobile_phone = excluded.mobile_phone, updated_at = now()
    where existing.household_id = p_household_id;
  elsif p_entity_type = 'eventType' and p_operation = 'upsert' then
    v_target_sort_order := coalesce((p_entity ->> 'sortOrder')::integer, 0);
    select sort_order into v_previous_sort_order
      from public.event_types where id = p_entity_id and household_id = p_household_id;
    if found then
      if v_target_sort_order > v_previous_sort_order then
        update public.event_types set sort_order = sort_order - 1
          where household_id = p_household_id and id <> p_entity_id
            and sort_order > v_previous_sort_order and sort_order <= v_target_sort_order;
      elsif v_target_sort_order < v_previous_sort_order then
        update public.event_types set sort_order = sort_order + 1
          where household_id = p_household_id and id <> p_entity_id
            and sort_order >= v_target_sort_order and sort_order < v_previous_sort_order;
      end if;
    else
      update public.event_types set sort_order = sort_order + 1
        where household_id = p_household_id and sort_order >= v_target_sort_order;
    end if;
    insert into public.event_types as existing (id, household_id, name, icon, color, sort_order)
    values (
      p_entity_id, p_household_id, p_entity ->> 'name', p_entity ->> 'icon',
      p_entity ->> 'color', coalesce((p_entity ->> 'sortOrder')::integer, 0)
    )
    on conflict (id) do update set
      name = excluded.name, icon = excluded.icon, color = excluded.color,
      sort_order = excluded.sort_order, updated_at = now()
    where existing.household_id = p_household_id;
  elsif p_entity_type = 'event' and p_operation = 'upsert' then
    insert into public.events as existing (
      id, household_id, title, event_date, end_date, member_ids, all_day, start_time, end_time,
      event_type_id, repeat_rule, location, notes
    ) values (
      p_entity_id, p_household_id, p_entity ->> 'title', (p_entity ->> 'date')::date,
      (p_entity ->> 'endDate')::date,
      array(select jsonb_array_elements_text(p_entity -> 'memberIds')::uuid),
      coalesce((p_entity ->> 'allDay')::boolean, true), (p_entity ->> 'startTime')::time,
      (p_entity ->> 'endTime')::time, (p_entity ->> 'eventTypeId')::uuid,
      p_entity ->> 'repeatRule', p_entity ->> 'location', p_entity ->> 'notes'
    )
    on conflict (id) do update set
      title = excluded.title, event_date = excluded.event_date, end_date = excluded.end_date,
      member_ids = excluded.member_ids, all_day = excluded.all_day, start_time = excluded.start_time,
      end_time = excluded.end_time, event_type_id = excluded.event_type_id,
      repeat_rule = excluded.repeat_rule, location = excluded.location, notes = excluded.notes,
      updated_at = now()
    where existing.household_id = p_household_id;
  elsif p_entity_type = 'dayConfiguration' and p_operation = 'upsert' then
    insert into public.day_configurations as existing (id, household_id, category, start_date, end_date, label)
    values (
      p_entity_id, p_household_id, p_entity ->> 'category', (p_entity ->> 'startDate')::date,
      (p_entity ->> 'endDate')::date, p_entity ->> 'label'
    )
    on conflict (id) do update set
      category = excluded.category, start_date = excluded.start_date,
      end_date = excluded.end_date, label = excluded.label, updated_at = now()
    where existing.household_id = p_household_id;
  elsif p_operation = 'delete' then
    if p_entity_type = 'familyMember' then
      select sort_order into v_previous_sort_order
        from public.household_members where id = p_entity_id and household_id = p_household_id;
      if found then
        update public.household_members set sort_order = sort_order - 1
          where household_id = p_household_id and sort_order > v_previous_sort_order;
      end if;
      delete from public.household_members where id = p_entity_id and household_id = p_household_id;
    elsif p_entity_type = 'contact' then
      delete from public.contacts where id = p_entity_id and household_id = p_household_id;
    elsif p_entity_type = 'eventType' then
      select sort_order into v_previous_sort_order
        from public.event_types where id = p_entity_id and household_id = p_household_id;
      if found then
        update public.event_types set sort_order = sort_order - 1
          where household_id = p_household_id and sort_order > v_previous_sort_order;
      end if;
      delete from public.event_types where id = p_entity_id and household_id = p_household_id;
    elsif p_entity_type = 'event' then
      delete from public.events where id = p_entity_id and household_id = p_household_id;
    elsif p_entity_type = 'dayConfiguration' then
      delete from public.day_configurations where id = p_entity_id and household_id = p_household_id;
    else
      raise exception using errcode = '22023', message = 'entity type is invalid';
    end if;
  else
    raise exception using errcode = '22023', message = 'entity type or operation is invalid';
  end if;

  get diagnostics v_written_count = row_count;
  if v_written_count = 0 and p_operation = 'upsert' then
    raise exception using errcode = '42501', message = 'entity is not authorized for this household';
  end if;

  update public.household_revisions
    set revision = revision + 1, updated_at = now()
    where household_id = p_household_id
    returning revision into v_revision;

  return v_revision;
end;
$$;

revoke all on function public.mutate_household_entity(uuid, bigint, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mutate_household_entity(uuid, bigint, text, text, uuid, jsonb) to service_role;

commit;
