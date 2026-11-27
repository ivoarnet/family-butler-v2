-- Run after the core household schema and parenting-time.sql. Safe to rerun.
-- All access is through service-role-only RPCs; raw bearer tokens are never stored.
-- Apply edge/IP throttling separately: the distributed per-link budget below only
-- limits successful bearer lookups and does not protect the HTTP/auth/DB perimeter.
-- Reapply before deploying view-count-aware API code. Existing links start at zero.
-- Only a successful resolve with a fresh UUIDv4 counts; omitted UUIDs are refreshes.
-- Retain the last 1,024 distinct successful view UUIDs per link, never IPs/user agents.
-- An evicted UUID may count again. Totals persist independently and saturate at the
-- JavaScript safe-integer maximum. Deleting a link removes its deduplication data.
begin;

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type = 'parenting_changes'),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null check (isfinite(expires_at)),
  note text not null default '' check (length(note) <= 1000),
  categories text[] not null check (
    cardinality(categories) between 1 and 3 and
    array_ndims(categories) = 1 and array_position(categories, null) is null and
    categories <@ array['holiday', 'adjusted_handover', 'diverse']::text[] and
    cardinality(categories) =
      (case when 'holiday' = any(categories) then 1 else 0 end +
       case when 'adjusted_handover' = any(categories) then 1 else 0 end +
       case when 'diverse' = any(categories) then 1 else 0 end)
  ),
  created_at timestamptz not null default clock_timestamp(),
  read_window timestamptz not null default clock_timestamp(),
  read_count integer not null default 0 check (read_count between 0 and 60)
);
create index if not exists share_links_owner on public.share_links (household_id, created_by_user_id, created_at, id);
alter table public.share_links
  add column if not exists view_count bigint not null default 0
    check (view_count between 0 and 9007199254740991),
  add column if not exists recent_view_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(recent_view_ids) <= 1024 and
      (cardinality(recent_view_ids) = 0 or array_ndims(recent_view_ids) = 1) and
      array_position(recent_view_ids, null) is null);
alter table public.share_links enable row level security;
revoke all on public.share_links from public, anon, authenticated, service_role;

create or replace function public.share_link_metadata(p_link public.share_links)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'id', p_link.id, 'resourceType', p_link.resource_type, 'expiresAt', p_link.expires_at,
    'note', p_link.note, 'categories', p_link.categories, 'createdAt', p_link.created_at,
    'viewCount', p_link.view_count
  );
$$;

create or replace function public.manage_share_links(
  p_household uuid, p_user uuid, p_action text, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link public.share_links;
  v_links jsonb;
  v_expiry timestamptz;
  v_categories text[];
begin
  perform 1 from public.households
    where id = p_household and created_by_user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;
  if p_action = 'list' then
    select coalesce(jsonb_agg(public.share_link_metadata(s) order by s.created_at desc, s.id), '[]'::jsonb)
      into v_links from (
        select * from public.share_links
        where household_id = p_household and created_by_user_id = p_user
        order by created_at desc, id limit 501
      ) s;
    if jsonb_array_length(v_links) > 500 then
      return jsonb_build_object('error', 'limit reached', 'status', 409);
    end if;
    return jsonb_build_object('links', v_links);
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_action not in ('create', 'update', 'delete') then
    return jsonb_build_object('error', 'invalid request', 'status', 400);
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) k where not (
    (p_action = 'create' and k in ('resourceType', 'expiresAt', 'note', 'categories', 'digest')) or
    (p_action = 'update' and k in ('id', 'expiresAt', 'note')) or
    (p_action = 'delete' and k = 'id')
  )) then return jsonb_build_object('error', 'invalid request', 'status', 400); end if;
  if p_action <> 'create' then
    select * into v_link from public.share_links
      where id = (p_data->>'id')::uuid and household_id = p_household and created_by_user_id = p_user
      for update;
    if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;
  end if;
  if p_action = 'delete' then
    delete from public.share_links where id = v_link.id;
    return jsonb_build_object('ok', true);
  end if;
  if p_data ? 'note' and (jsonb_typeof(p_data->'note') <> 'string' or length(p_data->>'note') > 1000) then
    return jsonb_build_object('error', 'invalid request', 'status', 400);
  end if;
  if p_action = 'create' or p_data ? 'expiresAt' then
    if jsonb_typeof(p_data->'expiresAt') is distinct from 'string' or
      (p_data->>'expiresAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?Z$' then
      return jsonb_build_object('error', 'invalid request', 'status', 400);
    end if;
    v_expiry := (p_data->>'expiresAt')::timestamptz;
    if not isfinite(v_expiry) or (p_action = 'create' and v_expiry <= clock_timestamp()) then
      return jsonb_build_object('error', 'invalid request', 'status', 400);
    end if;
  end if;
  if p_action = 'create' then
    if p_data->>'resourceType' is distinct from 'parenting_changes' or
      jsonb_typeof(p_data->'digest') is distinct from 'string' or
      (p_data->>'digest') !~ '^[0-9a-f]{64}$' or
      jsonb_typeof(p_data->'categories') is distinct from 'array' then
      return jsonb_build_object('error', 'invalid request', 'status', 400);
    end if;
    if (select count(*) from (select 1 from public.share_links where household_id = p_household limit 500) bounded) >= 500 then
      return jsonb_build_object('error', 'limit reached', 'status', 409);
    end if;
    select array_agg(value) into v_categories from jsonb_array_elements_text(p_data->'categories');
    insert into public.share_links (household_id, created_by_user_id, resource_type, token_digest, expires_at, note, categories)
      values (p_household, p_user, p_data->>'resourceType', p_data->>'digest', v_expiry,
        coalesce(p_data->>'note', ''), v_categories) returning * into v_link;
  else
    if not (p_data ? 'expiresAt' or p_data ? 'note') then
      return jsonb_build_object('error', 'invalid request', 'status', 400);
    end if;
    update public.share_links set
      expires_at = case when p_data ? 'expiresAt' then v_expiry else expires_at end,
      note = case when p_data ? 'note' then p_data->>'note' else note end
      where id = v_link.id returning * into v_link;
  end if;
  return jsonb_build_object('link', public.share_link_metadata(v_link));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
  or check_violation or not_null_violation then
  return jsonb_build_object('error', 'invalid request', 'status', 400);
end;
$$;

create or replace function public.resolve_shared_parenting_changes(p_link public.share_links, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan record;
  v_changes jsonb;
  v_valid boolean;
begin
  select id, time_zone into v_plan from public.parenting_time_plans
    where household_id = p_link.household_id and active limit 1;
  if not found then return null; end if;
  if length(v_plan.time_zone) > 100 or not exists (
    select 1 from pg_timezone_names where name = v_plan.time_zone
  ) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'startAt', c.start_at, 'endAt', least(c.end_at, p_link.expires_at),
    'partyName', c.party_name, 'category', c.category, 'label', c.label
  ) order by c.start_at, c.id), '[]'::jsonb),
    coalesce(bool_and(
      isfinite(c.start_at) and isfinite(c.end_at) and
      extract(year from c.start_at) between 1 and 9999 and
      extract(year from c.end_at) between 1 and 9999 and
      length(c.party_name) between 1 and 100 and length(c.label) between 1 and 200
    ), true) into v_changes, v_valid from (
    select c.id, c.start_at, c.end_at, p.name as party_name, c.category, c.label
      from public.parenting_time_changes c
      join public.parenting_time_parties p on p.household_id = c.household_id and p.id = c.party_id
      where c.household_id = p_link.household_id and c.plan_id = v_plan.id
        and c.start_at >= p_now and c.start_at < p_link.expires_at
        and c.category = any(p_link.categories)
      order by c.start_at, c.id limit 501
  ) c;
  -- Never silently represent a truncated set as the complete shared calendar.
  if not v_valid or jsonb_array_length(v_changes) > 500 then return null; end if;
  return jsonb_build_object('resourceType', p_link.resource_type, 'expiresAt', p_link.expires_at,
    'timeZone', v_plan.time_zone, 'changes', v_changes);
end;
$$;

-- Replace the old signature instead of leaving ambiguous PostgREST overloads.
drop function if exists public.resolve_share_link(text, timestamptz);
create or replace function public.resolve_share_link(p_digest text, p_now timestamptz, p_view_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link public.share_links;
  v_household uuid;
  v_clock timestamptz;
  v_result jsonb;
begin
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_now is null or not isfinite(p_now) then return null; end if;
  if p_view_id is not null and
    p_view_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  select household_id into v_household from public.share_links
    where token_digest = p_digest and expires_at > clock_timestamp() limit 1;
  if not found then return null; end if;
  -- Lock household before link, matching owner mutations and serializing ownership transfers.
  perform 1 from public.households where id = v_household for share;
  if not found then return null; end if;
  select s.* into v_link from public.share_links s
    join public.households h on h.id = s.household_id and h.created_by_user_id = s.created_by_user_id
    where s.token_digest = p_digest and s.expires_at > clock_timestamp()
    for update of s;
  if not found or v_link.expires_at <= greatest(p_now, clock_timestamp()) then return null; end if;
  if extract(year from v_link.expires_at) not between 1 and 9999 then return null; end if;
  v_clock := clock_timestamp();
  -- Distributed budget keyed by the verified link, never a caller-supplied forwarded IP.
  if v_link.read_window <= v_clock - interval '1 minute' then
    update public.share_links set read_window = v_clock, read_count = 1 where id = v_link.id;
  elsif v_link.read_count >= 60 then
    return jsonb_build_object('error', 'rate limited', 'status', 429);
  else
    update public.share_links set read_count = read_count + 1 where id = v_link.id;
  end if;
  case v_link.resource_type
    when 'parenting_changes' then
      v_result := public.resolve_shared_parenting_changes(v_link, p_now);
    else return null;
  end case;
  if v_link.expires_at <= clock_timestamp() then return null; end if;
  if v_result is not null and p_view_id is not null and not (p_view_id = any(v_link.recent_view_ids)) then
    -- The existing row lock makes retries and concurrent opens atomic.
    update public.share_links set
      view_count = least(view_count + 1, 9007199254740991),
      recent_view_ids = array_append(
        case when cardinality(recent_view_ids) >= 1024 then recent_view_ids[2:1024] else recent_view_ids end,
        p_view_id)
      where id = v_link.id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.share_link_metadata(public.share_links) from public, anon, authenticated, service_role;
revoke all on function public.manage_share_links(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.resolve_shared_parenting_changes(public.share_links, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.resolve_share_link(text, timestamptz, uuid) from public, anon, authenticated, service_role;
grant execute on function public.manage_share_links(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.resolve_share_link(text, timestamptz, uuid) to service_role;

commit;
