const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePlan, checkParentingResponsibility, resolvePersistedParentingTime,
} = require("./shared/parentingTime");
const handler = require("./parenting-time");
const db = require("./shared/db");
const createAgentTools = require("./shared/agent/tools");
const createCheckTool = require("./shared/agent/tools/checkParentingResponsibilityTool");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const fatherId = "00000000-0000-0000-0000-000000000003";
const motherId = "00000000-0000-0000-0000-000000000004";
const planId = "00000000-0000-0000-0000-000000000005";
const changeId = "00000000-0000-0000-0000-000000000006";
const otherId = "00000000-0000-0000-0000-000000000007";
const parties = [
  { id: fatherId, name: "Father", active: true },
  { id: motherId, name: "Mother", active: true },
];
const data = (overrides = {}) => ({
  parties,
  plan: {
    ...validatePlan({
      effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31",
      timeZone: "UTC", recurrenceMode: "weekly",
      rules: [
        { partyId: motherId, weekday: 1, startTime: "00:00", endWeekday: 5, endTime: "17:00" },
        { partyId: fatherId, weekday: 5, startTime: "17:00", endWeekday: 7, endTime: "00:00" },
        { partyId: fatherId, weekday: 7, startTime: "00:00", endWeekday: 1, endTime: "00:00" },
      ],
    }, parties), id: planId,
  },
  changes: [],
  ...overrides,
});
const check = (stored = data(), partyId = fatherId,
  startAt = "2026-10-09T16:00:00Z", endAt = "2026-10-09T18:00:00Z") =>
  checkParentingResponsibility(stored, partyId, startAt, endAt);
const unknown = (result, reason = "invalid_plan") => {
  assert.equal(result.status, "cannot_determine");
  assert.equal(result.reason, reason);
  assert.equal(result.responsible, null);
  assert.deepEqual(result.overlaps, []);
  assert.deepEqual(result.intervals, []);
  assert.ok(result.message);
};

test("responsibility means any overlap and retains clipped, explainable plan provenance", () => {
  const stored = data();
  const result = check(stored);
  assert.equal(result.status, "determined");
  assert.equal(result.responsible, true);
  assert.equal(result.partyId, fatherId);
  assert.equal(result.partyName, "Father");
  assert.deepEqual(result.parties, parties);
  assert.equal(result.timeZone, "UTC");
  assert.equal(result.intervals.length, 2);
  assert.equal(result.overlaps.length, 1);
  const interval = result.overlaps[0];
  assert.equal(interval.startAt, "2026-10-09T17:00:00.000Z");
  assert.equal(interval.endAt, "2026-10-09T18:00:00.000Z");
  assert.equal(interval.source.type, "plan");
  assert.equal(interval.source.planId, planId);
  assert.equal(interval.source.parts[0].sources[0].ruleId, stored.plan.rules[1].id);
});

test("half-open handover boundaries exclude touching intervals and do not imply full responsibility", () => {
  const before = check(data(), fatherId, "2026-10-09T16:00:00Z", "2026-10-09T17:00:00Z");
  assert.equal(before.responsible, false);
  assert.deepEqual(before.overlaps, []);
  assert.equal(check(data(), fatherId, "2026-10-09T17:00:00Z", "2026-10-09T18:00:00Z").responsible, true);
  assert.equal(check(data(), motherId, "2026-10-09T17:00:00Z", "2026-10-09T18:00:00Z").responsible, false);
  assert.equal(check(data(), motherId).responsible, true);
  assert.equal(check(data(), fatherId, "2026-10-12T00:00:00Z", "2026-10-12T01:00:00Z").responsible, false);
});

test("merged recurring intervals preserve each original rule's provenance", () => {
  const stored = data();
  const result = check(stored, fatherId, "2026-10-10T23:00:00Z", "2026-10-11T01:00:00Z");
  assert.equal(result.overlaps.length, 1);
  const parts = result.overlaps[0].source.parts;
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((part) => part.sources[0].ruleId),
    [stored.plan.rules[1].id, stored.plan.rules[2].id]);
  assert.equal(parts[0].endAt, parts[1].startAt);
});

test("one-off swaps override only their half-open interval and preserve change provenance", () => {
  const stored = data({ changes: [{
    id: changeId, planId, partyId: motherId,
    startAt: "2026-10-09T18:00:00Z", endAt: "2026-10-09T20:00:00Z", label: "Agreed swap",
  }] });
  const result = check(stored, motherId, "2026-10-09T17:00:00Z", "2026-10-09T21:00:00Z");
  assert.equal(result.responsible, true);
  assert.deepEqual(result.overlaps[0].source,
    { type: "change", planId, changeId, label: "Agreed swap" });
  assert.equal(result.overlaps[0].startAt, "2026-10-09T18:00:00.000Z");
  assert.equal(result.overlaps[0].endAt, "2026-10-09T20:00:00.000Z");
  assert.equal(check(stored, fatherId, "2026-10-09T18:00:00Z", "2026-10-09T20:00:00Z").responsible, false);
  assert.equal(check(stored, motherId, "2026-10-09T20:00:00Z", "2026-10-09T21:00:00Z").responsible, false);
  const returning = check(stored, fatherId, "2026-10-09T17:00:00Z", "2026-10-09T21:00:00Z");
  assert.equal(returning.overlaps.length, 2);
});

test("all-day midnight boundaries respect offsets, inclusive effectiveTo and exclusive request end", () => {
  const stored = data();
  stored.plan.timeZone = "America/New_York";
  stored.plan.effectiveFrom = "2026-10-09";
  stored.plan.effectiveTo = "2026-10-11";
  const allDay = check(stored, motherId, "2026-10-11T00:00:00-04:00", "2026-10-12T00:00:00-04:00");
  assert.equal(allDay.status, "determined");
  assert.equal(allDay.responsible, false);
  assert.equal(allDay.startAt, "2026-10-11T04:00:00.000Z");
  assert.equal(allDay.endAt, "2026-10-12T04:00:00.000Z");
  assert.equal(check(stored, motherId, "2026-10-09T00:00:00-04:00", "2026-10-09T17:00:00-04:00").responsible, true);
  unknown(check(stored, fatherId, "2026-10-08T23:59:59-04:00", "2026-10-09T01:00:00-04:00"),
    "outside_effective_plan");
  unknown(check(stored, fatherId, "2026-10-11T23:00:00-04:00", "2026-10-12T00:00:00.001-04:00"),
    "outside_effective_plan");
  unknown(check(stored, fatherId, "2026-10-12T00:00:00-04:00", "2026-10-13T00:00:00-04:00"),
    "outside_effective_plan");
});

test("missing or inactive plans return unknown, but malformed request ranges remain 400", () => {
  unknown(check(data({ plan: null })), "no_active_plan");
  unknown(check(data({ plan: { active: false } })), "no_active_plan");
  assert.throws(() => check(data({ plan: null }), fatherId, "not-a-date", "also-invalid"), { status: 400 });
  assert.throws(() => resolvePersistedParentingTime(data({ plan: null }), null, null), { status: 400 });
});

test("partial persisted resolution retains known intervals without making partial checks determinate", () => {
  const stored = data();
  stored.plan.effectiveFrom = "2026-10-09";
  stored.plan.effectiveTo = "2026-10-11";
  for (const [startAt, endAt, expectedStart, expectedEnd] of [
    ["2026-10-08T00:00:00Z", "2026-10-09T18:00:00Z", "2026-10-09T00:00:00.000Z", "2026-10-09T18:00:00.000Z"],
    ["2026-10-11T23:00:00Z", "2026-10-12T01:00:00Z", "2026-10-11T23:00:00.000Z", "2026-10-12T00:00:00.000Z"],
    ["2026-10-08T00:00:00Z", "2026-10-13T00:00:00Z", "2026-10-09T00:00:00.000Z", "2026-10-12T00:00:00.000Z"],
  ]) {
    const partial = resolvePersistedParentingTime(stored, startAt, endAt, { allowPartial: true });
    assert.equal(partial.status, "cannot_determine");
    assert.equal(partial.reason, "outside_effective_plan");
    assert.equal(partial.timeZone, "UTC");
    assert.deepEqual(partial.parties, parties);
    assert.equal(partial.intervals[0].startAt, expectedStart);
    assert.equal(partial.intervals.at(-1).endAt, expectedEnd);
    assert.equal(partial.intervals[0].source.planId, planId);
    unknown(check(stored, fatherId, startAt, endAt), "outside_effective_plan");
  }
  const fullyOutside = resolvePersistedParentingTime(stored,
    "2026-10-12T00:00:00Z", "2026-10-13T00:00:00Z", { allowPartial: true });
  assert.equal(fullyOutside.status, "cannot_determine");
  assert.equal(fullyOutside.reason, "outside_effective_plan");
  assert.deepEqual(fullyOutside.intervals, []);
  stored.plan.rules = [];
  const invalid = resolvePersistedParentingTime(stored,
    "2026-10-08T00:00:00Z", "2026-10-13T00:00:00Z", { allowPartial: true });
  assert.equal(invalid.reason, "invalid_plan");
  assert.deepEqual(invalid.intervals, []);
});

test("invalid persisted plans, gaps and ambiguous schedules are unknown rather than validation errors", () => {
  const mutations = [
    (stored) => { stored.plan.rules = []; },
    (stored) => { stored.plan.rules = {}; },
    (stored) => { stored.plan.rules = [null]; },
    (stored) => { stored.plan.rules[0].endTime = "16:00"; },
    (stored) => { stored.plan.rules[0].endTime = "18:00"; },
    (stored) => { stored.plan.rules[0].id = "broken"; },
    (stored) => { delete stored.plan.rules[0].id; },
    (stored) => { stored.plan.effectiveFrom = "2026-02-30"; },
    (stored) => { stored.plan.effectiveTo = "2025-01-01"; },
    (stored) => { stored.plan.timeZone = "Invalid/Zone"; },
    (stored) => { stored.plan.active = "true"; },
    (stored) => { stored.plan.handovers = {}; },
    (stored) => { stored.changes = null; },
    (stored) => { stored.changes = [null]; },
    (stored) => { stored.plan.id = "invalid"; },
  ];
  for (const mutate of mutations) {
    const stored = data();
    mutate(stored);
    unknown(check(stored));
  }
});

test("inactive or missing referenced parties in rules, changes and handovers never produce false no-conflict", () => {
  const missing = data({ parties: [parties[0]] });
  unknown(check(missing, fatherId, "2026-10-09T14:00:00Z", "2026-10-09T15:00:00Z"));
  const inactive = data({ parties: [parties[0], { ...parties[1], active: false }] });
  unknown(check(inactive, fatherId, "2026-10-09T14:00:00Z", "2026-10-09T15:00:00Z"));
  for (const invalidParty of [otherId, "00000000-0000-0000-0000-000000000008"]) {
    const stored = data({ parties: [...parties, { id: otherId, name: "Inactive party", active: false }] });
    stored.changes = [{
      id: changeId, partyId: invalidParty, startAt: "2026-10-09T14:00:00Z",
      endAt: "2026-10-09T15:00:00Z", label: "Invalid reference",
    }];
    unknown(check(stored, fatherId, "2026-10-09T14:00:00Z", "2026-10-09T15:00:00Z"));
  }
  const handover = data();
  handover.plan.handovers = [
    { fromPartyId: otherId, toPartyId: fatherId, weekday: 5, time: "17:00" },
  ];
  unknown(check(handover, motherId, "2026-10-09T17:00:00Z", "2026-10-09T18:00:00Z"));
  handover.parties = [...parties, { id: otherId, name: "Inactive party", active: false }];
  unknown(check(handover, motherId, "2026-10-09T17:00:00Z", "2026-10-09T18:00:00Z"));
});

test("invalid changes include overlaps, duplicates, invalid dates, foreign plan and out-of-plan ranges", () => {
  const change = {
    id: changeId, partyId: motherId, planId,
    startAt: "2026-10-09T18:00:00Z", endAt: "2026-10-09T20:00:00Z", label: "Swap",
  };
  for (const changes of [
    [change, { ...change, id: otherId }],
    [change, { ...change }],
    [{ ...change, startAt: "2026-02-30T18:00:00Z" }],
    [{ ...change, endAt: change.startAt }],
    [{ ...change, partyId: otherId }],
    [{ ...change, planId: otherId }],
    [{ ...change, startAt: "2025-12-31T18:00:00Z" }],
    [{ ...change, endAt: "2027-01-01T01:00:00Z" }],
  ]) unknown(check(data({ changes })));
});

test("DST nonexistent handovers become unknown while full-day ranges may be 23 or 25 hours", () => {
  const stored = data();
  stored.plan.timeZone = "America/New_York";
  stored.plan.rules[1].endTime = "02:30";
  stored.plan.rules[2].startTime = "02:30";
  unknown(check(stored, motherId, "2026-03-08T00:00:00-05:00", "2026-03-09T00:00:00-04:00"));
  const valid = data();
  valid.plan.timeZone = "America/New_York";
  assert.equal(check(valid, fatherId, "2026-03-08T00:00:00-05:00", "2026-03-09T00:00:00-04:00").responsible, true);
  assert.equal(check(valid, fatherId, "2026-11-01T00:00:00-04:00", "2026-11-02T00:00:00-05:00").responsible, true);
});

test("request validation requires an active household-party UUID and strict timezone-aware ordered range", () => {
  for (const id of [undefined, "me", otherId]) {
    assert.throws(() => checkParentingResponsibility(data(), id,
      "2026-10-09T16:00:00Z", "2026-10-09T18:00:00Z"), { status: 400 });
  }
  assert.throws(() => check(data({ parties: [{ ...parties[0], active: false }, parties[1]] })), { status: 400 });
  assert.equal(check(data(), fatherId.toUpperCase()).partyId, fatherId);
  for (const [start, end] of [
    ["2026-10-09", "2026-10-10"],
    ["2026-10-09T16:00:00", "2026-10-09T18:00:00Z"],
    ["2026-02-30T16:00:00Z", "2026-03-01T18:00:00Z"],
    ["2026-10-09T24:00:00Z", "2026-10-10T01:00:00Z"],
    ["2026-10-09T16:00:00+01:99", "2026-10-09T18:00:00Z"],
    ["2026-10-09T18:00:00Z", "2026-10-09T18:00:00Z"],
    ["2026-10-09T18:00:00Z", "2026-10-09T17:00:00Z"],
    ["2026-01-01T00:00:00Z", "2027-01-02T00:00:00.001Z"],
  ]) assert.throws(() => check(data(), fatherId, start, end), { status: 400 });
  // Exactly 366 days is a valid request even when the plan cannot cover it.
  unknown(check(data(), fatherId, "2026-01-01T00:00:00Z", "2027-01-02T00:00:00Z"), "outside_effective_plan");
});

test("POST check and GET resolve enforce authentication and household ownership before accessing schedules", async (t) => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  const oldHousehold = db.getParentingTimeHousehold;
  const oldData = db.getParentingTime;
  t.after(() => {
    global.fetch = oldFetch;
    db.getParentingTimeHousehold = oldHousehold;
    db.getParentingTime = oldData;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  global.fetch = async () => Response.json({ id: userId });
  let owned = true;
  let reads = 0;
  let stored = data();
  db.getParentingTimeHousehold = async (id, ownerId) => {
    assert.equal(id, householdId);
    assert.equal(ownerId, userId);
    return owned ? { id, memberIds: [] } : null;
  };
  db.getParentingTime = async (id) => {
    assert.equal(id, householdId);
    reads += 1;
    return stored;
  };
  const invoke = async (resource = "check", body = {
    partyId: fatherId, startAt: "2026-10-09T16:00:00Z", endAt: "2026-10-09T18:00:00Z",
  }, headers = { authorization: ["Bearer", "unit-test"].join(" ") }, id = householdId) => {
    const context = { log: { error() {} } };
    await handler(context, {
      method: resource === "resolve" ? "GET" : "POST", params: { householdId: id, resource },
      headers, body, query: body,
    });
    return context.res;
  };
  assert.equal((await invoke("check", {}, {})).status, 401);
  assert.equal(reads, 0);
  owned = false;
  assert.equal((await invoke()).status, 404);
  assert.equal((await invoke("resolve")).status, 404);
  assert.equal(reads, 0);
  owned = true;
  assert.equal((await invoke("check", {}, undefined, "invalid-household")).status, 400);
  assert.equal(reads, 0);
  const success = await invoke();
  assert.equal(success.status, 200);
  assert.equal(success.body.responsible, true);
  assert.equal((await invoke("check", null)).status, 400);
  assert.equal((await invoke("check", [])).status, 400);
  assert.equal((await invoke("check", { partyId: otherId })).status, 400);
  assert.equal((await invoke("check", { partyId: fatherId, startAt: "2026-10-09", endAt: "2026-10-10" })).status, 400);
  const resolved = await invoke("resolve");
  assert.equal(resolved.status, 200);
  assert.deepEqual(resolved.body.parties, parties);
  assert.equal(resolved.body.timeZone, "UTC");
  assert.equal(resolved.body.status, "determined");
  for (const range of [
    { startAt: "2025-12-31T23:00:00Z", endAt: "2026-01-01T01:00:00Z" },
    { startAt: "2026-12-31T23:00:00Z", endAt: "2027-01-01T01:00:00Z" },
  ]) {
    const partial = await invoke("resolve", range);
    assert.equal(partial.status, 200);
    assert.equal(partial.body.status, "cannot_determine");
    assert.equal(partial.body.reason, "outside_effective_plan");
    assert.ok(partial.body.intervals.length > 0);
    assert.equal(partial.body.intervals[0].startAt,
      range.startAt.startsWith("2025") ? "2026-01-01T00:00:00.000Z" : "2026-12-31T23:00:00.000Z");
    assert.equal(partial.body.intervals.at(-1).endAt,
      range.startAt.startsWith("2025") ? "2026-01-01T01:00:00.000Z" : "2027-01-01T00:00:00.000Z");
    const partialCheck = await invoke("check", { ...range, partyId: fatherId });
    assert.equal(partialCheck.status, 200);
    unknown(partialCheck.body, "outside_effective_plan");
  }
  stored = data({ plan: null });
  const missing = await invoke();
  assert.equal(missing.status, 200);
  unknown(missing.body, "no_active_plan");
  assert.equal((await invoke("resolve")).body.status, "cannot_determine");
  stored = data();
  stored.plan.rules = [];
  unknown((await invoke()).body);
  assert.equal((await invoke("resolve")).body.status, "cannot_determine");
  assert.equal((await invoke("resolve", {})).status, 400);
  stored = data();
  stored.parties = [parties[0], { ...parties[1], active: false }];
  unknown((await invoke()).body);
});

test("agent tool is read-only, household-scoped, registered and never infers me or removes event tools", async () => {
  let reads = 0;
  let stored = data();
  const scopedDb = {
    getParentingTime: async (id) => {
      assert.equal(id, householdId);
      reads += 1;
      return stored;
    },
  };
  const context = {
    db: scopedDb, householdId, householdState: { members: [] },
    toClientError: (message) => Object.assign(new Error(message), { statusCode: 400 }),
  };
  const tools = createAgentTools(context);
  const definition = tools.definitions.find((tool) => tool.name === "check_parenting_responsibility");
  assert.deepEqual(definition.parameters.required, ["partyId", "startAt", "endAt"]);
  assert.equal(definition.parameters.additionalProperties, false);
  assert.equal("householdId" in definition.parameters.properties, false);
  for (const name of ["add_event", "update_event_details", "get_events"]) {
    assert.ok(tools.definitions.some((tool) => tool.name === name));
  }
  const args = { partyId: fatherId, startAt: "2026-10-09T16:00:00Z", endAt: "2026-10-09T18:00:00Z" };
  const before = structuredClone(stored);
  const result = await tools.executeTool("check_parenting_responsibility", args);
  assert.equal(result.ok, true);
  assert.equal(result.responsible, true);
  assert.deepEqual(stored, before);
  assert.equal(reads, 1);
  for (const partyId of [undefined, "me", otherId]) {
    await assert.rejects(tools.executeTool("check_parenting_responsibility", { ...args, partyId }), { statusCode: 400 });
  }
  stored = data({ plan: null });
  unknown(await tools.executeTool("check_parenting_responsibility", args), "no_active_plan");
  stored = data();
  stored.plan.rules = [];
  unknown(await tools.executeTool("check_parenting_responsibility", args));
  const failure = new Error("database unavailable");
  const failing = createCheckTool({ ...context, db: { getParentingTime: async () => { throw failure; } } });
  await assert.rejects(failing.execute(args), failure);
});
