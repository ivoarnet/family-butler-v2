const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile, execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const households = require("./households");
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

const eventRow = (id) => ({
  id,
  household_id: householdId,
  title: "Existing event",
  event_date: "2026-10-20",
  end_date: null,
  member_ids: [memberId],
  all_day: true,
  start_time: null,
  end_time: null,
  event_type_id: null,
  repeat_rule: null,
  location: null,
  notes: null,
});

const invokeHouseholdPut = async (existingEvents, incomingEvents) => {
  let replacement;
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return Response.json({ id: userId });
    if (parsed.pathname.endsWith("/rpc/replace_household_events")) {
      replacement = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    }
    const table = parsed.pathname.split("/").pop();
    if (options.method !== "GET") return new Response(null, { status: 204 });
    if (table === "households") {
      return Response.json(parsed.searchParams.get("created_by_user_id") === `eq.${userId}`
        ? [{ id: householdId, name: "Family", holiday_region: "CH" }] : []);
    }
    if (table === "household_members") {
      return Response.json(parsed.searchParams.has("id")
        ? [{ household_id: householdId }]
        : [{
            id: memberId, household_id: householdId, first_name: "Robin", role: null,
            is_child: false, hatch_parenting_away: false, school_building: null, school_class: null,
            avatar_color: "#3b82f6", visible_in_calendar: true, sort_order: 0,
          }]);
    }
    if (table === "events") return Response.json(existingEvents);
    return Response.json([]);
  };

  const context = { log: { error() {} } };
  await households(context, {
    method: "PUT",
    params: { householdId },
    headers: { "x-supabase-auth-token": "test-token" },
    body: {
      familyMembers: [{ id: memberId, firstName: "Robin" }],
      events: incomingEvents,
    },
  });
  return { response: context.res, replacement };
};

test("HTTP event creates replace unknown client IDs and preserve IDs owned by this household", async (t) => {
  saveEnvironment(t);
  const create = await invokeHouseholdPut([], [{
    id: foreignEventId, title: "New event", date: "2026-10-21", memberIds: [memberId],
  }]);
  assert.equal(create.response.status, 200);
  assert.equal(create.replacement.p_household_id, householdId);
  assert.match(create.replacement.p_events[0].id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(create.replacement.p_events[0].id, foreignEventId);

  const update = await invokeHouseholdPut([eventRow(ownEventId)], [{
    id: ownEventId, title: "Updated event", date: "2026-10-22", memberIds: [memberId],
  }]);
  assert.equal(update.response.status, 200);
  assert.equal(update.replacement.p_events[0].id, ownEventId);
});

test("agent add_event ignores supplied IDs and generates an event ID", async () => {
  let savedEvents;
  const tool = createAddEventTool({
    db: { replaceEvents: async (id, events) => { assert.equal(id, householdId); savedEvents = events; } },
    householdId,
    householdState: { members: [{ id: memberId, firstName: "Robin" }], contacts: [], eventTypes: [], events: [] },
    toClientError: (message) => new Error(message),
  });
  assert.equal("id" in tool.definition.parameters.properties.event.properties, false);
  assert.match(tool.definition.description, /UNTIL=YYYYMMDD/);
  const result = await tool.execute({ event: {
    id: foreignEventId, title: "New event", date: "2026-10-21", memberIds: [memberId],
    repeatRule: "RRULE:FREQ=WEEKLY;UNTIL=20261231",
  } });
  assert.equal(result.ok, true);
  assert.match(savedEvents[0].id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(savedEvents[0].id, foreignEventId);
  assert.equal(savedEvents[0].repeatRule, "RRULE:FREQ=WEEKLY;UNTIL=20261231");
});

test("agent event updates cannot select IDs outside the household state", async () => {
  let writes = 0;
  const tool = createUpdateEventDetailsTool({
    db: { replaceEvents: async () => { writes++; } },
    householdId,
    householdState: {
      members: [{ id: memberId, firstName: "Robin" }],
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
    return new Response(null, { status: 204 });
  };
  const provider = createSupabaseProvider();
  await provider.replaceEvents(householdId, [{
    id: ownEventId, title: "Updated event", date: "2026-10-22", memberIds: [memberId], allDay: true,
  }]);

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/rpc\/replace_household_events$/);
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
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

test("PostgreSQL event replacement is atomic and prevents cross-household transfers", {
  skip: !process.env.GROCERY_TEST_PG_SOCKET,
}, async (t) => {
  const database = `event_test_${process.pid}`;
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
