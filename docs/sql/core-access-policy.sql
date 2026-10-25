-- Run after the core schema and household ownership backfill, before feature migrations.
-- Browser access to core data is API-only except for owner-scoped identifier lookups
-- required by feature RLS policies and validation triggers.
begin;

do $$
declare
  v_table_name text;
  v_column_name text;
begin
  foreach v_table_name in array array[
    'households', 'household_members', 'contacts', 'event_types',
    'events', 'day_configurations', 'tasks'
  ]
  loop
    if to_regclass(format('public.%I', v_table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', v_table_name);

    for v_column_name in
      select columns.column_name
      from information_schema.columns columns
      where columns.table_schema = 'public' and columns.table_name = v_table_name
    loop
      execute format(
        'revoke all privileges (%I) on table public.%I from public, anon, authenticated',
        v_column_name, v_table_name
      );
    end loop;

    execute format('grant all privileges on table public.%I to service_role', v_table_name);
    execute format('drop policy if exists core_service_role_access on public.%I', v_table_name);
    execute format(
      'create policy core_service_role_access on public.%I for all to service_role using (true) with check (true)',
      v_table_name
    );

    if v_table_name = 'households' then
      execute 'drop policy if exists core_household_owner on public.households';
      execute 'create policy core_household_owner on public.households for select to authenticated
        using (created_by_user_id = auth.uid())';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and information_schema.columns.table_name = v_table_name
        and information_schema.columns.column_name = 'household_id'
    ) then
      execute format('drop policy if exists core_household_owner on public.%I', v_table_name);
      execute format(
        'create policy core_household_owner on public.%I for select to authenticated
         using (exists (select 1 from public.households h
           where h.id = household_id and h.created_by_user_id = auth.uid()))',
        v_table_name
      );
    end if;
  end loop;
end;
$$;

grant select (id, created_by_user_id) on public.households to authenticated;
grant select (id, household_id) on public.household_members to authenticated;

commit;
