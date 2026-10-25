const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("./households");
const health = require("./health");
const db = require("./shared/db");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const memberId = "00000000-0000-0000-0000-000000000a03";
const foreignId = "00000000-0000-0000-0000-000000000004";

test("core entity commands validate fields, require revisions, and return stale-write conflicts", async (t) => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  const oldGetHousehold = db.getHouseholdWithRelations;
  const oldGetMemberHouseholdId = db.getMemberHouseholdId;
  const oldMutate = db.mutateHouseholdEntity;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  const member = {
    id: memberId,
    firstName: "Robin",
    role: "Child",
    isChild: true,
    hatchParentingAway: true,
    schoolBuilding: "Sagenhof",
    schoolClass: "5f",
    avatarColor: "#3b82f6",
    visibleInCalendar: true,
    sortOrder: 0,
  };
  db.getHouseholdWithRelations = async (id, ownerId) => id === householdId && ownerId === userId
    ? {
        household: { id, name: "Family", holidayRegion: "CH" },
        revision: 7,
        members: [member],
        contacts: [],
        eventTypes: [],
        events: [],
        dayConfigurations: [],
      }
    : null;
  db.getMemberHouseholdId = async (id) => id === foreignId ? "00000000-0000-0000-0000-000000000099" : null;
  const writes = [];
  db.mutateHouseholdEntity = async (...args) => {
    writes.push(args);
    if (args[1] !== 7) {
      const error = new Error("stale household revision");
      error.status = 409;
      throw error;
    }
    return 8;
  };
  global.fetch = async (url, options) => String(url).endsWith("/auth/v1/user")
    ? Response.json({ id: options.headers.Authorization.endsWith("non-owner") ? foreignId : userId })
    : Response.json([]);
  t.after(() => {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
    db.getHouseholdWithRelations = oldGetHousehold;
    db.getMemberHouseholdId = oldGetMemberHouseholdId;
    db.mutateHouseholdEntity = oldMutate;
  });

  const invoke = async (method, body, token = "owner") => {
    const context = { log: { error() {} } };
    await handler(context, {
      method,
      params: { householdId },
      body,
      headers: token ? { "x-supabase-auth-token": token } : {},
    });
    return context.res;
  };

  const read = await invoke("GET");
  assert.equal(read.status, 200);
  assert.equal(read.body.revision, 7);
  assert.equal(writes.length, 0);
  const updatedMember = {
    id: memberId, firstName: "Renamed", role: "Child", isChild: true, hatchParentingAway: true,
    schoolBuilding: " School ", schoolClass: "5f", avatarColor: "#3b82f6", visibleInCalendar: true, order: 0,
  };
  const success = await invoke("PATCH", {
    expectedRevision: 7,
    entityType: "familyMember",
    entityId: memberId,
    operation: "upsert",
    entity: updatedMember,
  });
  assert.deepEqual(success, { status: 200, body: { revision: 8 } });
  assert.deepEqual(writes[0], [
    householdId,
    7,
    "familyMember",
    "upsert",
    memberId,
    { ...updatedMember, schoolBuilding: "School" },
  ]);

  const olderClientMember = await invoke("PATCH", {
    expectedRevision: 7,
    entityType: "familyMember",
    entityId: memberId,
    operation: "upsert",
    entity: { id: memberId, firstName: "Older client" },
  });
  assert.equal(olderClientMember.status, 200);
  assert.deepEqual(
    [writes[1][5].isChild, writes[1][5].hatchParentingAway, writes[1][5].schoolBuilding, writes[1][5].schoolClass],
    [true, true, "Sagenhof", "5f"]
  );
  const explicitClear = await invoke("PATCH", {
    expectedRevision: 7,
    entityType: "familyMember",
    entityId: memberId,
    operation: "upsert",
    entity: {
      id: memberId, firstName: "Robin", isChild: false, hatchParentingAway: false,
      schoolBuilding: "", schoolClass: null,
    },
  });
  assert.equal(explicitClear.status, 200);
  assert.deepEqual(
    [writes[2][5].isChild, writes[2][5].hatchParentingAway, writes[2][5].schoolBuilding, writes[2][5].schoolClass],
    [false, false, null, null]
  );

  const stale = await invoke("PATCH", {
    expectedRevision: 6,
    entityType: "familyMember",
    entityId: memberId,
    operation: "upsert",
    entity: updatedMember,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.conflict, true);

  const writeCount = writes.length;
  assert.equal((await invoke("PATCH", {
    entityType: "familyMember",
    entityId: memberId,
    operation: "upsert",
    entity: { ...member, isChild: "true" },
  })).status, 400);
  for (const fields of [
    { isChild: 1 }, { isChild: null }, { hatchParentingAway: "true" },
    { schoolBuilding: 1 }, { schoolClass: [] }, { schoolBuilding: "x".repeat(101) }, { schoolClass: "x".repeat(51) },
  ]) {
    assert.equal((await invoke("PATCH", {
      expectedRevision: 7,
      entityType: "familyMember",
      entityId: memberId,
      operation: "upsert",
      entity: { id: memberId, firstName: "Robin", ...fields },
    })).status, 400);
  }
  assert.equal((await invoke("PATCH", {
    expectedRevision: 7,
    entityType: "familyMember",
    entityId: foreignId,
    operation: "upsert",
    entity: { ...member, id: foreignId },
  })).status, 403);
  assert.equal((await invoke("PATCH", {
    expectedRevision: 7,
    entityType: "familyMember",
    entityId: memberId,
    operation: "upsert",
    entity: updatedMember,
  }, "non-owner")).status, 404);
  assert.equal((await invoke("PUT", { familyMembers: [] })).status, 405);
  assert.equal((await invoke("PATCH", {}, null)).status, 401);
  assert.equal(writes.length, writeCount);
});

test("health checks retain working Supabase connectivity through the provider", async (t) => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  global.fetch = async () => Response.json([]);
  t.after(() => {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const context = {};
  await health(context, { method: "GET", query: { checks: "1" } });
  assert.equal(context.res.status, 200);
  assert.deepEqual(context.res.body.checks.database, { connected: true });
});
