create table if not exists public.agent_execution_budget (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);

create index if not exists agent_execution_budget_user_started_idx
  on public.agent_execution_budget (user_id, started_at desc);

create index if not exists agent_execution_budget_household_started_idx
  on public.agent_execution_budget (household_id, started_at desc);

create index if not exists agent_execution_budget_started_idx
  on public.agent_execution_budget (started_at);

alter table public.agent_execution_budget enable row level security;
revoke all on public.agent_execution_budget from public, anon, authenticated;

create or replace function public.reserve_agent_execution(
  p_user_id uuid,
  p_household_id uuid,
  p_execution_id uuid,
  p_user_daily_limit integer,
  p_household_daily_limit integer,
  p_user_concurrency_limit integer,
  p_household_concurrency_limit integer,
  p_reservation_timeout_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  user_usage bigint;
  household_usage bigint;
  user_active bigint;
  household_active bigint;
begin
  if p_user_id is null or p_household_id is null or p_execution_id is null
    or p_user_daily_limit is null or p_household_daily_limit is null
    or p_user_concurrency_limit is null or p_household_concurrency_limit is null
    or p_reservation_timeout_seconds is null
    or p_user_daily_limit < 1 or p_household_daily_limit < 1
    or p_user_concurrency_limit < 1 or p_household_concurrency_limit < 1
    or p_reservation_timeout_seconds < 1 or p_reservation_timeout_seconds > 86400 then
    raise exception 'invalid agent execution budget';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agent-user:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('agent-household:' || p_household_id::text, 0));

  delete from public.agent_execution_budget
  where started_at < v_now - interval '24 hours';

  select count(*) into user_usage
  from public.agent_execution_budget
  where user_id = p_user_id and started_at >= v_now - interval '24 hours';

  select count(*) into household_usage
  from public.agent_execution_budget
  where household_id = p_household_id and started_at >= v_now - interval '24 hours';

  select count(*) into user_active
  from public.agent_execution_budget
  where user_id = p_user_id
    and finished_at is null
    and started_at >= v_now - make_interval(secs => p_reservation_timeout_seconds);

  select count(*) into household_active
  from public.agent_execution_budget
  where household_id = p_household_id
    and finished_at is null
    and started_at >= v_now - make_interval(secs => p_reservation_timeout_seconds);

  if user_usage >= p_user_daily_limit
    or household_usage >= p_household_daily_limit
    or user_active >= p_user_concurrency_limit
    or household_active >= p_household_concurrency_limit then
    return false;
  end if;

  insert into public.agent_execution_budget (id, user_id, household_id, started_at)
  values (p_execution_id, p_user_id, p_household_id, v_now);
  return true;
end;
$$;

create or replace function public.finish_agent_execution(p_execution_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  update public.agent_execution_budget
  set finished_at = clock_timestamp()
  where id = p_execution_id and finished_at is null;
$$;

revoke all on function public.reserve_agent_execution(uuid, uuid, uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.finish_agent_execution(uuid) from public, anon, authenticated;
grant execute on function public.reserve_agent_execution(uuid, uuid, uuid, integer, integer, integer, integer, integer)
  to service_role;
grant execute on function public.finish_agent_execution(uuid) to service_role;
