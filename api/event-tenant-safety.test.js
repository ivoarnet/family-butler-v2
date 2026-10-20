const test = require("node:test");
const assert = require("node:assert/strict");
const households = require("./households");
const createSupabaseProvider = require("./shared/db/providers/supabase");
const createAddEventTool = require("./shared/agent/tools/addEventTool");

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
  const result = await tool.execute({ event: {
    id: foreignEventId, title: "New event", date: "2026-10-21", memberIds: [memberId],
  } });
  assert.equal(result.ok, true);
  assert.match(savedEvents[0].id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(savedEvents[0].id, foreignEventId);
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
