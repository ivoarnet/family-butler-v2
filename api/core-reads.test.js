const test = require("node:test");
const assert = require("node:assert/strict");
const createSupabaseProvider = require("./shared/db/providers/supabase");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";

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

const jsonResponse = (rows, contentRange) => Response.json(rows, {
  headers: contentRange ? { "Content-Range": contentRange } : {},
});

test("core reads paginate beyond a smaller REST row cap and verify complete ranges", async (t) => {
  saveEnvironment(t);
  const pageSize = 100;
  let revision = 7;
  const members = Array.from({ length: 523 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index + 100).padStart(12, "0")}`,
    household_id: householdId,
    first_name: `Member ${index}`,
    sort_order: index,
  }));
  const requests = [];
  global.fetch = async (url) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").at(-1);
    requests.push({ table, url: parsed });
    if (table === "household_revisions") return jsonResponse([{ revision }]);
    if (table === "households") return jsonResponse([{
      id: householdId,
      name: "Family",
      holiday_region: "CH",
    }]);
    const matchingRows = table === "household_members" ? members : [];
    const offset = Number(parsed.searchParams.get("offset") || 0);
    const page = matchingRows.slice(offset, offset + pageSize);
    const range = page.length
      ? `${offset}-${offset + page.length - 1}/${matchingRows.length}`
      : `*/${matchingRows.length}`;
    return jsonResponse(page, range);
  };

  const provider = createSupabaseProvider();
  const snapshot = await provider.getHouseholdWithRelations(householdId, userId);
  assert.equal(snapshot.members.length, members.length);
  assert.equal(snapshot.members[522].firstName, "Member 522");
  assert.equal(snapshot.completeness.members, true);
  assert.equal(requests.filter(({ table }) => table === "household_members").length, 6);
  assert.equal(requests.find(({ table }) => table === "household_members").url.searchParams.get("order"), "sort_order.asc,id.asc");

  revision = 8;
  await assert.rejects(
    provider.replaceMembers(householdId, snapshot.members),
    /stale household snapshot/
  );
  snapshot.members.pop();
  await assert.rejects(
    provider.replaceMembers(householdId, snapshot.members),
    /incomplete household snapshot/
  );
  assert.equal(requests.filter(({ table }) => table === "household_members").length, 6);
});

test("entity mutation reads skip collections not needed by the command", async (t) => {
  saveEnvironment(t);
  const tables = [];
  global.fetch = async (url) => {
    const table = new URL(url).pathname.split("/").at(-1);
    tables.push(table);
    if (table === "household_revisions") return jsonResponse([{ revision: 2 }]);
    if (table === "households") return jsonResponse([{ id: householdId, name: "Family", holiday_region: "CH" }]);
    return jsonResponse([], "*/0");
  };

  const context = await createSupabaseProvider().getHouseholdWithRelations(householdId, userId, {
    mutationContext: true,
    includeMembers: false,
    includeEventTypes: false,
  });
  assert.deepEqual(tables.sort(), ["household_revisions", "household_revisions", "households"]);
  assert.deepEqual(context.members, []);
  assert.deepEqual(context.eventTypes, []);
  assert.equal(context.completeness.members, false);
  assert.equal(context.completeness.contacts, false);
  assert.equal(context.completeness.events, false);
});

test("core reads fail closed when Supabase omits completeness metadata", async (t) => {
  saveEnvironment(t);
  global.fetch = async (url) => {
    const table = new URL(url).pathname.split("/").at(-1);
    if (table === "household_revisions") return jsonResponse([{ revision: 0 }]);
    if (table === "households") return jsonResponse([{ id: householdId, name: "Family", holiday_region: "CH" }]);
    if (table === "household_members") return jsonResponse([]);
    return jsonResponse([], "*/0");
  };

  await assert.rejects(
    createSupabaseProvider().getHouseholdWithRelations(householdId, userId),
    /completeness could not be verified/
  );
});

test("calendar reads are bounded but retain recurring and overlapping events", async (t) => {
  saveEnvironment(t);
  const requests = [];
  const events = [
    { id: "event-on-window", event_date: "2026-06-10", end_date: null, repeat_rule: null },
    { id: "event-spanning-window", event_date: "2026-06-01", end_date: "2026-06-11", repeat_rule: null },
    { id: "event-recurring", event_date: "2026-01-01", end_date: null, repeat_rule: "RRULE:FREQ=WEEKLY" },
  ];
  global.fetch = async (url) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").at(-1);
    requests.push(parsed);
    if (table === "household_revisions") return jsonResponse([{ revision: 3 }]);
    if (table === "households") return jsonResponse([{ id: householdId, name: "Family", holiday_region: "CH" }]);
    if (table === "events") return jsonResponse(events, `0-${events.length - 1}/${events.length}`);
    return jsonResponse([], "*/0");
  };

  const provider = createSupabaseProvider();
  const snapshot = await provider.getHouseholdWithRelations(householdId, userId, {
    startDate: "2026-06-08",
    endDate: "2026-06-14",
  });
  const eventRequest = requests.find((url) => url.pathname.endsWith("/events"));
  assert.equal(snapshot.events.length, 3);
  assert.equal(snapshot.completeness.events, false);
  assert.match(eventRequest.searchParams.get("or"), /end_date\.gte\.2026-06-08/);
  assert.match(eventRequest.searchParams.get("or"), /repeat_rule\.not\.is\.null/);
  await assert.rejects(
    provider.replaceEvents(householdId, snapshot.events),
    /incomplete household snapshot/
  );
});
