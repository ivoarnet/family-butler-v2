-- Run after the core household tables. No Bring credentials are stored in PostgreSQL.
begin;

create table if not exists public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  remote_id text check (length(remote_id) between 1 and 200),
  revision bigint not null default 0,
  sync_status text not null default 'local'
    check (sync_status in ('local', 'pending', 'syncing', 'synced', 'unavailable')),
  last_synced_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  fence bigint not null default 0,
  unique (household_id, id),
  unique (household_id, remote_id)
);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  list_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  specification text not null default '' check (length(specification) <= 500),
  checked boolean not null default false,
  deleted boolean not null default false,
  pending boolean not null default true,
  remove_names text[] not null default '{}' check (cardinality(remove_names) <= 200),
  revision bigint not null default 0,
  foreign key (household_id, list_id) references public.grocery_lists(household_id, id) on delete cascade
);
create unique index if not exists grocery_lists_name
  on public.grocery_lists (household_id, lower(btrim(name)));
alter table public.grocery_items add column if not exists retire_at timestamptz;
create unique index if not exists grocery_items_live_name
  on public.grocery_items (list_id, lower(btrim(name))) where not deleted;
create index if not exists grocery_items_list on public.grocery_items (list_id);

alter table public.grocery_lists enable row level security;
alter table public.grocery_items enable row level security;
drop policy if exists grocery_lists_owner_read on public.grocery_lists;
create policy grocery_lists_owner_read on public.grocery_lists for select to authenticated
  using (exists (select 1 from public.households h where h.id = household_id and h.created_by_user_id = auth.uid()));
drop policy if exists grocery_items_owner_read on public.grocery_items;
create policy grocery_items_owner_read on public.grocery_items for select to authenticated
  using (exists (select 1 from public.households h where h.id = household_id and h.created_by_user_id = auth.uid()));

-- All writes, including service-role writes, use the locked RPC. Browsers cannot
-- manufacture clean items, lease tokens, remote links, or synchronization acknowledgements.
revoke all on public.grocery_lists, public.grocery_items from public, anon, authenticated, service_role;
grant select (id, household_id, name, remote_id, revision, sync_status, last_synced_at)
  on public.grocery_lists to authenticated;
grant select (id, household_id, list_id, name, specification, checked, deleted, revision)
  on public.grocery_items to authenticated;

create or replace function public.grocery_command(p_household uuid, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  l public.grocery_lists%rowtype;
  i public.grocery_items%rowtype;
  r record;
  v_id uuid;
  v_token uuid;
  v_name text;
  v_remote text;
  v_names text[];
  v_pending boolean;
  v_snapshot jsonb;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 400000 then
    return jsonb_build_object('error', 'invalid command', 'status', 400);
  end if;
  if p_action = 'read' then
    return jsonb_build_object('lists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gl.id, 'name', gl.name, 'remoteId', gl.remote_id, 'revision', gl.revision,
        'syncStatus', case when gl.lease_token is not null and gl.lease_until <= clock_timestamp()
          then 'unavailable' else gl.sync_status end,
        'lastSyncedAt', gl.last_synced_at,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', gi.id, 'name', gi.name, 'specification', gi.specification,
          'checked', gi.checked, 'revision', gi.revision) order by lower(gi.name), gi.id)
          from public.grocery_items gi where gi.list_id = gl.id and not gi.deleted), '[]'::jsonb)
      ) order by lower(gl.name), gl.id)
      from public.grocery_lists gl where gl.household_id = p_household
    ), '[]'::jsonb));
  end if;

  if p_action = 'lists_post' then
    perform 1 from public.households where id = p_household for update;
    if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;
    v_name := btrim(p_data->>'name');
    if v_name is null or length(v_name) not between 1 and 160 then
      return jsonb_build_object('error', 'invalid name', 'status', 400);
    end if;
    -- A client-supplied UUID makes creation retries idempotent.
    v_id := coalesce((p_data->>'id')::uuid, gen_random_uuid());
    if exists (select 1 from public.grocery_lists where id = v_id and household_id = p_household) then
      return jsonb_build_object('ok', true, 'id', v_id);
    end if;
    select id into v_id from public.grocery_lists
      where household_id = p_household and lower(name) = lower(v_name);
    if found then return jsonb_build_object('ok', true, 'id', v_id); end if;
    v_id := coalesce((p_data->>'id')::uuid, gen_random_uuid());
    if (select count(*) from public.grocery_lists where household_id = p_household) >= 50 then
      return jsonb_build_object('error', 'list limit reached', 'status', 409);
    end if;
    insert into public.grocery_lists(id, household_id, name) values (v_id, p_household, v_name);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  v_id := case when p_action like 'items_%' then (p_data->>'listId')::uuid else (p_data->>'id')::uuid end;
  select * into l from public.grocery_lists where id = v_id and household_id = p_household for update;
  if not found then return jsonb_build_object('error', 'not found', 'status', 404); end if;

  if p_action in ('renew', 'finish', 'release') then
    if l.lease_token is null or not (p_data ?& array['token', 'fence', 'revision'])
      or l.lease_token is distinct from (p_data->>'token')::uuid
      or l.fence is distinct from (p_data->>'fence')::bigint
      or l.revision is distinct from (p_data->>'revision')::bigint
      or l.lease_until is null
      or (p_action <> 'release' and l.lease_until <= clock_timestamp()) then
      return jsonb_build_object('error', 'stale sync', 'status', 409);
    end if;
    if p_action = 'renew' then
      update public.grocery_lists set lease_until = clock_timestamp() + interval '90 seconds' where id = l.id;
      return jsonb_build_object('ok', true);
    elsif p_action = 'release' then
      update public.grocery_lists set lease_token = null, lease_until = null, sync_status = 'unavailable' where id = l.id;
      return jsonb_build_object('ok', true);
    end if;

    v_snapshot := p_data->'items';
    if jsonb_typeof(v_snapshot) is distinct from 'array' or jsonb_array_length(v_snapshot) > 200 then
      return jsonb_build_object('error', 'invalid snapshot', 'status', 400);
    end if;
    if exists (select 1 from jsonb_array_elements(v_snapshot) x where
      jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'name') is distinct from 'string'
      or length(btrim(x->>'name')) not between 1 and 160
      or jsonb_typeof(x->'specification') is distinct from 'string' or length(x->>'specification') > 500
      or jsonb_typeof(x->'checked') is distinct from 'boolean') then
      return jsonb_build_object('error', 'invalid snapshot', 'status', 400);
    end if;
    -- Local pending rows win. A successful HTTP write alone is not an acknowledgement:
    -- retain the intent until the complete remote snapshot confirms it (also after a crash).
    for i in select * from public.grocery_items where list_id = l.id and (pending or deleted or cardinality(remove_names) > 0) loop
      v_pending := exists (
        select 1 from jsonb_array_elements(v_snapshot) x
        where (x->>'name' = any(i.remove_names) or (i.deleted and lower(btrim(x->>'name')) = lower(i.name)))
          and not exists (select 1 from public.grocery_items live where live.list_id = l.id
            and not live.deleted and lower(live.name) = lower(btrim(x->>'name')))
      );
      if not i.deleted and (i.pending or v_pending) then
        v_pending := v_pending or not exists (select 1 from jsonb_array_elements(v_snapshot) x
          where x->>'name' = i.name and (i.checked or x->>'specification' = i.specification)
            and (x->>'checked')::boolean = i.checked);
      end if;
      if not v_pending then
        -- Bounded quarantine for late provider writes; later genuine re-adds win.
        update public.grocery_items set pending = false,
          retire_at = case when deleted or cardinality(remove_names) > 0
            then coalesce(retire_at, clock_timestamp() + interval '10 minutes') else null end
          where id = i.id;
      else
        update public.grocery_items set pending = true where id = i.id;
      end if;
    end loop;
    -- Clean local rows follow the authoritative snapshot, including remote deletion.
    delete from public.grocery_items gi where gi.list_id = l.id and not gi.pending and not gi.deleted
      and not exists (select 1 from jsonb_array_elements(v_snapshot) x
        where lower(btrim(x->>'name')) = lower(gi.name));
    for r in select distinct on (lower(btrim(x->>'name')))
      btrim(x->>'name') as name, x->>'specification' as specification, (x->>'checked')::boolean as checked
      from jsonb_array_elements(v_snapshot) x order by lower(btrim(x->>'name')), x->>'name' loop
      -- Retained tombstones and rename identities must not reappear after late writes.
      if exists (select 1 from public.grocery_items gi where gi.list_id = l.id
        and gi.pending and not gi.deleted and lower(gi.name) = lower(r.name))
        or exists (select 1 from public.grocery_items gi where gi.list_id = l.id
        and (gi.deleted and lower(gi.name) = lower(r.name) or exists
          (select 1 from unnest(gi.remove_names) old_name where lower(old_name) = lower(r.name)))
        and not exists (select 1 from public.grocery_items live where live.list_id = l.id
          and not live.deleted and lower(live.name) = lower(r.name))) then
        continue;
      end if;
      select * into i from public.grocery_items where list_id = l.id and not deleted and lower(name) = lower(r.name);
      if found then
        -- Bring's check-off operation discards specification. Keep local detail
        -- while it remains checked/blank; explicit remote detail or unchecking wins.
        update public.grocery_items set name = r.name,
          specification = case when r.checked and r.specification = '' then specification else r.specification end,
          checked = r.checked,
          revision = revision + case when (name, specification, checked) is distinct from
            (r.name, case when r.checked and r.specification = '' then specification else r.specification end,
              r.checked) then 1 else 0 end
          where id = i.id;
      else
        if (select count(*) from public.grocery_items where list_id = l.id and not deleted) >= 200
          or (select count(*) from public.grocery_items where list_id = l.id) >= 2000 then
          raise exception 'grocery item limit reached';
        end if;
        insert into public.grocery_items(household_id, list_id, name, specification, checked, pending)
          values (p_household, l.id, r.name, r.specification, r.checked, false);
      end if;
    end loop;
    v_pending := exists (select 1 from public.grocery_items where list_id = l.id and pending);
    update public.grocery_lists set lease_token = null, lease_until = null, revision = revision + 1,
      last_synced_at = clock_timestamp(), sync_status = case when v_pending then 'pending' else 'synced' end where id = l.id;
    return jsonb_build_object('syncStatus', case when v_pending then 'pending' else 'synced' end);
  end if;

  if l.lease_token is not null and l.lease_until > clock_timestamp() then
    return jsonb_build_object('error', 'sync in progress', 'status', 409);
  end if;
  if p_action = 'acquire' then
    if l.remote_id is null then return jsonb_build_object('syncStatus', 'local'); end if;
    -- Only acknowledged histories have a deadline. A never-confirmed delete
    -- remains pending until the remote snapshot verifies it.
    delete from public.grocery_items where list_id = l.id and deleted and retire_at <= clock_timestamp();
    update public.grocery_items set remove_names = '{}', retire_at = null, pending = false
      where list_id = l.id and not deleted and retire_at <= clock_timestamp();
    v_token := gen_random_uuid();
    update public.grocery_lists set lease_token = v_token, lease_until = clock_timestamp() + interval '90 seconds',
      fence = fence + 1, sync_status = 'syncing' where id = l.id;
    return jsonb_build_object('remoteId', l.remote_id,
      'lease', jsonb_build_object('id', l.id, 'token', v_token, 'fence', l.fence + 1, 'revision', l.revision),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', gi.id, 'name', gi.name, 'specification', gi.specification, 'checked', gi.checked,
        'deleted', gi.deleted, 'pending', gi.pending, 'removeNames', gi.remove_names) order by gi.id)
        from public.grocery_items gi where gi.list_id = l.id and (not gi.deleted or gi.pending)), '[]'::jsonb));
  end if;

  if p_action = 'lists_put' then
    if p_data ? 'revision' and l.revision <> (p_data->>'revision')::bigint then
      return jsonb_build_object('error', 'stale revision', 'status', 409);
    end if;
    v_name := coalesce(btrim(p_data->>'name'), l.name);
    if length(v_name) not between 1 and 160 then return jsonb_build_object('error', 'invalid name', 'status', 400); end if;
    if exists (select 1 from public.grocery_lists where household_id = p_household
      and lower(name) = lower(v_name) and id <> l.id) then
      return jsonb_build_object('error', 'duplicate list name', 'status', 409);
    end if;
    v_remote := case when p_data ? 'remoteId' then p_data->>'remoteId' else l.remote_id end;
    if v_remote is not null and length(v_remote) not between 1 and 200 then
      return jsonb_build_object('error', 'invalid remote id', 'status', 400);
    end if;
    if exists (select 1 from public.grocery_lists where household_id = p_household and remote_id = v_remote and id <> l.id) then
      return jsonb_build_object('error', 'remote list already linked', 'status', 409);
    end if;
    if v_remote is distinct from l.remote_id then
      -- Detach never deletes anything in the old account/list.
      delete from public.grocery_items where list_id = l.id and deleted;
      update public.grocery_items set pending = true, remove_names = '{}', retire_at = null where list_id = l.id;
    end if;
    update public.grocery_lists set name = v_name, remote_id = v_remote, revision = revision + 1,
      last_synced_at = case when v_remote is distinct from l.remote_id then null else last_synced_at end,
      lease_token = null, lease_until = null, fence = fence + 1,
      sync_status = case when v_remote is null then 'local' else 'pending' end where id = l.id;
    return jsonb_build_object('ok', true, 'id', l.id);
  end if;

  if p_action not in ('items_post', 'items_put', 'items_delete') then
    return jsonb_build_object('error', 'invalid command', 'status', 400);
  end if;
  v_id := (p_data->>'id')::uuid;
  select * into i from public.grocery_items where list_id = l.id and id = v_id;
  if not found and p_action <> 'items_post' then
    if p_action = 'items_delete' then return jsonb_build_object('ok', true); end if;
    return jsonb_build_object('error', 'not found', 'status', 404);
  end if;
  if p_action = 'items_post' and i.id is null then
    -- Repeated adds deduplicate names, including resurrection of an unsynced deletion.
    select * into i from public.grocery_items where list_id = l.id
      and lower(name) = lower(btrim(p_data->>'name')) order by deleted, id limit 1;
  end if;
  if p_action = 'items_post' and i.id is not null and not i.deleted then
    return jsonb_build_object('ok', true, 'id', i.id);
  end if;
  if p_action = 'items_put' and i.deleted then
    return jsonb_build_object('error', 'item was deleted', 'status', 409);
  end if;
  if p_action = 'items_delete' and i.deleted then
    return jsonb_build_object('ok', true, 'id', i.id);
  end if;
  if p_data ? 'revision' and i.id is not null and i.revision <> (p_data->>'revision')::bigint then
    return jsonb_build_object('error', 'stale revision', 'status', 409);
  end if;
  v_name := coalesce(btrim(p_data->>'name'), i.name);
  if v_name is null or length(v_name) not between 1 and 160
    or length(coalesce(p_data->>'specification', '')) > 500 then
    return jsonb_build_object('error', 'invalid item', 'status', 400);
  end if;
  if p_action <> 'items_delete' and exists (select 1 from public.grocery_items
    where list_id = l.id and not deleted and lower(name) = lower(v_name) and id is distinct from i.id) then
    return jsonb_build_object('error', 'duplicate item name', 'status', 409);
  end if;
  v_names := coalesce(i.remove_names, '{}');
  if i.id is not null and (v_name <> i.name or p_action = 'items_delete') then
    select array_agg(distinct n) into v_names from unnest(v_names || array[i.name]) n;
  end if;
  if cardinality(v_names) > 200 then return jsonb_build_object('error', 'sync required', 'status', 409); end if;
  if i.id is null then
    if (select count(*) from public.grocery_items where list_id = l.id and (not deleted or pending)) >= 200 then
      return jsonb_build_object('error', 'item limit reached', 'status', 409);
    end if;
    if (select count(*) from public.grocery_items where list_id = l.id) >= 2000 then
      return jsonb_build_object('error', 'history limit reached; use a new list', 'status', 409);
    end if;
    v_id := coalesce(v_id, gen_random_uuid());
    insert into public.grocery_items(id, household_id, list_id, name, specification, checked)
      values (v_id, p_household, l.id, v_name, coalesce(p_data->>'specification', ''), coalesce((p_data->>'checked')::boolean, false));
  else
    v_id := i.id;
    update public.grocery_items set name = v_name, specification = coalesce(p_data->>'specification', specification),
      checked = coalesce((p_data->>'checked')::boolean, checked), deleted = p_action = 'items_delete',
      pending = true, remove_names = v_names, retire_at = null, revision = revision + 1 where id = i.id;
    -- Purely local deletions need no remote tombstone.
    if p_action = 'items_delete' and l.remote_id is null then delete from public.grocery_items where id = i.id; end if;
  end if;
  update public.grocery_lists set revision = revision + 1, lease_token = null, lease_until = null,
    fence = fence + 1, sync_status = case when remote_id is null then 'local' else 'pending' end where id = l.id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.grocery_command(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.grocery_command(uuid, text, jsonb) to service_role;
commit;
