const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("./households");
const health = require("./health");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const memberId = "00000000-0000-0000-0000-000000000a03";
const foreignId = "00000000-0000-0000-0000-000000000004";

test("household member details persist, preserve older saves, validate input and retain ownership boundaries", async (t) => {
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
  let members = [];
  const writes = [];
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") {
      return Response.json({ id: options.headers.Authorization.endsWith("non-owner") ? foreignId : userId });
    }
    const table = parsed.pathname.split("/").pop();
    if (options.method !== "GET") {
      const body = options.body ? JSON.parse(options.body) : null;
      writes.push({ table, body });
      if (table === "household_members" && options.method === "POST") members = body;
      return new Response(null, { status: 204 });
    }
    if (table === "households") {
      return Response.json(parsed.searchParams.get("created_by_user_id") === `eq.${userId}`
        ? [{ id: householdId, name: "Family", holiday_region: "CH" }] : []);
    }
    if (table === "household_members") {
      if (parsed.searchParams.has("id")) {
        return Response.json(parsed.searchParams.get("id") === `eq.${foreignId}`
          ? [{ household_id: foreignId }] : []);
      }
      assert.ok(parsed.searchParams.get("select").includes("is_child,hatch_parenting_away,school_building,school_class"));
      return Response.json(members);
    }
    return Response.json([]);
  };
  const invoke = async (method, familyMembers, token = "owner") => {
    const context = { log: { error() {} } };
    await handler(context, {
      method, params: { householdId }, body: { familyMembers },
      headers: token ? { authorization: ["Bearer", token].join(" ") } : {},
    });
    return context.res;
  };
  const oldMember = { id: memberId, firstName: "Robin", role: "Child" };
  await t.test("new older-client members default to false without inferring a free-text role", async () => {
    const response = await invoke("PUT", [oldMember]);
    assert.equal(response.status, 200);
    assert.equal(response.body.familyMembers[0].isChild, false);
    assert.equal(response.body.familyMembers[0].hatchParentingAway, false);
    assert.equal(response.body.familyMembers[0].role, "Child");
    assert.equal(members[0].is_child, false);
    assert.equal(members[0].hatch_parenting_away, false);
    assert.equal(members[0].school_building, null);
    assert.equal(members[0].school_class, null);
  });
  await t.test("child flag and trimmed school details round-trip and unknown inputs stay isolated", async () => {
    const response = await invoke("PUT", [{
      ...oldMember, role: "Any unrestricted description", isChild: true, hatchParentingAway: true,
      schoolBuilding: " Sagenhof ", schoolClass: " 5f ", householdId: foreignId, unknown: "ignored",
    }]);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [members[0].is_child, members[0].hatch_parenting_away, members[0].school_building, members[0].school_class, members[0].household_id],
      [true, true, "Sagenhof", "5f", householdId],
    );
    assert.equal(members[0].unknown, undefined);
    const read = (await invoke("GET")).body.familyMembers[0];
    assert.equal(read.isChild, true);
    assert.equal(read.hatchParentingAway, true);
    assert.equal(read.schoolBuilding, "Sagenhof");
    assert.equal(read.schoolClass, "5f");
    assert.equal(read.role, "Any unrestricted description");
  });
  await t.test("omitted new fields survive older clients; explicit false and empty values clear", async () => {
    const response = await invoke("PUT", [{ ...oldMember, id: memberId.toUpperCase(), firstName: "Renamed" }]);
    assert.equal(response.status, 200);
    assert.deepEqual([members[0].is_child, members[0].hatch_parenting_away, members[0].school_building, members[0].school_class],
      [true, true, "Sagenhof", "5f"]);
    await invoke("PUT", [{ ...oldMember, isChild: false, hatchParentingAway: false, schoolBuilding: "", schoolClass: null }]);
    assert.deepEqual([members[0].is_child, members[0].hatch_parenting_away, members[0].school_building, members[0].school_class],
      [false, false, null, null]);
    await invoke("PUT", [oldMember]);
    assert.equal(members[0].is_child, false);
    assert.equal(members[0].hatch_parenting_away, false);
  });
  await t.test("strict types and school length limits reject before any persistence", async () => {
    for (const fields of [
      { isChild: "true" }, { isChild: 1 }, { isChild: null },
      { hatchParentingAway: "true" }, { hatchParentingAway: 1 }, { hatchParentingAway: null },
      { schoolBuilding: 1 }, { schoolBuilding: {} }, { schoolClass: [] },
      { schoolBuilding: "x".repeat(101) }, { schoolClass: "x".repeat(51) },
    ]) {
      const before = writes.length;
      assert.equal((await invoke("PUT", [{ ...oldMember, ...fields }])).status, 400);
      assert.equal(writes.length, before);
    }
    const response = await invoke("PUT", [{
      ...oldMember, schoolBuilding: "x".repeat(100), schoolClass: "😀".repeat(50),
    }]);
    assert.equal(response.status, 200);
    assert.equal(members[0].school_class, "😀".repeat(50));
    assert.equal(members[0].is_child, false);
  });
  await t.test("authentication and cross-household member ownership cannot be bypassed", async () => {
    const before = writes.length;
    assert.equal((await invoke("PUT", [oldMember], null)).status, 401);
    assert.equal((await invoke("PUT", [oldMember], "non-owner")).status, 404);
    assert.equal((await invoke("PUT", [{ ...oldMember, id: foreignId, isChild: true }])).status, 403);
    assert.equal(writes.length, before);
  });
  await t.test("health checks retain working Supabase connectivity through the provider", async () => {
    const context = {};
    await health(context, { method: "GET", query: { checks: "1" } });
    assert.equal(context.res.status, 200);
    assert.deepEqual(context.res.body.checks.database, { connected: true });
  });
});
