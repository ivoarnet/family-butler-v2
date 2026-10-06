const test = require("node:test");
const assert = require("node:assert/strict");
const createProvider = require("./shared/db/providers/parentingTime");
const { validateCalendarSettings } = require("./shared/parentingTime");
const handler = require("./parenting-time");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const partyId = "00000000-0000-0000-0000-000000000a03";
const childId = "00000000-0000-0000-0000-000000000b04";
const otherId = "00000000-0000-0000-0000-000000000099";
const defaults = { showAwayHatching: false, householdPartyId: null, childMemberIds: [] };
const enabled = { showAwayHatching: true, householdPartyId: partyId, childMemberIds: [childId] };
const parties = [{ id: partyId, active: true }];

test("calendar settings provider returns defaults only for an absent row and propagates database errors", async () => {
  const calls = [];
  const provider = createProvider(async (table, options) => {
    calls.push({ table, options });
    return [];
  });
  const first = await provider.getParentingCalendarSettings(householdId);
  assert.deepEqual(first, defaults);
  first.childMemberIds.push(childId);
  assert.deepEqual(await provider.getParentingCalendarSettings(householdId), defaults);
  assert.ok(calls.every(({ table, options }) =>
    table === "parenting_time_calendar_settings" && options.params.household_id === `eq.${householdId}`));
  const error = new Error("calendar settings migration is missing");
  await assert.rejects(createProvider(async () => { throw error; }).getParentingCalendarSettings(householdId), error);
  await assert.rejects(provider.saveParentingCalendarSettings(householdId, defaults), /Failed to persist/);
});

test("calendar settings provider upserts one household row independently of plans and Events", async () => {
  const rows = new Map();
  const writes = [];
  const provider = createProvider(async (table, options) => {
    assert.equal(table, "parenting_time_calendar_settings");
    if (options.method === "POST") {
      assert.equal(options.params.on_conflict, "household_id");
      assert.equal(options.headers.Prefer, "return=representation,resolution=merge-duplicates");
      assert.equal(options.body.id, undefined);
      writes.push(options.body);
      rows.set(options.body.household_id, options.body);
      return [options.body];
    }
    const row = rows.get(options.params.household_id.slice(3));
    return row ? [row] : [];
  });
  assert.deepEqual(await provider.saveParentingCalendarSettings(householdId, enabled), enabled);
  assert.deepEqual(await provider.getParentingCalendarSettings(householdId), enabled);
  assert.deepEqual(await provider.getParentingCalendarSettings(otherId), defaults);
  assert.deepEqual(await provider.saveParentingCalendarSettings(householdId, defaults), defaults);
  assert.equal(rows.size, 1);
  assert.deepEqual(writes[0], {
    household_id: householdId, show_away_hatching: true, household_party_id: partyId, child_member_ids: [childId],
  });
});

test("calendar settings validation requires explicit selections, strict booleans, active parties and distinct household members", () => {
  assert.deepEqual(validateCalendarSettings(defaults, parties, [childId]), defaults);
  assert.deepEqual(validateCalendarSettings(enabled, parties, [childId]), enabled);
  assert.deepEqual(validateCalendarSettings({
    ...enabled, householdPartyId: partyId.toUpperCase(), childMemberIds: [childId.toUpperCase()],
  }, parties, [childId]), enabled);
  for (const data of [
    null, [], {}, { ...enabled, showAwayHatching: "true" }, { ...enabled, showAwayHatching: 1 },
    { ...enabled, showAwayHatching: null }, { ...enabled, householdPartyId: null },
    { ...enabled, householdPartyId: undefined }, { ...enabled, householdPartyId: "bad" },
    { ...enabled, householdPartyId: otherId }, { ...enabled, childMemberIds: [] },
    { ...enabled, childMemberIds: [otherId] }, { ...enabled, childMemberIds: [childId, childId] },
    { ...enabled, childMemberIds: [childId, null] }, { ...enabled, childMemberIds: ["bad"] },
    { ...enabled, childMemberIds: childId }, { ...enabled, childMemberIds: undefined },
    { ...defaults, childMemberIds: ["bad"] }, { ...defaults, householdPartyId: "bad" },
  ]) {
    assert.throws(() => validateCalendarSettings(data, parties, [childId]), { status: 400 });
  }
  assert.throws(() => validateCalendarSettings(enabled, [{ id: partyId, active: false }], [childId]), { status: 400 });
});

test("disabled calendar settings retain valid references and clear stale selections without guessing roles", () => {
  const disabled = { ...enabled, showAwayHatching: false };
  assert.deepEqual(validateCalendarSettings(disabled, parties, [childId]), disabled);
  assert.deepEqual(validateCalendarSettings(disabled, [{ id: partyId, active: false }], [childId]),
    { ...disabled, householdPartyId: null });
  assert.deepEqual(validateCalendarSettings(disabled, [], [childId]), { ...disabled, householdPartyId: null });
  assert.deepEqual(validateCalendarSettings(disabled, parties, []), { ...disabled, childMemberIds: [] });
  assert.deepEqual(validateCalendarSettings(disabled, [], []), defaults);
  assert.deepEqual(validateCalendarSettings({ ...disabled, childMemberIds: [childId, otherId] }, parties, [childId]), disabled);
  assert.deepEqual(validateCalendarSettings({ ...disabled, householdPartyId: otherId }, parties, [childId]),
    { ...disabled, householdPartyId: null });
});

test("authorized GET/PUT calendar-settings persist preferences, enforce ownership and never write plans or Events", async (t) => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  t.after(() => {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const calls = [];
  let stored = null;
  let active = true;
  let partyPresent = true;
  let memberPresent = true;
  let missingMigration = false;
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") {
      return options.headers.Authorization.endsWith("non-owner")
        ? Response.json({ id: otherId }) : Response.json({ id: userId });
    }
    const table = parsed.pathname.split("/").pop();
    calls.push({ table, method: options.method });
    if (table === "households") {
      assert.equal(parsed.searchParams.get("id"), `eq.${householdId}`);
      return Response.json(parsed.searchParams.get("created_by_user_id") === `eq.${userId}`
        ? [{ id: householdId, household_members: memberPresent ? [{ id: childId, role: "anything" }] : [] }] : []);
    }
    assert.equal(parsed.searchParams.get("household_id") ?? JSON.parse(options.body).household_id,
      options.method === "POST" ? householdId : `eq.${householdId}`);
    if (table === "parenting_time_parties") return Response.json(partyPresent
      ? [{ id: partyId, household_id: householdId, active }] : []);
    if (table === "parenting_time_plans" || table === "parenting_time_changes") {
      assert.equal(options.method, "GET");
      return Response.json([]);
    }
    assert.equal(table, "parenting_time_calendar_settings");
    if (missingMigration) return Response.json({ message: "table missing" }, { status: 404 });
    if (options.method === "POST") stored = JSON.parse(options.body);
    return Response.json(stored ? [stored] : []);
  };
  const invoke = async (method, body, token = "owner", resource = "calendar-settings") => {
    const context = { log: { error() {} } };
    await handler(context, {
      method, params: { householdId, resource }, body,
      query: { startAt: "2026-10-01T00:00:00Z", endAt: "2026-10-02T00:00:00Z" },
      headers: token ? { authorization: ["Bearer", token].join(" ") } : {},
    });
    return context.res;
  };
  for (const method of ["GET", "PUT"]) {
    assert.equal((await invoke(method, enabled, null)).status, 401);
    assert.equal((await invoke(method, enabled, "non-owner")).status, 404);
  }
  assert.ok(!calls.some(({ table }) => table === "parenting_time_calendar_settings"));
  assert.deepEqual(await invoke("GET"), { status: 200, body: defaults });
  assert.deepEqual(await invoke("PUT", enabled), { status: 200, body: enabled });
  assert.deepEqual(await invoke("GET"), { status: 200, body: enabled });
  assert.equal((await invoke("PUT", { ...enabled, childMemberIds: [otherId] })).status, 400);
  assert.equal((await invoke("PUT", { ...enabled, childMemberIds: [childId, childId] })).status, 400);
  assert.equal((await invoke("PUT", { ...enabled, showAwayHatching: "true" })).status, 400);
  assert.equal((await invoke("PUT", { ...enabled, householdPartyId: otherId })).status, 400);
  active = false;
  assert.equal((await invoke("PUT", enabled)).status, 400);
  assert.deepEqual(await invoke("PUT", { ...enabled, showAwayHatching: false }),
    { status: 200, body: { showAwayHatching: false, householdPartyId: null, childMemberIds: [childId] } });
  active = true;
  memberPresent = false;
  assert.equal((await invoke("PUT", enabled)).status, 400);
  assert.deepEqual(await invoke("PUT", { ...enabled, showAwayHatching: false }),
    { status: 200, body: { showAwayHatching: false, householdPartyId: partyId, childMemberIds: [] } });
  partyPresent = false;
  assert.deepEqual(await invoke("PUT", { ...enabled, showAwayHatching: false }), { status: 200, body: defaults });
  assert.deepEqual(await invoke("GET"), { status: 200, body: defaults });
  partyPresent = true;
  memberPresent = true;
  assert.deepEqual(await invoke("PUT", defaults), { status: 200, body: defaults });
  assert.equal((await invoke("POST", enabled)).status, 405);
  assert.equal((await invoke("DELETE", defaults)).status, 405);
  assert.ok(calls.every(({ table }) => ["households", "parenting_time_parties", "parenting_time_calendar_settings"].includes(table)));
  assert.equal(calls.filter(({ method }) => method === "POST").length, 5);
  missingMigration = true;
  assert.equal((await invoke("GET")).status, 500);
  assert.equal((await invoke("PUT", enabled)).status, 500);
  // Existing reads never consult the new settings table, even before its migration.
  const before = calls.filter(({ table }) => table === "parenting_time_calendar_settings").length;
  assert.equal((await invoke("GET", undefined, "owner", "")).status, 200);
  assert.equal((await invoke("GET", undefined, "owner", "resolve")).status, 200);
  assert.equal(calls.filter(({ table }) => table === "parenting_time_calendar_settings").length, before);
});
