const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const householdId = "00000000-0000-0000-0000-000000000001";
const otherHouseholdId = "00000000-0000-0000-0000-000000000002";
const ownerId = "00000000-0000-0000-0000-000000000003";
const otherOwnerId = "00000000-0000-0000-0000-000000000009";
const unrelatedUserId = "00000000-0000-0000-0000-000000000010";

test("PostgreSQL core-table grants and RLS protect browser access without breaking feature policies", {
  skip: !process.env.GROCERY_TEST_PG_SOCKET,
}, (t) => {
  const database = `core_access_test_${process.pid}`;
  const args = ["-h", process.env.GROCERY_TEST_PG_SOCKET, "-p", process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, db = database) => execFileSync("psql", [...args, "-d", db, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const apply = (file) => execFileSync("psql", [...args, "-d", database], {
    input: readFileSync(path.join(__dirname, "../docs/sql", file), "utf8"),
    stdio: ["pipe", "pipe", "pipe"],
  });

  sql(`create database ${database}`, "postgres");
  t.after(() => sql(`drop database ${database}`, "postgres"));
  sql(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.households(id uuid primary key, name text not null, created_by_user_id uuid not null);
    create table public.household_members(id uuid primary key, household_id uuid not null references public.households(id),
      first_name text not null);
    create table public.contacts(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.event_types(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.events(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.day_configurations(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.tasks(id uuid primary key, description text not null);
    grant all privileges on public.households, public.household_members, public.contacts,
      public.event_types, public.events, public.day_configurations, public.tasks to public, anon, authenticated;
    insert into public.households values
      ('${householdId}', 'Owner household', '${ownerId}'),
      ('${otherHouseholdId}', 'Other household', '${otherOwnerId}');
    insert into public.household_members values
      ('00000000-0000-0000-0000-000000000004', '${householdId}', 'Owner member'),
      ('00000000-0000-0000-0000-000000000005', '${otherHouseholdId}', 'Other member');
  `);

  apply("core-access-policy.sql");
  apply("core-access-policy.sql");
  apply("childcare.sql");
  apply("parenting-time.sql");
  apply("groceries.sql");
  sql(`grant all privileges on public.childcare_providers, public.childcare_arrangements,
    public.childcare_overrides, public.parenting_time_parties, public.parenting_time_plans,
    public.parenting_time_changes, public.parenting_time_calendar_settings to public, anon, authenticated`);
  sql(`insert into public.childcare_providers(household_id, name, type) values ('${householdId}', 'Care', 'other');
    insert into public.parenting_time_parties(household_id, name) values ('${householdId}', 'Parent');
    select public.grocery_command('${householdId}'::uuid, 'lists_post', '{"id":"00000000-0000-0000-0000-000000000006","name":"Food"}')`);

  assert.equal(sql(`select count(*) from pg_tables t join pg_class c
    on c.oid = format('public.%I', t.tablename)::regclass
    where t.schemaname = 'public' and t.tablename = any(array[
      'households','household_members','contacts','event_types','events','day_configurations','tasks'
    ]) and c.relrowsecurity`), "7");
  assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(array[
      'households','household_members','contacts','event_types','events','day_configurations','tasks'
    ]) and not has_table_privilege('anon', c.oid, 'select')`), "7");
  assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(array[
      'households','household_members','contacts','event_types','events','day_configurations','tasks'
    ]) and not has_table_privilege('authenticated', c.oid, 'select')`), "7");
  assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(array[
      'households','household_members','contacts','event_types','events','day_configurations','tasks'
    ]) and has_table_privilege('service_role', c.oid, 'select')`), "7");
  assert.equal(sql(`select count(*) from pg_policies
    where schemaname = 'public' and policyname = 'core_household_owner'
      and cmd = 'SELECT' and tablename <> 'tasks'`), "6");
  assert.equal(sql(`select has_column_privilege('authenticated', 'public.households', 'id', 'select')
    and has_column_privilege('authenticated', 'public.households', 'created_by_user_id', 'select')
    and not has_column_privilege('authenticated', 'public.households', 'name', 'select')
    and has_column_privilege('authenticated', 'public.household_members', 'id', 'select')
    and not has_column_privilege('authenticated', 'public.household_members', 'first_name', 'select')`), "t");

  const asOwner = `set role authenticated; set request.jwt.claim.sub = '${ownerId}';`;
  const asOther = `set role authenticated; set request.jwt.claim.sub = '${unrelatedUserId}';`;
  assert.equal(sql(`${asOwner} select count(*) from public.households`), "1");
  assert.equal(sql(`${asOwner} select count(*) from public.household_members`), "1");
  assert.equal(sql(`${asOther} select count(*) from public.households`), "0");
  assert.equal(sql(`${asOther} select count(*) from public.household_members`), "0");
  sql(`${asOwner}
    insert into public.childcare_providers(household_id, name, type) values ('${householdId}', 'Owner provider', 'other');
    insert into public.parenting_time_parties(household_id, name) values ('${householdId}', 'Owner party')`);
  assert.throws(() => sql(`${asOther}
    insert into public.childcare_providers(household_id, name, type) values ('${householdId}', 'Foreign provider', 'other')`));
  assert.throws(() => sql(`set role anon; select id from public.households`));
  assert.throws(() => sql(`${asOwner} select name from public.households`));
  assert.throws(() => sql(`${asOwner} select id from public.contacts`));
  assert.throws(() => sql(`${asOwner} insert into public.contacts(id, household_id)
    values ('00000000-0000-0000-0000-000000000007', '${householdId}')`));

  for (const featureTable of ["childcare_providers", "parenting_time_parties", "grocery_lists"]) {
    const ownedRows = featureTable === "grocery_lists" ? "1" : "2";
    assert.equal(sql(`${asOwner} select count(*) from public.${featureTable}`), ownedRows, `${featureTable} owner read`);
    assert.equal(sql(`${asOther} select count(*) from public.${featureTable}`), "0", `${featureTable} cross-owner read`);
  }
  assert.equal(sql(`set role service_role; insert into public.contacts(id, household_id)
    values ('00000000-0000-0000-0000-000000000008', '${householdId}');
    select count(*) from public.contacts`), "1");
});
