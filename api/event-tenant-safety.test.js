const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile, execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const households = require("./households");
const db = require("./shared/db");
const createSupabaseProvider = require("./shared/db/providers/supabase");
const createAddEventTool = require("./shared/agent/tools/addEventTool");
const createUpdateEventDetailsTool = require("./shared/agent/tools/updateEventDetailsTool");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const memberId = "00000000-0000-0000-0000-000000000003";
const ownEventId = "00000000-0000-0000-0000-000000000004";
const foreignEventId = "00000000-0000-0000-0000-000000000005";

const saveEnvironment = (t) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  t.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
  });
};

const invokeHouseholdMutation = async (entity) => {
  global.fetch = async (url) => String(url).endsWith("/auth/v1/user") ? Response.json({ id: userId }) : Response.json([]);
  const context = { log: { error() {} } };
  await households(context, {
    method: "PATCH",
    params: { householdId },
    headers: { "x-supabase-auth-token": "test-token" },
    body: { expectedRevision: 4, entityType: "event", operation: "upsert", entityId: entity.id, entity },
  });
  return context.res;
};

test("HTTP event commands mutate only the requested entity and reject foreign IDs", async (t) => {
  saveEnvironment(t);
  const oldGetHousehold = db.getHouseholdWithRelations;
  const oldGetEventHouseholdId = db.getEventHouseholdId;
  const oldMutate = db.mutateHouseholdEntity;
  const mutation = [];
  db.getHouseholdWithRelations = async (_id, ownerId) => ownerId === userId ? ({
    household: { id: householdId, name: "Family", holidayRegion: "CH" },
    revision: 4,
    members: [{ id: memberId, firstName: "Robin", sortOrder: 0 }],
    contacts: [],
    eventTypes: [],
    events: [],
    dayConfigurations: [],
  }) : null;
  db.getEventHouseholdId = async (id) => id === foreignEventId ? "00000000-0000-0000-0000-000000000099" : null;
  db.mutateHouseholdEntity = async (...args) => {
    mutation.push(args);
    return 5;
  };
  t.after(() => {
    db.getHouseholdWithRelations = oldGetHousehold;
    db.getEventHouseholdId = oldGetEventHouseholdId;
    db.mutateHouseholdEntity = oldMutate;
  });
  const newEvent = { id: ownEventId, title: "New event", date: "2026-10-21", memberIds: [memberId] };
  const create = await invokeHouseholdMutation(newEvent);
  assert.equal(create.status, 200);
  assert.deepEqual(mutation[0].slice(0, 5), [householdId, 4, "event", "upsert", ownEventId]);
  assert.equal(mutation[0][5].title, "New event");

  db.getHouseholdWithRelations = async () => ({
    household: { id: householdId, name: "Family", holidayRegion: "CH" },
    revision: 4,
    members: [{ id: memberId, firstName: "Robin", sortOrder: 0 }],
    contacts: [],
    eventTypes: [],
    events: [{
    id: ownEventId, title: "Existing event", date: "2026-10-20", memberIds: [memberId], allDay: true,
    }],
    dayConfigurations: [],
  });
  const update = await invokeHouseholdMutation({ id: ownEventId, title: "Updated event", date: "2026-10-22", memberIds: [memberId] });
  assert.equal(update.status, 200);
  assert.equal(mutation[1][5].id, ownEventId);

  const duplicateMembers = await invokeHouseholdMutation({
    id: ownEventId, title: "Invalid event", date: "2026-10-22", memberIds: [memberId, memberId],
  });
  assert.equal(duplicateMembers.status, 400);

  const denied = await invokeHouseholdMutation({
    id: foreignEventId, title: "Not authorized", date: "2026-10-22", memberIds: [memberId],
  });
  assert.equal(denied.status, 403);
  assert.equal(mutation.length, 2);
});

test("agent add_event ignores supplied IDs and generates an event ID", async () => {
  let mutation;
  const householdState = {
    revision: 0,
    members: [{ id: memberId, firstName: "Robin" }],
    contacts: [],
    eventTypes: [],
    events: [],
  };
  const tool = createAddEventTool({
    db: {
      mutateHouseholdEntity: async (...args) => {
        mutation = args;
        return args[1] + 1;
      },
    },
    householdId,
    householdState,
    toClientError: (message) => new Error(message),
  });
  assert.equal("id" in tool.definition.parameters.properties.event.properties, false);
  assert.match(tool.definition.description, /UNTIL=YYYYMMDD/);
  const result = await tool.execute({ event: {
    id: foreignEventId, title: "New event", date: "2026-10-21", memberIds: [memberId],
    repeatRule: "RRULE:FREQ=WEEKLY;UNTIL=20261231",
  } });
  assert.equal(result.ok, true);
  assert.match(mutation[4], /^[0-9a-f-]{36}$/i);
  assert.notEqual(mutation[4], foreignEventId);
  assert.equal(mutation[5].repeatRule, "RRULE:FREQ=WEEKLY;UNTIL=20261231");
  assert.equal(householdState.revision, 1);
});

test("agent stale entity writes surface a recoverable conflict without updating local state", async () => {
  const householdState = {
    revision: 3,
    members: [{ id: memberId, firstName: "Robin" }],
    contacts: [],
    eventTypes: [],
    events: [],
  };
  const tool = createAddEventTool({
    db: {
      mutateHouseholdEntity: async () => {
        throw new Error("stale household revision");
      },
    },
    householdId,
    householdState,
    toClientError: (message) => new Error(message),
  });
  await assert.rejects(
    tool.execute({ event: { title: "Concurrent event", date: "2026-10-21", memberIds: [memberId] } }),
    (error) => error.statusCode === 409
  );
  assert.equal(householdState.revision, 3);
  assert.equal(householdState.events.length, 0);
});

test("agent event updates cannot select IDs outside the household state", async () => {
  let writes = 0;
  const tool = createUpdateEventDetailsTool({
    db: { mutateHouseholdEntity: async () => { writes++; return 1; } },
    householdId,
    householdState: {
      members: [{ id: memberId, firstName: "Robin" }],
      revision: 0,
      contacts: [],
      eventTypes: [],
      events: [{
        id: ownEventId, title: "Private event", date: "2026-10-20",
        memberIds: [memberId], allDay: true,
      }],
    },
    toClientError: (message) => new Error(message),
  });
  const result = await tool.execute({ eventId: foreignEventId, updates: { title: "Overwritten" } });
  assert.equal(result.notFound, true);
  assert.equal(result.message, "No matching event found. Use get_events first to find the exact event id.");
  assert.equal(JSON.stringify(result).includes("Private event"), false);
  assert.equal(writes, 0);
});

test("Supabase event replacement uses one scoped database command", async (t) => {
  saveEnvironment(t);
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").at(-1);
    if (table === "household_revisions") return Response.json([{ revision: 0 }]);
    if (table === "households") return Response.json([{
      id: householdId, name: "Family", holiday_region: "CH",
    }]);
    if (table === "events") return Response.json([{
      id: ownEventId, household_id: householdId, title: "Existing event",
      event_date: "2026-10-22", end_date: null, member_ids: [memberId], all_day: true,
    }], { headers: { "Content-Range": "0-0/1" } });
    if (options.method === "POST" && table === "replace_household_events") {
      return new Response(null, { status: 204 });
    }
    return Response.json([], { headers: { "Content-Range": "*/0" } });
  };
  const provider = createSupabaseProvider();
  const snapshot = await provider.getHouseholdWithRelations(householdId, userId);
  snapshot.events[0].title = "Updated event";
  await provider.replaceEvents(householdId, snapshot.events);

  const replacement = requests.filter(({ url }) => url.endsWith("/rpc/replace_household_events"));
  assert.equal(replacement.length, 1);
  assert.equal(replacement[0].options.method, "POST");
  assert.deepEqual(JSON.parse(replacement[0].options.body), {
    p_household_id: householdId,
    p_events: [{
      id: ownEventId,
      title: "Updated event",
      event_date: "2026-10-22",
      end_date: null,
      member_ids: [memberId],
      all_day: true,
    }],
  });
});

test("Supabase core entity mutation sends its expected revision to one RPC", async (t) => {
  saveEnvironment(t);
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json(9);
  };
  const provider = createSupabaseProvider();
  const revision = await provider.mutateHouseholdEntity(
    householdId,
    8,
    "event",
    "upsert",
    ownEventId,
    { id: ownEventId, title: "Updated", date: "2026-10-22", memberIds: [memberId], allDay: true }
  );
  assert.equal(revision, 9);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/rpc\/mutate_household_entity$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_household_id: householdId,
    p_expected_revision: 8,
    p_entity_type: "event",
    p_operation: "upsert",
    p_entity_id: ownEventId,
    p_entity: { id: ownEventId, title: "Updated", date: "2026-10-22", memberIds: [memberId], allDay: true },
  });
});

test("Supabase household mutation batches use one revision-checked RPC", async (t) => {
  saveEnvironment(t);
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json(10);
  };
  const provider = createSupabaseProvider();
  const mutations = [{
    entityType: "contact",
    operation: "delete",
    entityId: ownEventId,
    entity: null,
  }];
  const revision = await provider.mutateHouseholdEntities(householdId, 9, mutations);
  assert.equal(revision, 10);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/rpc\/mutate_household_entities$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_household_id: householdId,
    p_expected_revision: 9,
    p_mutations: mutations,
  });
});

test("core entity mutation SQL compares a locked revision before changing one entity", () => {
  const sql = readFileSync(path.join(__dirname, "..", "docs", "sql", "core-entity-mutations.sql"), "utf8");
  assert.match(sql, /for update/i);
  assert.match(sql, /v_revision <> p_expected_revision/);
  assert.match(sql, /stale household revision/);
  assert.match(sql, /unique \(household_id, sort_order\) deferrable initially deferred/i);
  assert.match(sql, /event member id is not part of this household/);
  assert.match(sql, /array_remove\(member_ids, p_entity_id\)/);
  assert.match(sql, /insert into public\.events as existing/i);
  assert.doesNotMatch(sql, /delete from public\.events where household_id = p_household_id/i);
});

test("PostgreSQL core entity commands roll back failures and preserve valid references", {
  skip: !process.env.GROCERY_TEST_PG_SOCKET,
}, async (t) => {
  const database = `core_mutation_test_${process.pid}`;
  const args = ["-h", process.env.GROCERY_TEST_PG_SOCKET, "-p", process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, db = database) => execFileSync("psql", [...args, "-d", db, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const memberB = "00000000-0000-0000-0000-000000000006";
  const typeA = "00000000-0000-0000-0000-000000000007";
  const typeB = "00000000-0000-0000-0000-000000000008";
  const contactId = "00000000-0000-0000-0000-000000000010";
  const missingMember = "00000000-0000-0000-0000-000000000099";
  const rpc = (revision, entityType, operation, id, entity) =>
    `select public.mutate_household_entity('${householdId}'::uuid, ${revision}, ${quote(entityType)}, ` +
    `${quote(operation)}, '${id}'::uuid, ${quote(JSON.stringify(entity))}::jsonb)`;

  sql(`create database ${database}`, "postgres");
  t.after(() => sql(`drop database ${database}`, "postgres"));
  sql(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create table public.households(id uuid primary key, name text not null, updated_at timestamptz not null default now());
    create table public.household_members(
      id uuid primary key, household_id uuid not null references public.households(id), first_name text not null,
      role text, is_child boolean not null default false, hatch_parenting_away boolean not null default false,
      school_building text, school_class text, avatar_color text not null default '#3b82f6',
      visible_in_calendar boolean not null default true, sort_order integer not null, updated_at timestamptz not null default now(),
      unique (household_id, sort_order)
    );
    create table public.contacts(
      id uuid primary key, household_id uuid not null references public.households(id), first_name text not null,
      last_name text, birth_day smallint, birth_month smallint, birth_year smallint, email text, mobile_phone text,
      updated_at timestamptz not null default now()
    );
    create table public.event_types(
      id uuid primary key, household_id uuid not null references public.households(id), name text not null,
      icon text, color text, sort_order integer not null, updated_at timestamptz not null default now(),
      unique (household_id, sort_order)
    );
    create table public.events(
      id uuid primary key, household_id uuid not null references public.households(id), title text not null,
      event_date date not null, end_date date, member_ids uuid[] not null default '{}', all_day boolean not null default true,
      start_time time, end_time time, event_type_id uuid references public.event_types(id) on delete set null,
      repeat_rule text, location text, notes text, updated_at timestamptz not null default now()
    );
    create table public.day_configurations(
      id uuid primary key, household_id uuid not null references public.households(id), category text not null,
      start_date date not null, end_date date not null, label text, updated_at timestamptz not null default now()
    );
    insert into public.households(id, name) values ('${householdId}', 'Family');
  `);
  const migration = readFileSync(path.join(__dirname, "../docs/sql/core-entity-mutations.sql"), "utf8");
  execFileSync("psql", [...args, "-d", database], { input: migration, stdio: ["pipe", "pipe", "pipe"] });
  sql(`
    insert into public.household_members(id, household_id, first_name, sort_order)
      values ('${memberId}', '${householdId}', 'Robin', 0), ('${memberB}', '${householdId}', 'Sam', 1);
    insert into public.event_types(id, household_id, name, sort_order)
      values ('${typeA}', '${householdId}', 'School', 0), ('${typeB}', '${householdId}', 'Family', 1);
    insert into public.contacts(id, household_id, first_name)
      values ('${contactId}', '${householdId}', 'Original');
  `);

  const batch = [
    {
      entityType: "contact", operation: "upsert", entityId: contactId,
      entity: { id: contactId, firstName: "Should roll back" },
    },
    {
      entityType: "event", operation: "upsert", entityId: ownEventId,
      entity: { id: ownEventId, title: "Invalid reference", date: "2026-10-21", memberIds: [missingMember] },
    },
  ];
  assert.throws(() => sql(`select public.mutate_household_entities(
    '${householdId}'::uuid, 0, ${quote(JSON.stringify(batch))}::jsonb)`));
  assert.equal(sql(`select first_name from public.contacts where id = '${contactId}'`), "Original");
  assert.equal(sql("select coalesce(max(revision), 0) from public.household_revisions"), "0");

  sql(`create function public.reject_test_member() returns trigger language plpgsql as $$
    begin
      if new.first_name = 'Injected failure' then raise exception 'injected member write failure'; end if;
      return new;
    end $$;
    create trigger reject_test_member before insert or update on public.household_members
      for each row execute function public.reject_test_member();`);
  assert.throws(() => sql(rpc(0, "familyMember", "upsert", memberId, {
    id: memberId, firstName: "Injected failure", order: 1,
  })));
  assert.equal(sql(`select first_name || ':' || sort_order from public.household_members where id = '${memberId}'`), "Robin:0");
  assert.equal(sql(`select sort_order from public.household_members where id = '${memberB}'`), "1");
  assert.equal(sql("select coalesce(max(revision), 0) from public.household_revisions"), "0");
  sql("drop trigger reject_test_member on public.household_members; drop function public.reject_test_member()");

  const invalidEvent = { id: ownEventId, title: "Invalid reference", date: "2026-10-21", memberIds: [missingMember] };
  assert.throws(() => sql(rpc(0, "event", "upsert", ownEventId, invalidEvent)));
  assert.throws(() => sql(rpc(0, "event", "upsert", ownEventId, {
    ...invalidEvent, memberIds: [memberId, memberId],
  })));
  assert.equal(sql("select coalesce(max(revision), 0) from public.household_revisions"), "0");

  const event = {
    id: ownEventId, title: "Keep references", date: "2026-10-21", memberIds: [memberId, memberB], eventTypeId: typeA,
  };
  assert.equal(sql(rpc(0, "event", "upsert", ownEventId, event)), "1");
  assert.throws(() => sql(rpc(1, "event", "upsert", ownEventId, { ...event, date: "2026-02-31" })));
  assert.equal(sql("select revision from public.household_revisions"), "1");

  assert.equal(sql(rpc(1, "familyMember", "upsert", memberId, {
    id: memberId, firstName: "Robin", order: 1,
  })), "2");
  assert.equal(sql(`select string_agg(first_name, ',' order by sort_order) from public.household_members`), "Sam,Robin");
  assert.equal(sql(rpc(2, "eventType", "upsert", typeA, {
    id: typeA, name: "School", sortOrder: 1,
  })), "3");
  assert.equal(sql(`select string_agg(name, ',' order by sort_order) from public.event_types`), "Family,School");

  assert.equal(sql(rpc(3, "familyMember", "delete", memberId, null)), "4");
  assert.equal(sql(`select array_to_string(member_ids, ',') from public.events where id = '${ownEventId}'`), memberB);
  assert.equal(sql(rpc(4, "eventType", "delete", typeA, null)), "5");
  assert.equal(sql(`select event_type_id is null from public.events where id = '${ownEventId}'`), "t");
  assert.throws(() => sql(rpc(4, "event", "upsert", ownEventId, event)), /stale household revision/);
  assert.equal(sql("select revision from public.household_revisions"), "5");
});

test("PostgreSQL event replacement is atomic and prevents cross-household transfers", {
  skip: !process.env.GROCERY_TEST_PG_SOCKET,
}, async (t) => {
  const database = `event_test_${process.pid}`;
  const foreignId = "00000000-0000-0000-0000-000000000099";
  const args = ["-h", process.env.GROCERY_TEST_PG_SOCKET, "-p", process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, db = database) => execFileSync("psql", [...args, "-d", db, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const payload = (id, title) => JSON.stringify([{
    id, title, event_date: "2026-10-21", member_ids: [memberId], all_day: true,
  }]);
  const asyncSql = (statement, applicationName) => new Promise((resolve) => execFile(
    "psql", [...args, "-d", database, "-c", statement],
    { encoding: "utf8", env: { ...process.env, PGAPPNAME: applicationName } },
    (error, stdout, stderr) => resolve({ error, stdout, stderr }),
  ));
  const waitForSleepingTransaction = async (applicationName) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (sql(`select exists (select 1 from pg_stat_activity where application_name = ${quote(applicationName)}
        and wait_event = 'PgSleep')`) === "t") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("event replacement transaction did not reach its pause");
  };

  sql(`create database ${database}`, "postgres");
  t.after(() => sql(`drop database ${database}`, "postgres"));
  sql(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create table public.households(id uuid primary key);
    create table public.household_members(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.contacts(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.event_types(id uuid primary key, household_id uuid not null references public.households(id));
    create table public.events(
      id uuid primary key,
      household_id uuid not null references public.households(id),
      title text not null,
      event_date date not null,
      end_date date,
      member_ids uuid[] not null default '{}',
      all_day boolean not null default true,
      start_time time,
      end_time time,
      event_type_id uuid references public.event_types(id),
      repeat_rule text,
      location text,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.day_configurations(id uuid primary key, household_id uuid not null references public.households(id));
    insert into public.households values ('${householdId}'), ('${foreignId}');
  `);
  const migration = readFileSync(path.join(__dirname, "../docs/sql/event-tenant-safety.sql"), "utf8");
  for (let run = 0; run < 2; run++) {
    execFileSync("psql", [...args, "-d", database], {
      input: migration,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  sql(`insert into public.events(id, household_id, title, event_date, member_ids)
    values ('${ownEventId}', '${householdId}', 'Keep this event', '2026-10-20', array['${memberId}']::uuid[]),
      ('${foreignEventId}', '${foreignId}', 'Foreign event contents', '2026-10-20', array['${memberId}']::uuid[])`);
  assert.throws(() => sql(`select public.replace_household_events('${householdId}'::uuid, ${quote(payload(foreignEventId, "Overwritten"))}::jsonb)`));
  assert.equal(sql(`select title from public.events where id = '${foreignEventId}'`), "Foreign event contents");
  assert.equal(sql(`select title from public.events where id = '${ownEventId}'`), "Keep this event",
    "failed replacement rolls back its deletion of the caller's events");
  assert.throws(() => sql(`update public.events set household_id = '${householdId}' where id = '${foreignEventId}'`));
  assert.equal(sql(`select household_id from public.events where id = '${foreignEventId}'`), foreignId);

  sql(`select public.replace_household_events('${householdId}'::uuid, ${quote(payload(ownEventId, "Updated safely"))}::jsonb)`);
  assert.equal(sql(`select title from public.events where id = '${ownEventId}'`), "Updated safely");

  const racedEventId = "00000000-0000-0000-0000-000000000006";
  const first = asyncSql(`begin;
    select public.replace_household_events('${householdId}'::uuid, ${quote(payload(racedEventId, "First writer"))}::jsonb);
    select pg_sleep(0.5);
    commit;`, "event-tenant-first-writer");
  await waitForSleepingTransaction("event-tenant-first-writer");
  const second = asyncSql(`select public.replace_household_events('${foreignId}'::uuid, ${quote(payload(racedEventId, "Second writer"))}::jsonb)`,
    "event-tenant-second-writer");
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.error, null, firstResult.stderr);
  assert.ok(secondResult.error, "the conflicting household writer must be rejected");
  assert.equal(sql(`select household_id from public.events where id = '${racedEventId}'`), householdId);
});
