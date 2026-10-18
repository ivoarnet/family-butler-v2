-- Apply after groceries.sql. Only the API/worker service role can access these rows.
begin;
create table if not exists public.bring_connections (
  household_id uuid primary key references public.households(id) on delete cascade,
  enabled boolean not null,
  revision bigint not null default 1 check (revision > 0),
  version integer,
  ciphertext text,
  iv text,
  tag text,
  check ((not enabled and version is null and ciphertext is null and iv is null and tag is null)
    or (enabled and version is not null and version = 1 and ciphertext is not null and length(ciphertext) between 4 and 10924
      and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'
      and iv is not null and iv ~ '^[A-Za-z0-9+/]{16}$'
      and tag is not null and tag ~ '^[A-Za-z0-9+/]{22}==$'))
);
alter table public.bring_connections enable row level security;
revoke all on public.bring_connections from public, anon, authenticated, service_role;
grant select on public.bring_connections to service_role;

create or replace function public.bring_connection_command(
  p_household uuid, p_enabled boolean, p_envelope jsonb, p_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  current_revision bigint;
begin
  perform 1 from public.households where id = p_household for update;
  if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;
  select revision into current_revision from public.bring_connections where household_id = p_household for update;
  if p_revision is null or coalesce(current_revision, 0) <> p_revision then
    return jsonb_build_object('error', 'connection changed', 'status', 409);
  end if;
  perform 1 from public.grocery_lists where household_id = p_household order by id for update;
  if exists (select 1 from public.grocery_lists where household_id = p_household
    and lease_token is not null and lease_until > clock_timestamp()) then
    return jsonb_build_object('error', 'sync in progress', 'status', 409);
  end if;
  if p_enabled is null or (p_enabled and (
    jsonb_typeof(p_envelope) is distinct from 'object'
    or octet_length(p_envelope::text) > 12000
    or (select count(*) from jsonb_object_keys(p_envelope)) <> 4
    or p_envelope->>'version' is distinct from '1'
    or jsonb_typeof(p_envelope->'ciphertext') is distinct from 'string'
    or jsonb_typeof(p_envelope->'iv') is distinct from 'string'
    or jsonb_typeof(p_envelope->'tag') is distinct from 'string'
  )) then
    return jsonb_build_object('error', 'invalid connection', 'status', 400);
  end if;
  insert into public.bring_connections(household_id, enabled, revision, version, ciphertext, iv, tag)
    values (p_household, p_enabled, coalesce(current_revision, 0) + 1,
      case when p_enabled then 1 end,
      case when p_enabled then p_envelope->>'ciphertext' end,
      case when p_enabled then p_envelope->>'iv' end,
      case when p_enabled then p_envelope->>'tag' end)
    on conflict (household_id) do update set enabled = excluded.enabled,
      revision = excluded.revision, version = excluded.version,
      ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag;
  delete from public.grocery_items where household_id = p_household and deleted;
  update public.grocery_items set pending = true, remove_names = '{}', retire_at = null,
    icon_id = null, image_url = null,
    revision = revision + 1 where household_id = p_household;
  update public.grocery_lists set remote_id = null, sync_status = 'local',
    last_synced_at = null, lease_token = null, lease_until = null,
    fence = fence + 1, revision = revision + 1 where household_id = p_household;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.bring_connection_command(uuid, boolean, jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.bring_connection_command(uuid, boolean, jsonb, bigint) to service_role;
commit;
