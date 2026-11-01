-- Run after the core household and household_members tables. Safe to rerun.
-- This creates a NEW household-scoped table. Legacy public.tasks is never read,
-- altered, exposed by this API, or backfilled: global ownership cannot be inferred.
-- Existing task-only coin earnings are upgraded to the generic household_coin_earnings ledger.
-- Deploy only the household Tasks route; never restore the old /api/tasks route.
-- Recurring tasks require a due date. After ANY first completion, the repeat rule
-- is immutable (invalid edits return 400), even for a single task or reopened card.
-- Other edits affect only that card, not its successor.
begin;

do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.household_members'::regclass and conname = 'household_tasks_member_unique') then
    alter table public.household_members
      add constraint household_tasks_member_unique unique (household_id, id);
  end if;
end $$;

create table if not exists public.household_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(title) between 1 and 160 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  member_id uuid not null,
  coins integer not null check (coins between 0 and 1000000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  sort_order integer not null check (sort_order >= 0),
  due_date date check (due_date between date '0001-01-01' and date '9999-12-31'),
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly')),
  series_id uuid,
  completed_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  -- These immutable completion markers survive reopening, editing and successor deletion.
  first_completed_at timestamptz,
  next_task_id uuid,
  creation_payload jsonb not null,
  check (repeat_rule = 'none' or due_date is not null),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (household_id, member_id)
    references public.household_members(household_id, id) on delete no action deferrable initially immediate
);
create index if not exists household_tasks_order on public.household_tasks (household_id, status, sort_order, id);
create index if not exists household_tasks_date on public.household_tasks (household_id, due_date, member_id);
alter table public.household_tasks enable row level security;
drop policy if exists household_tasks_owner_read on public.household_tasks;
create policy household_tasks_owner_read on public.household_tasks for select to authenticated
  using (exists (select 1 from public.households h
    where h.id = household_id and h.created_by_user_id = auth.uid()));

-- Direct writes are denied even to service_role: all mutations must serialize through the RPC.
revoke all on public.household_tasks from public, anon, authenticated, service_role;
grant select (id, household_id, title, member_id, coins, status, sort_order,
  due_date, repeat_rule, series_id, completed_at, revision) on public.household_tasks to authenticated;

do $$ begin
  if to_regclass('public.household_coin_earnings') is null
    and to_regclass('public.household_task_coin_earnings') is not null then
    alter table public.household_task_coin_earnings rename to household_coin_earnings;
  end if;
end $$;

create table if not exists public.household_coin_earnings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_type text not null check (length(source_type) between 1 and 64),
  source_id uuid not null,
  series_id uuid,
  member_id uuid not null,
  coins integer not null check (coins between 0 and 1000000),
  period_start date not null,
  earned_at timestamptz not null default clock_timestamp()
);
alter table public.household_coin_earnings add column if not exists source_type text;
alter table public.household_coin_earnings add column if not exists source_id uuid;
update public.household_coin_earnings set source_type = 'task' where source_type is null;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'household_coin_earnings' and column_name = 'task_id') then
    update public.household_coin_earnings set source_id = task_id where source_id is null;
  end if;
end $$;
alter table public.household_coin_earnings alter column source_type set not null;
alter table public.household_coin_earnings alter column source_id set not null;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'household_coin_earnings' and column_name = 'task_title') then
    alter table public.household_coin_earnings drop column task_title;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'household_coin_earnings' and column_name = 'member_name') then
    alter table public.household_coin_earnings drop column member_name;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'household_coin_earnings' and column_name = 'avatar_color') then
    alter table public.household_coin_earnings drop column avatar_color;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'household_coin_earnings' and column_name = 'source_label') then
    alter table public.household_coin_earnings drop column source_label;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'household_coin_earnings' and column_name = 'task_id') then
    alter table public.household_coin_earnings drop column task_id;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.household_coin_earnings'::regclass
    and conname = 'household_coin_earnings_source_type_check') then
    alter table public.household_coin_earnings add constraint household_coin_earnings_source_type_check
      check (length(source_type) between 1 and 64);
  end if;
end $$;
drop index if exists public.household_task_coin_earnings_task;
drop index if exists public.household_task_coin_earnings_series_period;
drop index if exists public.household_task_coin_earnings_period;
create unique index if not exists household_coin_earnings_source
  on public.household_coin_earnings (household_id, source_type, source_id);
create unique index if not exists household_coin_earnings_series_period
  on public.household_coin_earnings (household_id, series_id, period_start) where series_id is not null;
create index if not exists household_coin_earnings_period
  on public.household_coin_earnings (household_id, earned_at, member_id);
alter table public.household_coin_earnings enable row level security;
revoke all on public.household_coin_earnings from public, anon, authenticated, service_role;

create or replace function public.mutate_household_task(p_household uuid, p_user uuid, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  t public.household_tasks%rowtype;
  v_id uuid;
  v_member uuid;
  v_before uuid;
  v_next uuid;
  v_title text;
  v_due date;
  v_start date;
  v_end date;
  v_rule text;
  v_status text;
  v_position integer;
  v_payload jsonb;
  v_rows jsonb;
  v_leaderboard jsonb;
  v_period_start date;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  -- Owner verification is repeated inside the transaction to close the HTTP auth/write race.
  perform 1 from public.households
    where id = p_household and created_by_user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 4096
    or p_action is null or p_action not in ('read', 'create', 'update', 'delete', 'move') then
    return jsonb_build_object('error', 'invalid request', 'status', 400);
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) k where not (
    (p_action = 'read' and k in ('memberId', 'status', 'startDate', 'endDate'))
    or (p_action = 'create' and k in ('id', 'title', 'memberId', 'coins', 'dueDate', 'repeatRule'))
    or (p_action = 'update' and k in ('id', 'revision', 'title', 'memberId', 'coins', 'dueDate', 'repeatRule', 'status'))
    or (p_action = 'delete' and k in ('id', 'revision'))
    or (p_action = 'move' and k in ('id', 'revision', 'status', 'beforeId'))
  )) then return jsonb_build_object('error', 'invalid request', 'status', 400); end if;

  if p_data ? 'memberId' then
    if jsonb_typeof(p_data->'memberId') is distinct from 'string' or not (p_data->>'memberId' ~ v_uuid) then
      return jsonb_build_object('error', 'invalid member', 'status', 400);
    end if;
    v_member := (p_data->>'memberId')::uuid;
  end if;
  if p_action = 'read' then
    v_status := p_data->>'status';
    if p_data ? 'status' and (jsonb_typeof(p_data->'status') is distinct from 'string'
      or v_status not in ('todo', 'in_progress', 'done', 'open')) then
      return jsonb_build_object('error', 'invalid status', 'status', 400);
    end if;
    if p_data ? 'startDate' or p_data ? 'endDate' then
      if jsonb_typeof(p_data->'startDate') is distinct from 'string'
        or jsonb_typeof(p_data->'endDate') is distinct from 'string'
        or not (p_data->>'startDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        or not (p_data->>'endDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        return jsonb_build_object('error', 'invalid dates', 'status', 400);
      end if;
      v_start := (p_data->>'startDate')::date;
      v_end := (p_data->>'endDate')::date;
      if v_start < date '0001-01-01' or v_end > date '9999-12-31' or v_end - v_start not between 0 and 366 then
        return jsonb_build_object('error', 'invalid dates', 'status', 400);
      end if;
    end if;
    select coalesce(jsonb_agg(to_jsonb(r) order by
      case r.status when 'todo' then 0 when 'in_progress' then 1 else 2 end, r.sort_order, r.id), '[]'::jsonb)
      into v_rows from (
        select id, household_id, title, member_id, coins, status, sort_order, due_date,
          repeat_rule, series_id, completed_at, revision
        from public.household_tasks where household_id = p_household
          and (v_member is null or member_id = v_member)
          and (v_status is null or status = v_status or (v_status = 'open' and status <> 'done'))
          and (v_start is null or due_date between v_start and v_end)
        order by case status when 'todo' then 0 when 'in_progress' then 1 else 2 end, sort_order, id
        limit 10001
      ) r;
    if jsonb_array_length(v_rows) > 10000 then
      return jsonb_build_object('error', 'task limit reached', 'status', 409);
    end if;
    with boundaries as (
      select date_trunc('week', now() at time zone 'UTC') at time zone 'UTC' as week_start,
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' as month_start
    ), week_totals as (
      select e.member_id, coalesce(max(m.first_name), 'Former member') as first_name,
        max(m.avatar_color) as avatar_color,
        sum(e.coins) as coins
      from public.household_coin_earnings e cross join boundaries b
      left join public.household_members m on m.id = e.member_id and m.household_id = e.household_id
      where e.household_id = p_household and e.earned_at >= b.week_start
      group by e.member_id having sum(e.coins) > 0
    ), month_totals as (
      select e.member_id, coalesce(max(m.first_name), 'Former member') as first_name,
        max(m.avatar_color) as avatar_color,
        sum(e.coins) as coins
      from public.household_coin_earnings e cross join boundaries b
      left join public.household_members m on m.id = e.member_id and m.household_id = e.household_id
      where e.household_id = p_household and e.earned_at >= b.month_start
      group by e.member_id having sum(e.coins) > 0
    ), week_ranked as (
      select *, row_number() over (order by coins desc, member_id) as position from week_totals
    ), month_ranked as (
      select *, row_number() over (order by coins desc, member_id) as position from month_totals
    )
    select jsonb_build_object(
      'week', coalesce((select jsonb_agg(jsonb_build_object('memberId', member_id, 'firstName', first_name,
        'avatarColor', avatar_color, 'coins', coins) order by position) from week_ranked where position <= 3), '[]'::jsonb),
      'month', coalesce((select jsonb_agg(jsonb_build_object('memberId', member_id, 'firstName', first_name,
        'avatarColor', avatar_color, 'coins', coins) order by position) from month_ranked where position <= 3), '[]'::jsonb)
    ) into v_leaderboard;
    return jsonb_build_object('tasks', v_rows, 'leaderboard', v_leaderboard);
  end if;

  if p_action <> 'create' or p_data ? 'id' then
    if jsonb_typeof(p_data->'id') is distinct from 'string' or not (p_data->>'id' ~ v_uuid) then
      return jsonb_build_object('error', 'invalid id', 'status', 400);
    end if;
    v_id := (p_data->>'id')::uuid;
  else v_id := gen_random_uuid();
  end if;
  if p_action <> 'create' then
    if jsonb_typeof(p_data->'revision') is distinct from 'number'
      or not (p_data->>'revision' ~ '^[0-9]+$')
      or (p_data->>'revision')::numeric > 2147483646 then
      return jsonb_build_object('error', 'invalid revision', 'status', 400);
    end if;
    select * into t from public.household_tasks where id = v_id and household_id = p_household;
    if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;
    if t.revision <> (p_data->>'revision')::integer then
      return jsonb_build_object('error', 'revision conflict', 'status', 409);
    end if;
  end if;
  if p_action in ('create', 'update') then
    v_title := btrim(p_data->>'title');
    v_rule := p_data->>'repeatRule';
    if jsonb_typeof(p_data->'title') is distinct from 'string'
      or length(v_title) not between 1 and 160 or p_data->>'title' ~ '[[:cntrl:]]'
      or v_member is null
      or jsonb_typeof(p_data->'coins') is distinct from 'number'
      or not (p_data->>'coins' ~ '^[0-9]+$') or (p_data->>'coins')::numeric > 1000000
      or jsonb_typeof(p_data->'repeatRule') is distinct from 'string'
      or v_rule not in ('none', 'daily', 'weekly')
      or not (p_data ? 'dueDate') then
      return jsonb_build_object('error', 'invalid task', 'status', 400);
    end if;
    if p_data->'dueDate' <> 'null'::jsonb then
      if jsonb_typeof(p_data->'dueDate') is distinct from 'string'
        or not (p_data->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        return jsonb_build_object('error', 'invalid date', 'status', 400);
      end if;
      v_due := (p_data->>'dueDate')::date;
      if v_due not between date '0001-01-01' and date '9999-12-31' then
        return jsonb_build_object('error', 'invalid date', 'status', 400);
      end if;
    end if;
    if v_rule <> 'none' and v_due is null then
      return jsonb_build_object('error', 'due date required', 'status', 400);
    end if;
    if p_action = 'update' and t.first_completed_at is not null and v_rule <> t.repeat_rule then
      return jsonb_build_object('error', 'repeat rule locked after completion', 'status', 400);
    end if;
    v_payload := jsonb_build_object('title', v_title, 'memberId', v_member,
      'coins', (p_data->>'coins')::integer, 'dueDate', v_due, 'repeatRule', v_rule);
    if p_action = 'create' then
      select * into t from public.household_tasks where id = v_id;
      if found then
        if t.household_id = p_household and t.creation_payload = v_payload then
          return jsonb_build_object('ok', true, 'id', v_id);
        end if;
        return jsonb_build_object('error', 'id conflict', 'status', 409);
      end if;
    end if;
    if not exists (select 1 from public.household_members where household_id = p_household and id = v_member) then
      return jsonb_build_object('error', 'invalid member', 'status', 400);
    end if;
  end if;
  if p_action = 'move' then
    v_status := p_data->>'status';
    if jsonb_typeof(p_data->'status') is distinct from 'string' or v_status not in ('todo', 'in_progress', 'done') then
      return jsonb_build_object('error', 'invalid status', 'status', 400);
    end if;
    if p_data ? 'beforeId' and p_data->'beforeId' <> 'null'::jsonb then
      if jsonb_typeof(p_data->'beforeId') is distinct from 'string' or not (p_data->>'beforeId' ~ v_uuid) then
        return jsonb_build_object('error', 'invalid target', 'status', 400);
      end if;
      v_before := (p_data->>'beforeId')::uuid;
      if v_before = v_id or not exists (select 1 from public.household_tasks
        where id = v_before and household_id = p_household and status = v_status) then
        return jsonb_build_object('error', 'invalid target', 'status', 400);
      end if;
    end if;
  end if;
  if p_action = 'update' then
    v_status := t.status;
    if p_data ? 'status' then
      v_status := p_data->>'status';
      if jsonb_typeof(p_data->'status') is distinct from 'string' or v_status not in ('todo', 'in_progress', 'done') then
        return jsonb_build_object('error', 'invalid status', 'status', 400);
      end if;
    end if;
  end if;

  if p_action = 'update' then
    update public.household_tasks set title = v_title, member_id = v_member, coins = (p_data->>'coins')::integer,
      due_date = v_due, repeat_rule = v_rule,
      series_id = case when v_rule <> 'none' then coalesce(series_id, id) else series_id end where id = v_id;
    select * into t from public.household_tasks where id = v_id;
    if v_status = t.status then
      update public.household_tasks set revision = revision + 1 where id = v_id;
    end if;
  end if;
  if p_action = 'delete' then delete from public.household_tasks where id = v_id;   end if;

  if p_action in ('move', 'update') and v_status = 'done' and t.status <> 'done' then
    if t.repeat_rule <> 'none' then
      v_period_start := case when t.repeat_rule = 'daily'
        then (clock_timestamp() at time zone 'UTC')::date
        else date_trunc('week', clock_timestamp() at time zone 'UTC')::date end;
      if exists (select 1 from public.household_coin_earnings
        where household_id = p_household and series_id = t.series_id and period_start = v_period_start
          and source_id <> t.id) then
        return jsonb_build_object('error', 'recurring task already completed this period', 'status', 409);
      end if;
    else
      v_period_start := (clock_timestamp() at time zone 'UTC')::date;
    end if;
    insert into public.household_coin_earnings (
      household_id, source_type, source_id, series_id, member_id, coins, period_start
    ) values (
      p_household, 'task', t.id, t.series_id, t.member_id, t.coins, v_period_start
    ) on conflict (household_id, source_type, source_id) do nothing;
  end if;

  if p_action in ('create', 'delete', 'move') or (p_action = 'update' and v_status <> t.status) then
    -- Compact both affected columns before inserting the moved card. Other cards retain revisions.
    with positions as (
      select id, (row_number() over (partition by status order by sort_order, id) - 1)::integer as position
      from public.household_tasks where household_id = p_household and id <> v_id
        and (status = 'todo' and p_action = 'create'
          or p_action in ('move', 'delete', 'update') and status in (t.status, v_status))
    )
    update public.household_tasks x set sort_order = p.position from positions p where x.id = p.id;
    if p_action = 'create' then
      if (select count(*) from public.household_tasks where household_id = p_household) >= 10000 then
        raise exception using errcode = 'P0001', message = 'task limit';
      end if;
      select count(*) into v_position from public.household_tasks where household_id = p_household and status = 'todo';
      insert into public.household_tasks(id, household_id, title, member_id, coins, sort_order, due_date, repeat_rule, series_id, creation_payload)
        values (v_id, p_household, v_title, v_member, (p_data->>'coins')::integer, v_position, v_due,
          v_rule, case when v_rule <> 'none' then v_id else null end, v_payload);
    elsif p_action in ('move', 'update') then
      if v_before is null then
        select count(*) into v_position from public.household_tasks
          where household_id = p_household and status = v_status and id <> v_id;
      else select sort_order into v_position from public.household_tasks where id = v_before;
      end if;
      update public.household_tasks set sort_order = sort_order + 1
        where household_id = p_household and status = v_status and id <> v_id and sort_order >= v_position;
      update public.household_tasks set status = v_status, sort_order = v_position, revision = revision + 1,
        completed_at = case when v_status = 'done' then coalesce(completed_at, clock_timestamp()) else null end,
        first_completed_at = case when v_status = 'done' then coalesce(first_completed_at, clock_timestamp())
          else first_completed_at end
        where id = v_id;
      if v_status = 'done' and t.first_completed_at is null and t.repeat_rule <> 'none' and t.next_task_id is null then
        if (select count(*) from public.household_tasks where household_id = p_household) >= 10000 then
          raise exception using errcode = 'P0001', message = 'task limit';
        end if;
        v_next := gen_random_uuid();
        v_due := t.due_date + case t.repeat_rule when 'daily' then 1 else 7 end;
        v_payload := jsonb_build_object('title', t.title, 'memberId', t.member_id,
          'coins', t.coins, 'dueDate', v_due, 'repeatRule', t.repeat_rule);
        select count(*) into v_position from public.household_tasks where household_id = p_household and status = 'todo';
        insert into public.household_tasks(id, household_id, title, member_id, coins, sort_order, due_date, repeat_rule, series_id, creation_payload)
          values (v_next, p_household, t.title, t.member_id, t.coins, v_position, v_due, t.repeat_rule,
            coalesce(t.series_id, t.id), v_payload);
        update public.household_tasks set next_task_id = v_next where id = v_id;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  -- Exceptions roll back ALL writes in this function, including reordering and completion.
  when unique_violation or numeric_value_out_of_range or raise_exception then
    return jsonb_build_object('error', 'conflict', 'status', 409);
  when foreign_key_violation or check_violation or invalid_text_representation
    or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('error', 'invalid request', 'status', 400);
  when others then return jsonb_build_object('error', 'unavailable', 'status', 500);
end;
$$;
revoke all on function public.mutate_household_task(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.mutate_household_task(uuid, uuid, text, jsonb) to service_role;

commit;
