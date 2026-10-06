const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const {
  validateProvider, validateArrangement, validateOverride, resolveOccurrences,
} = require("./shared/childcare");
const createChildcareProvider = require("./shared/db/providers/childcare");
const createGetChildcareCoverageTool = require("./shared/agent/tools/getChildcareCoverageTool");

const householdId = "00000000-0000-0000-0000-000000000001";
const providerId = "00000000-0000-0000-0000-000000000002";
const childId = "00000000-0000-0000-0000-000000000003";
const secondChildId = "00000000-0000-0000-0000-000000000004";
const arrangementId = "00000000-0000-0000-0000-000000000005";
const replacementId = "00000000-0000-0000-0000-000000000006";
const providers = [{ id: providerId }, { id: replacementId }];
const arrangement = {
  id: arrangementId, householdId, providerId, childIds: [childId, secondChildId],
  weekdays: [1], startDate: "2026-10-01", endDate: "2026-11-30",
  allDay: true, startTime: null, endTime: null,
};
const resolve = (arrangements, overrides, start = "2026-10-01", end = "2026-10-31") =>
  resolveOccurrences({ arrangements, overrides }, start, end);
const override = (data) => validateOverride({ arrangementId, originalDate: "2026-10-05", ...data }, [arrangement], providers);

test("weekly all-day and timed arrangements include all children and inclusive boundaries", () => {
  const timed = {
    ...arrangement, id: replacementId, weekdays: [3, 5],
    allDay: false, startTime: "11:45", endTime: "13:30",
  };
  const result = resolve([arrangement, timed], [], "2026-10-05", "2026-10-12");
  assert.deepEqual(result.map((item) => item.date), ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"]);
  assert.deepEqual(result[0].childIds, [childId, secondChildId]);
  assert.equal(result[0].startTime, null);
  assert.equal(result[1].startTime, "11:45");
  assert.equal(resolve([arrangement], [], "2026-09-01", "2026-09-30").length, 0);
  assert.equal(resolve([arrangement], [], "2026-12-01", "2026-12-31").length, 0);
  assert.equal(resolve([{ ...arrangement, endDate: null }], [], "2026-12-07", "2026-12-07").length, 1);
});

test("cancellation and provider/time replacement affect only the original occurrence", () => {
  const cancelled = resolve([arrangement], [override({ action: "cancel" })]);
  assert.deepEqual(cancelled.map((item) => item.date), ["2026-10-12", "2026-10-19", "2026-10-26"]);
  const replaced = resolve([arrangement], [override({
    action: "replace", providerId: replacementId, allDay: false, startTime: "11:45", endTime: "13:30",
  })]);
  assert.equal(replaced[0].providerId, replacementId);
  assert.equal(replaced[0].allDay, false);
  assert.equal(replaced[1].providerId, providerId);
  assert.equal(replaced[1].allDay, true);
  assert.equal(resolve([arrangement], [override({ action: "replace", providerId: replacementId })])[0].allDay, true);
  const timed = { ...arrangement, allDay: false, startTime: "11:45", endTime: "13:30" };
  const timeOnly = validateOverride({
    arrangementId, originalDate: "2026-10-05", action: "replace", endTime: "14:00",
  }, [timed], providers);
  assert.equal(resolve([timed], [timeOnly])[0].startTime, "11:45");
  assert.equal(resolve([timed], [timeOnly])[0].endTime, "14:00");
  const allDay = validateOverride({
    arrangementId, originalDate: "2026-10-05", action: "replace", allDay: true,
  }, [timed], providers);
  assert.equal(resolve([timed], [allDay])[0].startTime, null);
});

test("added care days attach to an arrangement without changing its weekly schedule", () => {
  const added = validateOverride({
    arrangementId, originalDate: "2026-10-06", action: "add",
  }, [arrangement], providers);
  const occurrences = resolve([arrangement], [added], "2026-10-05", "2026-10-12");
  assert.deepEqual(occurrences.map((item) => item.date), ["2026-10-05", "2026-10-06", "2026-10-12"]);
  assert.equal(occurrences[1].overrideAction, "add");
  assert.equal(occurrences[1].providerId, providerId);
  assert.deepEqual(occurrences[1].childIds, [childId, secondChildId]);
  const customized = validateOverride({
    arrangementId, originalDate: "2026-10-06", action: "add",
    providerId: replacementId, allDay: false, startTime: "10:00", endTime: "12:00",
  }, [arrangement], providers);
  assert.equal(resolve([arrangement], [customized], "2026-10-06", "2026-10-06")[0].startTime, "10:00");
  assert.throws(() => override({ action: "add", originalDate: "2026-10-05" }), { status: 400 });
  assert.throws(() => override({ action: "cancel", originalDate: "2026-10-06" }), { status: 400 });
  const removed = validateOverride({
    arrangementId, originalDate: "2026-10-06", action: "cancel",
  }, [arrangement], providers, [added]);
  assert.equal(resolve([arrangement], [removed], "2026-10-06", "2026-10-06").length, 0);
});

test("moves resolve into and out of the range without duplicates, retaining original identity", () => {
  const moved = override({ action: "move", movedDate: "2026-11-03" });
  assert.equal(resolve([arrangement], [moved]).length, 3);
  const incoming = resolve([arrangement], [moved], "2026-11-03", "2026-11-03");
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].originalDate, "2026-10-05");
  assert.equal(incoming[0].id, `${arrangementId}:2026-10-05`);
  const within = resolve([arrangement], [override({ action: "move", movedDate: "2026-10-06" })]);
  assert.equal(within.length, 4);
  assert.equal(within[0].date, "2026-10-06");
  const collision = resolve([arrangement], [override({ action: "move", movedDate: "2026-10-12" })]);
  assert.equal(collision.filter((item) => item.date === "2026-10-12").length, 2);
});

test("date-only recurrence is stable across leap days, year boundaries, and DST", () => {
  const everyDay = { ...arrangement, weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: "2024-01-01", endDate: null };
  assert.deepEqual(resolve([everyDay], [], "2024-02-28", "2024-03-01").map((item) => item.date),
    ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.equal(resolve([everyDay], [], "2026-10-24", "2026-10-26").length, 3);
  assert.equal(resolve([everyDay], [], "2026-12-31", "2027-01-01").length, 2);
});

test("validation rejects invalid dates, times, ranges, and cross-household references", () => {
  const validate = (data) => validateArrangement({ ...arrangement, ...data }, providers, [childId, secondChildId]);
  assert.deepEqual(validate({ childIds: [childId, childId] }).childIds, [childId]);
  for (const data of [
    { childIds: [] }, { childIds: [replacementId] }, { providerId: childId },
    { weekdays: [] }, { weekdays: [0] }, { weekdays: ["1"] },
    { startDate: "2026-02-30" }, { startDate: "0000-01-01" }, { endDate: "2026-09-01" },
    { allDay: "true" }, { startTime: "11:45" },
    { allDay: false }, { allDay: false, startTime: "13:30", endTime: "11:45" },
    { allDay: false, startTime: "24:00", endTime: "25:00" },
  ]) assert.throws(() => validate(data), { status: 400 });
  for (const data of [
    { action: "unknown" }, { action: "cancel", providerId }, { action: "cancel", allDay: true },
    { action: "replace" }, { action: "replace", providerId: childId },
    { action: "cancel", originalDate: "2026-10-06" }, { action: "cancel", arrangementId: childId },
    { action: "move", movedDate: "2026-10-05" }, { action: "move", movedDate: "2026-02-30" },
    { action: "replace", movedDate: "2026-10-06", providerId },
  ]) assert.throws(() => override(data), { status: 400 });
  assert.throws(() => resolve([arrangement], [], "2026-10-05", "2026-10-04"), { status: 400 });
  assert.throws(() => resolve([arrangement], [], "2026-01-01", "2027-01-02"), { status: 400 });
  assert.throws(() => resolve([arrangement], [], "2026-02-30", "2026-03-01"), { status: 400 });
  assert.throws(() => validateProvider({ name: " ", type: "daycare" }), { status: 400 });
  assert.throws(() => validateProvider({ name: "Carer", type: "other", active: "false" }), { status: 400 });
  assert.equal(validateProvider({ name: "Carer", type: "other" }).active, true);
});

test("provider reads paginate and every page is scoped by household", async () => {
  const calls = [];
  const provider = createChildcareProvider(async (table, options) => {
    calls.push({ table, ...options.params });
    return table === "childcare_providers" && options.params.offset === 0
      ? Array.from({ length: 500 }, (_, index) => ({ id: String(index), household_id: householdId, name: "Carer", type: "other" }))
      : [];
  });
  assert.equal((await provider.getChildcare(householdId)).providers.length, 500);
  assert.equal(calls.filter((call) => call.table === "childcare_providers").length, 2);
  assert.ok(calls.every((call) => call.household_id === `eq.${householdId}`));
});

test("authenticated API persists childcare, reloads it, resolves overrides, and rejects other households", async () => {
  const originalFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  const tables = {
    households: [{ id: householdId, name: "Test household", created_by_user_id: childId, household_members: [{ id: childId }, { id: secondChildId }] }],
    household_members: [{ id: childId, household_id: householdId, first_name: "Child", sort_order: 0 }],
    contacts: [], event_types: [], events: [], day_configurations: [],
    childcare_providers: [], childcare_arrangements: [], childcare_overrides: [],
  };
  const calls = [];
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") {
      return Response.json({ id: childId });
    }
    const table = parsed.pathname.split("/").pop();
    calls.push({ table, method: options.method, params: parsed.searchParams });
    if (options.method === "POST") {
      const row = { id: randomUUID(), ...JSON.parse(options.body) };
      const existing = table === "childcare_overrides" && tables[table].find((item) =>
        item.household_id === row.household_id && item.arrangement_id === row.arrangement_id && item.original_date === row.original_date);
      if (existing) Object.assign(existing, row, { id: existing.id });
      else tables[table].push(row);
      return Response.json([existing || row]);
    }
    const rows = tables[table].filter((row) => [...parsed.searchParams.entries()]
      .filter(([, value]) => value.startsWith("eq."))
      .every(([key, value]) => row[key] === value.slice(3)));
    if (options.method === "PATCH") {
      rows.forEach((row) => Object.assign(row, JSON.parse(options.body)));
    }
    return Response.json(rows);
  };
  try {
    const handler = require("./childcare");
    const invoke = async (method, resource, body, query, id = householdId, authenticated = true) => {
      const context = { log: { error() {} } };
      await handler(context, {
        method, params: { householdId: id, resource }, body, query,
        headers: authenticated ? { authorization: ["Bearer", "test-only"].join(" ") } : {},
      });
      return context.res;
    };
    const provider = await invoke("POST", "providers", { name: "Grandparents", type: "grandparent" });
    assert.equal(provider.status, 201);
    assert.equal(provider.body.active, true);
    const editedProvider = await invoke("PUT", "providers", {
      id: provider.body.id, name: "Grandma", type: "grandparent", active: false,
    });
    assert.equal(editedProvider.status, 200);
    assert.equal(editedProvider.body.name, "Grandma");
    assert.equal(editedProvider.body.active, false);
    assert.equal((await invoke("GET")).body.providers[0].active, false);
    assert.equal((await invoke("PUT", "providers", {
      ...editedProvider.body, active: true,
    })).body.active, true);
    assert.equal((await invoke("PUT", "providers", {
      id: replacementId, name: "Other household", type: "other", active: true,
    })).status, 404);
    const draft = { ...arrangement, providerId: provider.body.id };
    const beforePreview = calls.filter((call) => call.method !== "GET").length;
    const preview = await invoke("POST", "preview", {
      arrangement: { ...draft, id: undefined }, startDate: "2026-10-01", endDate: "2026-10-31",
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.occurrences.length, 4);
    assert.deepEqual(preview.body.occurrences[0].childIds, [childId, secondChildId]);
    assert.equal(calls.filter((call) => call.method !== "GET").length, beforePreview);
    assert.equal((await invoke("POST", "preview", {
      arrangement: { ...draft, childIds: [providerId] }, startDate: "2026-10-01", endDate: "2026-10-31",
    })).status, 400);
    assert.equal((await invoke("POST", "preview", {
      arrangement: { ...draft, id: undefined }, startDate: "2026-10-01", endDate: "2027-10-31",
    })).status, 400);
    const created = await invoke("POST", "arrangements", { ...arrangement, providerId: provider.body.id });
    assert.equal(created.status, 201);
    const updated = await invoke("PUT", "arrangements", {
      ...created.body, childIds: [secondChildId], allDay: false, startTime: "09:00", endTime: "17:00",
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.childIds, [secondChildId]);
    assert.equal(updated.body.startTime, "09:00");
    assert.equal(tables.childcare_arrangements.length, 1);
    assert.equal((await invoke("PUT", "arrangements", {
      ...created.body, id: replacementId,
    })).status, 400);
    assert.equal((await invoke("PUT", "arrangements", created.body)).status, 200);
    const addedDate = "2026-10-06";
    const addedCare = await invoke("PUT", "overrides", {
      arrangementId: created.body.id, originalDate: addedDate, action: "add",
    });
    assert.equal(addedCare.status, 200);
    const resolvedAdded = await invoke("GET", "occurrences", null, { startDate: addedDate, endDate: addedDate });
    assert.equal(resolvedAdded.body.occurrences.length, 1);
    assert.equal(resolvedAdded.body.occurrences[0].overrideAction, "add");
    assert.equal(resolvedAdded.body.occurrences[0].providerId, provider.body.id);
    assert.equal((await invoke("PUT", "overrides", {
      arrangementId: created.body.id, originalDate: addedDate, action: "cancel",
    })).status, 200);
    assert.equal((await invoke("GET", "occurrences", null, { startDate: addedDate, endDate: addedDate })).body.occurrences.length, 0);
    assert.equal((await invoke("PUT", "overrides", {
      arrangementId: created.body.id, originalDate: "2026-10-12", action: "add",
    })).status, 400);
    const overrideBody = { arrangementId: created.body.id, originalDate: "2026-10-05", action: "cancel" };
    assert.equal((await invoke("PUT", "overrides", overrideBody)).status, 200);
    assert.equal((await invoke("PUT", "overrides", { ...overrideBody, action: "move", movedDate: "2026-11-03" })).status, 200);
    assert.equal(tables.childcare_overrides.length, 2);
    const previewEdit = await invoke("POST", "preview", {
      arrangement: { ...created.body, allDay: false, startTime: "08:00", endTime: "16:00" },
      startDate: "2026-11-03", endDate: "2026-11-03",
    });
    assert.equal(previewEdit.status, 200);
    assert.equal(previewEdit.body.occurrences[0].overrideAction, "move");
    assert.equal(previewEdit.body.occurrences[0].startTime, "08:00");
    const conflictingEdit = { ...created.body, weekdays: [2] };
    assert.equal((await invoke("PUT", "arrangements", conflictingEdit)).status, 400);
    assert.equal((await invoke("POST", "preview", {
      arrangement: conflictingEdit, startDate: "2026-10-01", endDate: "2026-10-31",
    })).status, 400);
    assert.equal(tables.childcare_arrangements[0].weekdays[0], 1);
    const reload = await invoke("GET");
    assert.equal(reload.body.arrangements.length, 1);
    assert.deepEqual(reload.body.arrangements[0].childIds, [childId, secondChildId]);
    const resolved = await invoke("GET", "occurrences", null, { startDate: "2026-11-03", endDate: "2026-11-03" });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.occurrences.length, 1);
    assert.equal(resolved.body.occurrences[0].originalDate, "2026-10-05");
    assert.equal(resolved.body.occurrences[0].providerName, "Grandma");
    const db = require("./shared/db");
    const coverageTool = createGetChildcareCoverageTool({
      db,
      householdId,
      householdState: { members: [{ id: childId, firstName: "Child" }, { id: secondChildId, firstName: "Second child" }] },
      toClientError: (message) => Object.assign(new Error(message), { statusCode: 400 }),
    });
    const coverage = await coverageTool.execute({ fromDate: "2026-11-03", toDate: "2026-11-03" });
    assert.equal(coverage.count, 1);
    assert.equal(coverage.occurrences[0].provider, "Grandma");
    assert.equal(coverage.occurrences[0].change, "move");
    assert.deepEqual(coverage.occurrences[0].children.map((child) => child.name), ["Child", "Second child"]);
    assert.equal(coverage.occurrences[0].allDay, true);
    await assert.rejects(
      coverageTool.execute({ fromDate: "2026-11-03", toDate: "2027-11-04" }),
      { statusCode: 400 },
    );
    assert.equal((await invoke("GET", "occurrences", null, {})).status, 400);
    assert.equal((await invoke("POST", "arrangements", { ...arrangement, providerId: provider.body.id, childIds: [providerId] })).status, 400);
    assert.equal((await invoke("POST", "arrangements", arrangement)).status, 400);
    assert.equal((await invoke("GET", null, null, null, householdId, false)).status, 401);
    assert.equal((await invoke("POST", "preview", {
      arrangement: draft, startDate: "2026-10-01", endDate: "2026-10-31",
    }, null, householdId, false)).status, 401);
    const before = calls.length;
    assert.equal((await invoke("GET", null, null, null, replacementId)).status, 404);
    assert.equal(calls.length, before + 1);
    assert.equal((await invoke("PUT", "providers", editedProvider.body, null, replacementId)).status, 404);
    assert.equal((await invoke("POST", "preview", {
      arrangement: draft, startDate: "2026-10-01", endDate: "2026-10-31",
    }, null, replacementId)).status, 404);
    assert.ok(calls.filter((call) => call.table.startsWith("childcare_") && call.method === "GET")
      .every((call) => call.params.get("household_id") === `eq.${householdId}`));
    assert.ok(calls.filter((call) => call.method === "PATCH")
      .every((call) => call.params.get("household_id") === `eq.${householdId}` && call.params.has("id")));
    assert.equal(tables.events.length, 0);
    const healthContext = {};
    await require("./health")(healthContext, { query: { checks: "1" } });
    assert.equal(healthContext.res.status, 200);
    const householdContext = { log: { error() {} } };
    await require("./households")(householdContext, {
      method: "GET", params: { householdId }, headers: { authorization: ["Bearer", "test-only"].join(" ") },
    });
    assert.equal(householdContext.res.status, 200);
    assert.equal(householdContext.res.body.familyMembers[0].id, childId);
    assert.deepEqual(householdContext.res.body.events, []);
    const originalReplaceMembers = db.replaceMembers;
    db.replaceMembers = async () => { throw new Error("member participates in a childcare arrangement"); };
    try {
      await require("./households")(householdContext, {
        method: "PUT", params: { householdId }, body: { familyMembers: [] },
        headers: { authorization: ["Bearer", "test-only"].join(" ") },
      });
      assert.equal(householdContext.res.status, 409);
    } finally {
      db.replaceMembers = originalReplaceMembers;
    }
  } finally {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});
