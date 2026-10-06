const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const {
  validateParty, validatePlan, validateHandovers, compileHandovers, validateChange, resolveParentingTime, isoWeekNumber,
} = require("./shared/parentingTime");
const parentingTimeHandler = require("./parenting-time");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const fatherId = "00000000-0000-0000-0000-000000000003";
const motherId = "00000000-0000-0000-0000-000000000004";
const planId = "00000000-0000-0000-0000-000000000005";
const parties = [{ id: fatherId, name: "Father" }, { id: motherId, name: "Mother" }];

const representativePlan = () => validatePlan({
  effectiveFrom: "2026-01-01",
  recurrenceMode: "alternating",
  timeZone: "UTC",
  rules: [
    { id: randomUUID(), partyId: fatherId, weekday: 7, startTime: "19:30", endWeekday: 1, endTime: "19:30" },
    { id: randomUUID(), partyId: fatherId, weekday: 4, startTime: "19:30", endWeekday: 5, endTime: "17:00" },
    { id: randomUUID(), partyId: fatherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "19:30", weekParity: "odd" },
    { id: randomUUID(), partyId: motherId, weekday: 7, startTime: "00:00", endWeekday: 7, endTime: "19:30", weekParity: "even" },
    { id: randomUUID(), partyId: motherId, weekday: 1, startTime: "19:30", endWeekday: 4, endTime: "19:30" },
    { id: randomUUID(), partyId: motherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "19:30", weekParity: "even" },
  ],
}, parties);

const resolve = (plan, startAt, endAt, changes = []) => resolveParentingTime({
  plan: { ...plan, id: planId, active: true },
  parties,
  changes,
}, startAt, endAt);

test("resolves the odd/even ISO-week example without artificial handovers", () => {
  const plan = representativePlan();
  assert.deepEqual(resolve(plan, "2025-12-31T00:00:00Z", "2026-01-01T00:00:00Z"), []);
  const odd = resolve(plan, "2026-10-08T00:00:00Z", "2026-10-13T00:00:00Z");
  const fatherOdd = odd.filter((interval) => interval.partyId === fatherId);
  assert.equal(fatherOdd.length, 1);
  assert.equal(fatherOdd[0].startAt, "2026-10-08T19:30:00.000Z");
  assert.equal(fatherOdd[0].endAt, "2026-10-12T19:30:00.000Z");
  assert.equal(fatherOdd[0].source.type, "plan");
  assert.ok(fatherOdd[0].source.parts.some((part) => part.sources.some((source) => source.type === "recurring")));
  assert.deepEqual(odd.filter((interval) => interval.partyId === motherId).map(({ startAt, endAt }) => [startAt, endAt]), [
    ["2026-10-08T00:00:00.000Z", "2026-10-08T19:30:00.000Z"],
    ["2026-10-12T19:30:00.000Z", "2026-10-13T00:00:00.000Z"],
  ]);

  const even = resolve(plan, "2026-10-15T00:00:00Z", "2026-10-20T00:00:00Z");
  assert.deepEqual(even.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]), [
    ["2026-10-15T00:00:00.000Z", "2026-10-15T19:30:00.000Z", motherId],
    ["2026-10-15T19:30:00.000Z", "2026-10-16T17:00:00.000Z", fatherId],
    ["2026-10-16T17:00:00.000Z", "2026-10-18T19:30:00.000Z", motherId],
    ["2026-10-18T19:30:00.000Z", "2026-10-19T19:30:00.000Z", fatherId],
    ["2026-10-19T19:30:00.000Z", "2026-10-20T00:00:00.000Z", motherId],
  ]);
});

test("compiles a variable handover list into the requested odd/even parenting schedule", () => {
  const handovers = validateHandovers([
    { weekday: 1, time: "19:30", fromPartyId: fatherId, toPartyId: motherId },
    { weekday: 4, time: "19:30", fromPartyId: motherId, toPartyId: fatherId },
    { weekday: 5, time: "17:00", fromPartyId: fatherId, toPartyId: motherId, weekParity: "even" },
    { weekday: 7, time: "19:30", fromPartyId: motherId, toPartyId: fatherId, weekParity: "even" },
  ], parties);
  const plan = validatePlan({
    effectiveFrom: "2026-01-01", recurrenceMode: "alternating",
    rules: compileHandovers(handovers),
  }, parties);
  const odd = resolve(plan, "2026-10-08T19:30:00Z", "2026-10-12T19:30:00Z");
  assert.deepEqual(odd.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]), [
    ["2026-10-08T19:30:00.000Z", "2026-10-12T19:30:00.000Z", fatherId],
  ]);
  const even = resolve(plan, "2026-10-16T17:00:00Z", "2026-10-19T19:30:00Z");
  assert.deepEqual(even.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]), [
    ["2026-10-16T17:00:00.000Z", "2026-10-18T19:30:00.000Z", motherId],
    ["2026-10-18T19:30:00.000Z", "2026-10-19T19:30:00.000Z", fatherId],
  ]);
  const oneHandover = validateHandovers(handovers.slice(0, 1), parties);
  assert.equal(oneHandover.length, 1);
  assert.throws(() => compileHandovers(oneHandover), { status: 400 });
  const isoWeekBoundaryConflict = validateHandovers([
    { weekday: 1, time: "08:00", fromPartyId: fatherId, toPartyId: motherId, weekParity: "odd" },
    { weekday: 5, time: "17:00", fromPartyId: motherId, toPartyId: fatherId, weekParity: "even" },
  ], parties);
  assert.throws(() => compileHandovers(isoWeekBoundaryConflict), { status: 400, message: /from-party must match/ });
});

test("validates the four-handover alternating plan used by Settings", () => {
  const plan = validatePlan({
    effectiveFrom: "2026-01-01",
    recurrenceMode: "alternating",
    timeZone: "UTC",
    rules: [
      { partyId: motherId, weekday: 1, startTime: "19:30", endWeekday: 4, endTime: "19:30" },
      { partyId: fatherId, weekday: 4, startTime: "19:30", endWeekday: 5, endTime: "17:00" },
      { partyId: fatherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "19:30", weekParity: "odd" },
      { partyId: motherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "19:30", weekParity: "even" },
      { partyId: fatherId, weekday: 7, startTime: "19:30", endWeekday: 1, endTime: "19:30" },
    ],
  }, parties);
  const odd = resolve(plan, "2026-10-08T19:30:00Z", "2026-10-12T19:30:00Z");
  assert.deepEqual(odd.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]), [
    ["2026-10-08T19:30:00.000Z", "2026-10-12T19:30:00.000Z", fatherId],
  ]);
  const even = resolve(plan, "2026-10-16T17:00:00Z", "2026-10-19T19:30:00Z");
  assert.deepEqual(even.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]), [
    ["2026-10-16T17:00:00.000Z", "2026-10-18T19:30:00.000Z", motherId],
    ["2026-10-18T19:30:00.000Z", "2026-10-19T19:30:00.000Z", fatherId],
  ]);
});

test("supports weekly overnight and week-boundary intervals and ISO year transitions", () => {
  const plan = validatePlan({
    effectiveFrom: "2020-01-01",
    recurrenceMode: "weekly",
    rules: [
      { partyId: fatherId, weekday: 7, startTime: "23:30", endWeekday: 1, endTime: "01:00" },
      { partyId: motherId, weekday: 7, startTime: "00:00", endWeekday: 7, endTime: "23:30" },
      { partyId: motherId, weekday: 1, startTime: "01:00", endWeekday: 7, endTime: "00:00" },
    ],
  }, parties);
  assert.equal(resolve(plan, "2020-12-27T22:00:00Z", "2020-12-28T02:00:00Z")[1].startAt, "2020-12-27T23:30:00.000Z");
  assert.equal(isoWeekNumber("2021-01-01"), 53);
  assert.equal(isoWeekNumber("2021-01-04"), 1);

  const alternating = validatePlan({
    effectiveFrom: "2020-01-01",
    recurrenceMode: "alternating",
    rules: [
      { partyId: fatherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "19:30", weekParity: "odd" },
      { partyId: motherId, weekday: 1, startTime: "00:00", endWeekday: 5, endTime: "17:00" },
      { partyId: motherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "19:30", weekParity: "even" },
      { partyId: motherId, weekday: 7, startTime: "19:30", endWeekday: 1, endTime: "00:00" },
    ],
  }, parties);
  assert.equal(resolve(alternating, "2020-12-25T17:00:00Z", "2020-12-25T18:00:00Z")[0].partyId, motherId);
  assert.equal(resolve(alternating, "2021-01-01T17:00:00Z", "2021-01-01T18:00:00Z")[0].partyId, fatherId);
  assert.equal(resolve(alternating, "2021-01-08T17:00:00Z", "2021-01-08T18:00:00Z")[0].partyId, fatherId);
});

test("resolves household-local recurring times across daylight-saving transitions", () => {
  const plan = validatePlan({
    effectiveFrom: "2026-01-01",
    recurrenceMode: "weekly",
    timeZone: "America/New_York",
    rules: [
      { partyId: fatherId, weekday: 7, startTime: "01:30", endWeekday: 7, endTime: "02:30" },
      { partyId: motherId, weekday: 7, startTime: "00:00", endWeekday: 7, endTime: "01:30" },
      { partyId: motherId, weekday: 7, startTime: "02:30", endWeekday: 7, endTime: "00:00" },
    ],
  }, parties);
  const repeatedHour = resolve(plan, "2026-11-01T04:00:00Z", "2026-11-01T08:00:00Z");
  assert.equal(repeatedHour[1].startAt, "2026-11-01T05:30:00.000Z");
  assert.equal(repeatedHour[1].endAt, "2026-11-01T07:30:00.000Z");
  const nonexistent = validatePlan({
    ...plan,
    rules: [
      { partyId: fatherId, weekday: 7, startTime: "02:30", endWeekday: 7, endTime: "03:30" },
      { partyId: motherId, weekday: 7, startTime: "00:00", endWeekday: 7, endTime: "02:30" },
      { partyId: motherId, weekday: 7, startTime: "03:30", endWeekday: 7, endTime: "00:00" },
    ],
  }, parties);
  assert.throws(() => resolve(nonexistent, "2026-03-08T05:00:00Z", "2026-03-08T09:00:00Z"), { status: 400 });
});

test("limits plan resolution to its inclusive effective date range", () => {
  const plan = { ...representativePlan(), effectiveTo: "2026-10-08" };
  const intervals = resolve(plan, "2026-10-07T00:00:00Z", "2026-10-10T00:00:00Z");
  assert.ok(intervals.length > 0);
  assert.equal(intervals.at(-1).endAt, "2026-10-09T00:00:00.000Z");
  assert.throws(() => validatePlan({
    effectiveFrom: "2026-10-09", effectiveTo: "2026-10-08", recurrenceMode: "weekly", rules: [],
  }, parties), { status: 400, message: /effectiveTo must be on or after effectiveFrom/ });
});

test("one-off changes override only their interval and report the source", () => {
  const plan = representativePlan();
  const change = validateChange({
    partyId: motherId,
    startAt: "2026-10-09T18:00:00Z",
    endAt: "2026-10-09T20:00:00Z",
    label: "Agreed swap",
  }, parties);
  const result = resolve(plan, "2026-10-09T17:00:00Z", "2026-10-09T21:00:00Z", [change]);
  assert.deepEqual(result.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]), [
    ["2026-10-09T17:00:00.000Z", "2026-10-09T18:00:00.000Z", fatherId],
    ["2026-10-09T18:00:00.000Z", "2026-10-09T20:00:00.000Z", motherId],
    ["2026-10-09T20:00:00.000Z", "2026-10-09T21:00:00.000Z", fatherId],
  ]);
  assert.equal(result[1].source.type, "change");
  assert.equal(result[1].source.label, "Agreed swap");
  assert.throws(() => validateChange({
    partyId: fatherId, startAt: change.startAt, endAt: change.endAt, label: "Conflict",
  }, parties, [change]), { status: 400 });
  assert.throws(() => resolve(plan, "2026-10-09T17:00:00Z", "2026-10-09T21:00:00Z", [
    change, { ...change, id: randomUUID(), partyId: fatherId },
  ]), { status: 400 });
});

test("rejects invalid parties, rules, ambiguous schedules, and invalid resolution ranges", () => {
  assert.throws(() => validateParty({ name: " " }), { status: 400 });
  assert.deepEqual(validateParty({ name: "Mother" }), { name: "Mother", memberId: null });
  assert.deepEqual(validateParty({ name: "Father", memberId: fatherId }, [fatherId]),
    { name: "Father", memberId: fatherId });
  assert.throws(() => validateParty({ name: "Other household parent", memberId: motherId }, [fatherId]), { status: 400 });
  assert.throws(() => validatePlan({
    effectiveFrom: "2026-01-01", recurrenceMode: "weekly", rules: [],
  }, parties), { status: 400 });
  assert.throws(() => validatePlan({
    effectiveFrom: "2026-01-01", recurrenceMode: "weekly",
    rules: [
      { partyId: fatherId, weekday: 4, startTime: "19:30", endWeekday: 5, endTime: "17:00" },
      { partyId: motherId, weekday: 5, startTime: "16:00", endWeekday: 5, endTime: "18:00" },
    ],
  }, parties), { status: 400 });
  assert.throws(() => validatePlan({
    effectiveFrom: "2026-02-30", recurrenceMode: "weekly", rules: [],
  }, parties), { status: 400 });
  assert.throws(() => validatePlan({
    effectiveFrom: "2026-01-01", recurrenceMode: "weekly",
    rules: [
      { partyId: fatherId, weekday: 1, startTime: "09:00", endWeekday: 1, endTime: "17:00" },
      { partyId: motherId, weekday: 2, startTime: "09:00", endWeekday: 2, endTime: "17:00" },
    ],
  }, parties), { status: 400, message: /must assign a party for every time/ });
  assert.throws(() => validatePlan({
    effectiveFrom: "2026-01-01", recurrenceMode: "weekly",
    rules: [
      { partyId: motherId, weekday: 1, startTime: "00:00", endWeekday: 7, endTime: "00:00" },
      { partyId: motherId, weekday: 7, startTime: "00:00", endWeekday: 1, endTime: "00:00" },
    ],
  }, parties), { status: 400, message: /at least two parenting parties/ });
  assert.throws(() => resolve(representativePlan(), "2026-10-10", "2026-10-11"), { status: 400 });
  assert.throws(() => validateChange({
    partyId: fatherId, startAt: "2026-02-30T10:00:00Z", endAt: "2026-03-01T10:00:00Z", label: "Invalid date",
  }, parties), { status: 400 });
});

test("authenticated API persists and reloads parties, plans, changes, and resolved intervals", async (t) => {
  const originalFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  t.after(() => {
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  });

  const tables = {
    households: [{
      id: householdId, created_by_user_id: userId,
      household_members: [{ id: fatherId }, { id: motherId }],
    }],
    parenting_time_parties: [],
    parenting_time_plans: [],
    parenting_time_changes: [],
  };
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return Response.json({ id: userId });
    const table = parsed.pathname.split("/").pop();
    const params = parsed.searchParams;
    const matching = () => (tables[table] ?? []).filter((row) => [...params.entries()]
      .filter(([, value]) => value.startsWith("eq."))
      .every(([key, value]) => row[key] === value.slice(3)));
    if (options.method === "POST") {
      const payload = JSON.parse(options.body);
      const conflictColumn = params.get("on_conflict");
      const existing = conflictColumn && (tables[table] ?? []).find((row) =>
        row[conflictColumn] === payload[conflictColumn]);
      if (existing) Object.assign(existing, payload, { id: existing.id });
      else {
        const row = { ...payload, id: payload.id ?? randomUUID() };
        tables[table].push(row);
        return Response.json([row]);
      }
      return Response.json([existing]);
    }
    if (options.method === "PATCH") {
      const rows = matching();
      rows.forEach((row) => Object.assign(row, JSON.parse(options.body)));
      return Response.json(rows);
    }
    if (options.method === "DELETE") {
      const rows = matching();
      tables[table] = (tables[table] ?? []).filter((row) => !rows.includes(row));
      return new Response(null, { status: 204 });
    }
    return Response.json(matching());
  };

  const invoke = async (method, resource, body, query = {}) => {
    const context = {
      bindingData: { householdId, resource },
      log: { error() {} },
    };
    await parentingTimeHandler(context, {
      method, params: { householdId, resource }, query, body,
      headers: { authorization: ["Bearer", "unit-test"].join(" ") },
    });
    return context.res;
  };

  const father = await invoke("POST", "parties", { name: "Father", memberId: fatherId });
  const mother = await invoke("POST", "parties", { name: "Mother", memberId: motherId });
  assert.equal(father.status, 201);
  assert.equal(mother.status, 201);
  assert.equal(father.body.memberId, fatherId);
  assert.equal(mother.body.memberId, motherId);
  assert.equal(tables.parenting_time_parties[0].member_id, fatherId);
  const renamedMother = await invoke("PUT", "parties", { ...mother.body, name: "Mum", active: false });
  assert.equal(renamedMother.status, 200);
  assert.equal(renamedMother.body.name, "Mum");
  assert.equal(renamedMother.body.active, false);
  await invoke("PUT", "parties", { ...renamedMother.body, active: true });
  assert.equal((await invoke("POST", "plan", {
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    recurrenceMode: "alternating",
    handovers: [
      { weekday: 1, time: "19:30", fromPartyId: father.body.id, toPartyId: mother.body.id },
      { weekday: 4, time: "19:30", fromPartyId: mother.body.id, toPartyId: father.body.id },
      { weekday: 5, time: "17:00", fromPartyId: father.body.id, toPartyId: mother.body.id, weekParity: "even" },
      { weekday: 7, time: "19:30", fromPartyId: mother.body.id, toPartyId: father.body.id, weekParity: "even" },
    ],
  })).status, 200);
  assert.equal(tables.parenting_time_plans[0].effective_to, "2026-12-31");
  const draftPreview = await invoke("POST", "preview", {
    plan: {
      effectiveFrom: tables.parenting_time_plans[0].effective_from,
      timeZone: tables.parenting_time_plans[0].time_zone,
      recurrenceMode: tables.parenting_time_plans[0].recurrence_mode,
      handovers: tables.parenting_time_plans[0].handover_rules,
      rules: tables.parenting_time_plans[0].rules,
    },
    startAt: "2026-10-08T19:00:00Z",
    endAt: "2026-10-09T21:00:00Z",
  });
  assert.equal(draftPreview.status, 200);
  assert.ok(draftPreview.body.intervals.some((interval) => interval.partyId === father.body.id));
  assert.equal(tables.parenting_time_plans[0].handover_rules.length, 4);
  const persistedPreview = await invoke("GET", "resolve", undefined, {
    startAt: "2026-10-08T19:00:00Z", endAt: "2026-10-09T21:00:00Z",
  });
  assert.deepEqual(draftPreview.body.intervals.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]),
    persistedPreview.body.intervals.map(({ startAt, endAt, partyId: owner }) => [startAt, endAt, owner]));
  const oneOff = await invoke("POST", "changes", {
    partyId: mother.body.id, startAt: "2026-10-09T18:00:00Z", endAt: "2026-10-09T20:00:00Z", label: "Swap",
  });
  assert.equal(oneOff.status, 201);
  assert.equal(tables.parenting_time_changes[0].plan_id, tables.parenting_time_plans[0].id);
  assert.equal((await invoke("DELETE", "changes", undefined, { id: oneOff.body.id })).status, 204);
  assert.equal(tables.parenting_time_changes.length, 0);
  await invoke("POST", "changes", {
    partyId: mother.body.id, startAt: "2026-10-09T18:00:00Z", endAt: "2026-10-09T20:00:00Z", label: "Swap",
  });
  const loaded = await invoke("GET", undefined);
  assert.equal(loaded.body.parties.length, 2);
  assert.equal(loaded.body.plan.rules.length, 8);
  assert.equal(loaded.body.plan.handovers.length, 4);
  assert.equal(loaded.body.plan.effectiveTo, "2026-12-31");
  assert.equal(loaded.body.changes.length, 1);
  const resolved = await invoke("GET", "resolve", undefined, {
    startAt: "2026-10-08T19:00:00Z", endAt: "2026-10-09T21:00:00Z",
  });
  assert.equal(resolved.status, 200);
  assert.ok(resolved.body.intervals.some((interval) => interval.source.type === "change"));
  assert.ok(Object.values(tables).flat().filter((row) => row.household_id).every((row) => row.household_id === householdId));
});

test("API denies unauthenticated and non-owner access", async () => {
  const context = { bindingData: { householdId }, log: { error() {} } };
  const oldFetch = global.fetch;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  global.fetch = async (url) => new URL(url).pathname === "/auth/v1/user"
    ? Response.json({ id: "00000000-0000-0000-0000-000000000099" })
    : Response.json([]);
  try {
    await parentingTimeHandler(context, { method: "GET", params: { householdId }, headers: {} });
    assert.equal(context.res.status, 401);
    await parentingTimeHandler(context, { method: "GET", params: { householdId }, headers: { authorization: ["Bearer", "unit-test"].join(" ") } });
    assert.equal(context.res.status, 404);
  } finally {
    global.fetch = oldFetch;
  }
});
