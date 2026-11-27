const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile, execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const {
  validateInput, validateTimestamp, validateResolveInput, createToken, tokenDigest, getPublicToken, PUBLIC_HEADERS,
} = require("./shared/shareLinks");
const createProvider = require("./shared/db/providers/shareLinks");
const ownerHandler = require("./share-links");
const publicHandler = require("./shared-links-resolve");
const db = require("./shared/db");

const household = "00000000-0000-0000-0000-000000000001";
const owner = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
const id = "00000000-0000-0000-0000-000000000004";
const party = "00000000-0000-0000-0000-000000000005";
const plan = "00000000-0000-0000-0000-000000000006";
const now = Date.parse("2090-01-01T00:00:00Z");
const expiresAt = "2090-01-05T00:00:00.000Z";
const input = { resourceType: "parenting_changes", expiresAt, categories: ["holiday"] };
const metadata = { ...input, id, note: "", createdAt: "2089-01-01T00:00:00.000Z", viewCount: 0 };
const viewId = "12345678-abcd-4abc-8abc-123456789abc";
const anotherViewId = "12345678-abcd-4abc-9abc-123456789abc";
const createViewId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const bearer = (token) => ["Bearer", token].join(" ");
const change = {
  startAt: "2090-01-02T00:00:00.000Z", endAt: "2090-01-06T00:00:00.000Z",
  partyName: "Parent A", category: "holiday", label: "Holiday",
};
const publicData = { resourceType: "parenting_changes", expiresAt, timeZone: "Europe/Zurich", changes: [change] };

test("strict creation/update validation, calendar dates, scope and token encoding", () => {
  assert.deepEqual(validateInput(input, true, now), { ...input, note: "" });
  assert.deepEqual(validateInput({ note: "private", expiresAt: "2000-01-01T00:00:00+01:00" }, false, now),
    { note: "private", expiresAt: "1999-12-31T23:00:00.000Z" });
  assert.equal(validateTimestamp("2024-02-29T12:30:00.123456Z"), "2024-02-29T12:30:00.123Z");
  for (const invalid of [undefined, "", "2025-02-29T00:00:00Z", "2026-04-31T00:00:00Z",
    "2026-01-01", "2026-01-01T00:00:00", "2026-01-01T24:00:00Z", "2026-01-01T23:60:00Z",
    "2026-01-01T23:59:60Z", "0000-01-01T00:00:00Z", "2026-01-01T00:00:00+24:00", "infinity"]) {
    assert.throws(() => validateTimestamp(invalid), { status: 400 });
  }
  for (const invalid of [null, [], {}, { ...input, resourceType: "__proto__" },
    { ...input, resourceType: "parenting_plan" }, { ...input, householdId: other }, { ...input, token: "stored?" },
    { ...input, expiresAt: new Date(now).toISOString() }, { ...input, expiresAt: "2080-01-01T00:00:00Z" },
    { ...input, categories: [] }, { ...input, categories: ["holiday", "holiday"] },
    { ...input, categories: ["eq.holiday"] }, { ...input, categories: null }, { ...input, note: null },
    { ...input, note: "x".repeat(1001) }, { ...input, note: "\0" }]) {
    assert.throws(() => validateInput(invalid, true, now), { status: 400 });
  }
  for (const invalid of [{}, { categories: ["diverse"] }, { resourceType: "parenting_changes" },
    { token_digest: "overwrite" }, { created_by_user_id: other }, { expiresAt: null }]) {
    assert.throws(() => validateInput(invalid, false), { status: 400 });
  }
  const token = createToken();
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.equal(token.length, 43);
  assert.match(tokenDigest(token), /^[a-f0-9]{64}$/);
  assert.notEqual(token, createToken());
  assert.equal(getPublicToken({ Authorization: bearer(token) }), token);
  for (const name of ["x-share-token", "X-Share-Token", "X-SHARE-TOKEN"]) {
    assert.equal(getPublicToken({ [name]: token }), token);
    assert.equal(getPublicToken({ [name]: token, authorization: bearer("proxy-credential") }), token);
    for (const value of ["", undefined, null, [token], bearer(token), `${token}=`, ` ${token}`, `${token} `,
      "a".repeat(43), 123]) {
      assert.equal(getPublicToken({ [name]: value, authorization: bearer(token) }), null);
    }
  }
  assert.equal(getPublicToken({ "x-share-token": token, "X-Share-Token": token, authorization: bearer(token) }), null);
  for (const headers of [{}, { "x-supabase-auth-token": token }, { authorization: token },
    { authorization: bearer(`${token}=`) }, { authorization: bearer(`${token} `) },
    { authorization: ["Bearer", "", token].join(" ") }, { authorization: bearer("a".repeat(43)) }]) {
    assert.equal(getPublicToken(headers), null);
  }
});

test("public view identifiers require an exact UUIDv4 field and legacy refreshes remain uncounted", () => {
  for (const body of [undefined, null, "", {}]) assert.equal(validateResolveInput(body), undefined);
  assert.equal(validateResolveInput({ viewId: viewId.toUpperCase() }), viewId);
  for (const body of [[], "{}", 0, true, { viewId: null }, { viewId: undefined }, { viewId: 123 },
    { viewId: [] }, { viewId: "" }, { viewId: `${viewId} ` }, { viewId: id },
    { viewId: viewId.replace("-4abc-", "-5abc-") }, { viewId: viewId.replace("-8abc-", "-7abc-") },
    { viewId, note: "private" }, { viewCount: 1 }]) {
    assert.throws(() => validateResolveInput(body), { status: 400 });
  }
});

test("provider projects exact metadata/public allowlists, clips expiry and fails closed", async () => {
  const calls = [];
  const provider = createProvider(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return endpoint.endsWith("manage_share_links")
      ? { links: [{ ...metadata, token: "secret", token_digest: "secret", householdId: household }] }
      : { ...publicData, note: "secret", viewCount: 99, recent_view_ids: [viewId], householdId: household, rules: ["secret"],
        changes: [
          { ...change, memberId: other, partyId: party, notes: "secret" },
          { ...change, startAt: "2089-12-31T00:00:00Z" },
          { ...change, startAt: expiresAt },
        ] };
  });
  assert.deepEqual(await provider.manageShareLinks(household, owner, "list", {}), { links: [metadata] });
  const result = await provider.resolveShareLink(tokenDigest(createToken()), now);
  assert.deepEqual(result, { ...publicData, changes: [{ ...change, endAt: expiresAt }] });
  assert.equal(calls[1].endpoint, "rpc/resolve_share_link");
  assert.deepEqual(Object.keys(calls[1].options.body), ["p_digest", "p_now"]);
  await provider.resolveShareLink("digest", now, viewId);
  assert.deepEqual(calls[2].options.body, { p_digest: "digest", p_now: new Date(now).toISOString(), p_view_id: viewId });
  for (const viewCount of [undefined, null, "1", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(createProvider(async () => ({ links: [{ ...metadata, viewCount }] }))
      .manageShareLinks(household, owner, "list", {}), { message: "unavailable" });
  }
  for (const viewCount of [0, 12, Number.MAX_SAFE_INTEGER]) {
    assert.equal((await createProvider(async () => ({ link: { ...metadata, viewCount } }))
      .manageShareLinks(household, owner, "update", {})).link.viewCount, viewCount);
  }
  for (const expires of [new Date(now - 1).toISOString(), new Date(now).toISOString()]) {
    assert.equal(await createProvider(async () => ({ ...publicData, expiresAt: expires })).resolveShareLink("digest", now), null);
  }
  assert.notEqual(await createProvider(async () => ({ ...publicData, expiresAt: new Date(now + 1).toISOString(), changes: [] }))
    .resolveShareLink("digest", now), null);
  for (const data of [null, [], {}, { ...publicData, resourceType: "__proto__" },
    { ...publicData, timeZone: "invalid" }, { ...publicData, changes: Array(501).fill(change) },
    { ...publicData, changes: [{ ...change, category: "private" }] },
    { ...publicData, changes: [{ ...change, startAt: "2090-02-30T00:00:00Z" }] }]) {
    assert.equal(await createProvider(async () => data).resolveShareLink("digest", now), null);
  }
  await assert.rejects(createProvider(async () => ({ status: 429, error: "secret" })).resolveShareLink("digest", now), { status: 429 });
  await assert.rejects(createProvider(async () => ({ link: { ...metadata, id: "bad" } }))
    .manageShareLinks(household, owner, "create", {}), (error) => !error.status && error.message === "unavailable");
});

test("owner/public handlers authenticate separately, validate routes, prevent token persistence and redact failures", async (t) => {
  const oldFetch = global.fetch;
  const oldManage = db.manageShareLinks;
  const oldResolve = db.resolveShareLink;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_SECRET_KEY = "test-only";
  t.after(() => {
    global.fetch = oldFetch; db.manageShareLinks = oldManage; db.resolveShareLink = oldResolve;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  let authCalls = 0;
  global.fetch = async (_url, options) => {
    authCalls++;
    return Response.json({ id: options.headers.Authorization === bearer("other") ? other : owner });
  };
  const writes = [];
  db.manageShareLinks = async (h, u, action, data) => {
    assert.equal(h, household);
    if (u !== owner) throw Object.assign(new Error("provider credential"), { status: 404 });
    writes.push({ action, data });
    return action === "list" ? { links: [metadata] } : { link: metadata };
  };
  let resolves = 0;
  const requestedViews = [];
  db.resolveShareLink = async (digest, _now, requestedView) => {
    resolves++; requestedViews.push(requestedView); assert.match(digest, /^[a-f0-9]{64}$/); return publicData;
  };
  const logs = [];
  const invoke = async (handler, request) => {
    const context = { log: { error: (...args) => logs.push(args) } };
    await handler(context, request);
    assert.deepEqual(Object.fromEntries(Object.keys(PUBLIC_HEADERS).map((key) => [key, context.res.headers[key]])), PUBLIC_HEADERS);
    return context.res;
  };
  const own = (method, body = input, token = "owner", query = {}) =>
    invoke(ownerHandler, { method, body, params: { householdId: household }, headers: token ? { authorization: bearer(token) } : {}, query });
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    assert.equal((await own(method, input, null, { id })).status, 401);
    assert.equal((await own(method, method === "PATCH" ? { note: "x" } : input, "other", { id })).status, 404);
  }
  const created = await own("POST");
  assert.equal(created.status, 201);
  assert.equal(tokenDigest(created.body.token), writes.at(-1).data.digest);
  assert.ok(!JSON.stringify(writes).includes(created.body.token));
  assert.deepEqual((await own("GET")).body, { links: [metadata] });
  assert.equal((await own("PATCH", { expiresAt: "2000-01-01T00:00:00Z" }, "owner", { id })).status, 200);
  assert.equal((await own("DELETE", {}, "owner", { id })).status, 204);
  assert.equal((await own("PATCH", { id, note: "x" })).status, 400);
  assert.equal((await own("DELETE", {}, "owner", { id: "id.or.(x)" })).status, 400);
  assert.equal((await own("PUT")).status, 405);
  const before = authCalls;
  const shared = { method: "POST", headers: { authorization: bearer(created.body.token) }, body: {} };
  assert.equal((await invoke(publicHandler, shared)).status, 200);
  assert.equal(authCalls, before, "public tokens must never call user authentication");
  for (const request of [{ ...shared, headers: {} }, { ...shared, body: { householdId: household } },
    { ...shared, query: { id } }, { ...shared, body: [] }, { ...shared, body: "malicious" }]) {
    assert.equal((await invoke(publicHandler, request)).status, 404);
  }
  assert.equal(resolves, 1);
  for (const body of [undefined, null, "", {}, { viewId: viewId.toUpperCase() }]) {
    assert.equal((await invoke(publicHandler, { ...shared, body })).status, 200);
  }
  assert.deepEqual(requestedViews, [undefined, undefined, undefined, undefined, undefined, viewId]);
  for (const body of [{ viewId: id }, { viewId: null }, { viewId, viewCount: 1 }, { viewId: `${viewId} ` }]) {
    assert.equal((await invoke(publicHandler, { ...shared, body })).status, 404);
  }
  assert.equal(resolves, 6, "invalid view IDs must not reach the database");
  assert.equal((await invoke(publicHandler, { ...shared, method: "GET" })).status, 405);
  db.resolveShareLink = async () => { throw new Error("token digest and provider credentials"); };
  const unavailable = await invoke(publicHandler, shared);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, { error: "Shared links temporarily unavailable" });
  db.resolveShareLink = async () => ({ ...publicData, expiresAt: new Date(Date.now() - 1).toISOString() });
  assert.equal((await invoke(publicHandler, shared)).status, 404);
  db.resolveShareLink = async () => { throw Object.assign(new Error("sensitive"), { status: 429 }); };
  const throttled = await invoke(publicHandler, shared);
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers["Retry-After"], "60");
  db.manageShareLinks = async () => { throw new Error("credential/token digest"); };
  assert.deepEqual((await own("GET")).body, { error: "Internal server error" });
  assert.deepEqual(logs, []);
  global.fetch = async (url) => {
    assert.equal(new URL(url).pathname, "/rest/v1/households");
    return Response.json([]);
  };
  const healthContext = {};
  await require("./health")(healthContext, { method: "GET", query: { checks: "1" } });
  assert.equal(healthContext.res.status, 200);
  assert.equal(healthContext.res.body.checks.database.connected, true);
});

test("dedicated public token survives absent/replaced Authorization without user authentication or token leakage", async (t) => {
  const oldFetch = global.fetch;
  const oldResolve = db.resolveShareLink;
  t.after(() => { global.fetch = oldFetch; db.resolveShareLink = oldResolve; });
  global.fetch = async () => assert.fail("share headers must not authenticate Supabase users");
  const token = createToken();
  const digest = tokenDigest(token);
  const logs = [];
  const invoke = async (headers, handler = publicHandler) => {
    const context = { log: { error: (...args) => logs.push(args) } };
    await handler(context, { method: "POST", headers, body: {}, params: { householdId: household } });
    assert.deepEqual(Object.fromEntries(Object.keys(PUBLIC_HEADERS).map((key) => [key, context.res.headers[key]])), PUBLIC_HEADERS);
    for (const secret of [token, digest, "provider-credential"]) {
      assert.ok(!JSON.stringify(context.res).includes(secret));
      assert.ok(!JSON.stringify(logs).includes(secret));
    }
    return context.res;
  };
  const calls = [];
  db.resolveShareLink = createProvider(async (endpoint, options) => {
    calls.push({ endpoint, options });
    assert.equal(endpoint, "rpc/resolve_share_link");
    assert.equal(options.body.p_digest, digest);
    assert.ok(!JSON.stringify(options).includes(token));
    return publicData;
  }).resolveShareLink;
  for (const headers of [
    { "x-share-token": token },
    { "X-Share-Token": token, Authorization: bearer("proxy-credential") },
    { "x-share-token": token, authorization: bearer(createToken()) },
    { authorization: bearer(token) },
  ]) {
    const result = await invoke(headers);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ...publicData, changes: [{ ...change, endAt: expiresAt }] });
  }
  assert.equal(calls.length, 4);
  for (const value of ["", undefined, null, [token], `${token}=`, `${token} `, bearer(token), "a".repeat(43)]) {
    for (const name of ["x-share-token", "X-Share-Token"]) {
      const result = await invoke({ [name]: value, authorization: bearer(token) });
      assert.equal(result.status, 404);
      assert.deepEqual(result.body, { error: "share link not found" });
    }
  }
  assert.equal(calls.length, 4, "invalid dedicated tokens must never fall back or reach the database");
  assert.equal((await invoke({ "x-share-token": token }, ownerHandler)).status, 401);
  for (const missing of [null, { ...publicData, expiresAt: "2000-01-01T00:00:00Z" }]) {
    db.resolveShareLink = createProvider(async () => missing).resolveShareLink;
    const result = await invoke({ "x-share-token": token });
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: "share link not found" });
  }
  db.resolveShareLink = createProvider(async () => {
    throw new Error(`transport failed: ${token} ${digest} provider-credential`);
  }).resolveShareLink;
  const unavailable = await invoke({ "x-share-token": token });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unavailable.body, { error: "Shared links temporarily unavailable" });
  db.resolveShareLink = createProvider(async () => ({
    status: 429, error: `rate limited: ${token} ${digest} provider-credential`,
  })).resolveShareLink;
  const throttled = await invoke({ "x-share-token": token });
  assert.equal(throttled.status, 429);
  assert.deepEqual(throttled.body, { error: "Too many requests" });
  assert.equal(throttled.headers["Retry-After"], "60");
  assert.deepEqual(logs, []);
});

const pgSocket = process.env.SHARE_LINKS_TEST_PG_SOCKET || process.env.GROCERY_TEST_PG_SOCKET;
test("PostgreSQL share-link ownership, projections, live edits, bounds, expiry, distributed budget and RLS", {
  skip: !pgSocket,
}, async (t) => {
  const database = `share_links_test_${process.pid}`;
  const args = ["-h", pgSocket, "-p", process.env.SHARE_LINKS_TEST_PG_PORT || process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, databaseName = database) => execFileSync("psql", [...args, "-d", databaseName, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  sql(`create database ${database}`, "postgres");
  t.after(() => sql(`drop database ${database}`, "postgres"));
  sql(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.households(id uuid primary key, created_by_user_id uuid not null);
    create table public.household_members(id uuid primary key, household_id uuid not null references public.households(id));
    insert into auth.users values ('${owner}'), ('${other}');
    insert into public.households values ('${household}', '${owner}'), ('${other}', '${other}');
  `);
  for (const file of ["parenting-time.sql", "share-links.sql", "share-links.sql"]) {
    execFileSync("psql", [...args, "-d", database], {
      input: readFileSync(path.join(__dirname, "../docs/sql", file), "utf8"), stdio: ["pipe", "pipe", "pipe"],
    });
  }
  sql(`insert into public.share_links(id, household_id, created_by_user_id, resource_type, token_digest, expires_at, categories)
    values ('${id}', '${household}', '${owner}', 'parenting_changes', repeat('0', 64), '${expiresAt}', array['holiday']);
    alter table public.share_links drop column view_count, drop column recent_view_ids`);
  const migrate = () => execFileSync("psql", [...args, "-d", database], {
    input: readFileSync(path.join(__dirname, "../docs/sql/share-links.sql"), "utf8"), stdio: ["pipe", "pipe", "pipe"],
  });
  migrate();
  assert.equal(sql(`select view_count || ':' || cardinality(recent_view_ids) from public.share_links where id = '${id}'`), "0:0");
  sql(`delete from public.share_links where id = '${id}'`);
  sql(`
    insert into public.parenting_time_parties(id, household_id, name) values
      ('${party}', '${household}', 'Parent A'), ('${other}', '${other}', 'Private other party');
    insert into public.parenting_time_plans(id, household_id, effective_from, time_zone, recurrence_mode)
      values ('${plan}', '${household}', '2089-01-01', 'Europe/Zurich', 'weekly'),
        ('${other}', '${other}', '2089-01-01', 'UTC', 'weekly');
    insert into public.parenting_time_changes(household_id, plan_id, party_id, start_at, end_at, category, label)
      values ('${other}', '${other}', '${other}', '2090-01-02T00:00:00Z', '2090-01-03T00:00:00Z', 'holiday', 'private household change');
  `);
  const command = (action, data = {}, h = household, u = owner) =>
    JSON.parse(sql(`set role service_role; select public.manage_share_links('${h}', '${u}', ${quote(action)}, ${quote(JSON.stringify(data))}::jsonb)`));
  const resolve = (digest, at = now, requestedView) => {
    const viewArgument = requestedView === undefined ? "" : `, ${quote(requestedView)}::uuid`;
    const result = sql(`set role service_role; select public.resolve_share_link(${quote(digest)}, ${quote(new Date(at).toISOString())}${viewArgument})`);
    return result ? JSON.parse(result) : null;
  };
  const resolveAsync = (digest, requestedView) => new Promise((resolveResult, reject) => {
    const viewArgument = requestedView === undefined ? "" : `, ${quote(requestedView)}::uuid`;
    execFile("psql", [...args, "-d", database, "-c",
      `set role service_role; select public.resolve_share_link(${quote(digest)}, ${quote(new Date(now).toISOString())}${viewArgument})`],
    { encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolveResult(stdout.trim() ? JSON.parse(stdout.trim()) : null));
  });
  const token = createToken();
  const digest = tokenDigest(token);
  const link = command("create", { ...input, digest, note: "private note" }).link;
  assert.ok(link.id);
  assert.deepEqual(Object.keys(link).sort(), ["id", "resourceType", "expiresAt", "note", "categories", "createdAt", "viewCount"].sort());
  assert.equal(link.viewCount, 0);
  assert.ok(!JSON.stringify(link).includes(digest));
  const provider = createProvider(async (_endpoint, options) => {
    const { p_household, p_user, p_action, p_data } = options.body;
    return command(p_action, p_data, p_household, p_user);
  });
  assert.equal((await provider.manageShareLinks(household, owner, "list", {})).links[0].id, link.id);
  assert.equal(command("list", {}, household, other).status, 404);
  assert.equal(command("update", { id: link.id, note: "attack" }, other, other).status, 404);
  assert.equal(command("delete", { id: link.id }, household, other).status, 404);
  assert.equal(command("create", { ...input, digest: tokenDigest(createToken()), expiresAt: "2000-01-01T00:00:00.000Z" }).status, 400);
  assert.equal(command("create", { ...input, digest: tokenDigest(createToken()), categories: ["holiday", "holiday"] }).status, 400);
  assert.equal(command("create", { ...input, digest: tokenDigest(createToken()), resourceType: "other" }).status, 400);
  assert.equal(command("update", { id: link.id, digest: tokenDigest(createToken()) }).status, 400);
  assert.equal(command("update", { id: link.id, viewCount: 25 }).status, 400);
  assert.equal(command("create", { ...input, digest: tokenDigest(createToken()), viewCount: 25 }).status, 400);
  for (const data of [{ ...input, digest: "invalid" }, { ...input, digest, categories: [] },
    { ...input, digest, categories: ["invalid"] }, { ...input, digest, note: null },
    { ...input, digest, note: "x".repeat(1001) }, { ...input, digest, expiresAt: "2090-02-30T00:00:00.000Z" }]) {
    assert.equal(command("create", data).status, 400);
  }
  const add = (start, end, category, label) => sql(`insert into public.parenting_time_changes
    (household_id, plan_id, party_id, start_at, end_at, category, label)
    values ('${household}', '${plan}', '${party}', ${quote(start)}, ${quote(end)}, ${quote(category)}, ${quote(label)})`);
  add("2089-12-29T00:00:00Z", "2089-12-30T00:00:00Z", "holiday", "past");
  add("2089-12-31T00:00:00Z", "2090-01-01T00:00:00Z", "holiday", "ends now");
  add("2089-12-31T12:00:00Z", "2090-01-01T01:00:00Z", "holiday", "ongoing");
  add("2090-01-01T00:00:00Z", "2090-01-01T02:00:00Z", "holiday", "starts now");
  add("2090-01-02T00:00:00Z", "2090-01-06T00:00:00Z", "holiday", "clipped");
  add("2090-01-03T00:00:00Z", "2090-01-04T00:00:00Z", "diverse", "hidden category");
  add("2090-01-05T00:00:00Z", "2090-01-06T00:00:00Z", "holiday", "at expiry");
  add("2090-01-06T00:00:00Z", "2090-01-07T00:00:00Z", "holiday", "after expiry");
  let result = resolve(digest);
  assert.deepEqual(result.changes.map((item) => item.label), ["starts now", "clipped"]);
  assert.equal(Date.parse(result.changes[1].endAt), Date.parse(expiresAt));
  assert.deepEqual(Object.keys(result).sort(), ["resourceType", "expiresAt", "timeZone", "changes"].sort());
  assert.deepEqual(Object.keys(result.changes[0]).sort(), ["startAt", "endAt", "partyName", "category", "label"].sort());
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes(household));
  const count = () => command("list").links.find((item) => item.id === link.id).viewCount;
  assert.equal(count(), 0, "legacy refreshes do not count");
  assert.equal(resolve(digest, now, id), null, "non-v4 identifiers fail closed in SQL too");
  assert.equal(count(), 0);
  const duplicateOpens = await Promise.all(Array.from({ length: 8 }, () => resolveAsync(digest, viewId)));
  assert.ok(duplicateOpens.every((item) => item.changes));
  assert.equal(count(), 1, "concurrent retries count the mounted page once");
  assert.ok(resolve(digest, now, viewId.toUpperCase()).changes);
  assert.equal(count(), 1);
  assert.ok(resolve(digest, now, anotherViewId).changes);
  assert.equal(count(), 2, "a different mount counts separately");
  migrate();
  assert.equal(count(), 2, "reapplying migration preserves counts and deduplication");
  assert.ok(resolve(digest, now, viewId).changes);
  assert.equal(count(), 2);
  sql(`update public.parenting_time_changes set label = 'live label' where label = 'clipped'`);
  assert.equal(resolve(digest).changes[1].label, "live label");
  assert.equal(resolve(tokenDigest(createToken())), null);
  const allCategories = command("create", { ...input, digest: tokenDigest("category-scope-test"),
    categories: ["holiday", "diverse", "adjusted_handover"] }).link;
  add("2090-01-04T00:00:00Z", "2090-01-04T01:00:00Z", "adjusted_handover", "handover");
  assert.deepEqual(resolve(tokenDigest("category-scope-test")).changes.map((item) => item.category),
    ["holiday", "holiday", "diverse", "adjusted_handover"]);
  command("delete", { id: allCategories.id });
  assert.equal(resolve(digest, Date.parse(expiresAt) - 1).changes.length, 0);
  assert.equal(resolve(digest, Date.parse(expiresAt)), null);
  assert.equal(resolve(digest, Date.parse(expiresAt) + 1), null);
  assert.equal(resolve(digest, Date.parse(expiresAt), createViewId(1)), null);
  assert.equal(resolve(tokenDigest(createToken()), now, createViewId(1)), null);
  assert.equal(count(), 2);
  command("update", { id: link.id, expiresAt: "2000-01-01T00:00:00.000Z", note: "edited" });
  assert.equal(resolve(digest), null);
  assert.equal(resolve(digest, now, createViewId(1)), null);
  assert.equal(count(), 2);
  assert.equal(command("list").links[0].note, "edited");
  command("update", { id: link.id, expiresAt });
  sql(`update public.households set created_by_user_id = '${other}' where id = '${household}'`);
  assert.equal(resolve(digest), null);
  assert.deepEqual(command("list", {}, household, other), { links: [] });
  assert.equal(command("update", { id: link.id, note: "new owner attack" }, household, other).status, 404);
  assert.equal(command("delete", { id: link.id }, household, other).status, 404);
  sql(`update public.households set created_by_user_id = '${owner}' where id = '${household}'`);
  sql(`update public.share_links set read_count = 59, read_window = clock_timestamp() where id = '${link.id}'`);
  const concurrent = await Promise.all([resolveAsync(digest, createViewId(1)), resolveAsync(digest, createViewId(2))]);
  assert.equal(concurrent.filter((item) => item.changes).length, 1);
  assert.deepEqual(concurrent.find((item) => item.status === 429), { error: "rate limited", status: 429 });
  assert.equal(sql(`select read_count from public.share_links where id = '${link.id}'`), "60");
  assert.equal(count(), 3, "the rate-limited distinct open is not counted");
  sql(`update public.share_links set read_window = clock_timestamp() - interval '61 seconds' where id = '${link.id}'`);
  assert.ok(resolve(digest).changes);
  assert.equal(sql(`select read_count from public.share_links where id = '${link.id}'`), "1");
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(sql(`select has_table_privilege('${role}', 'public.share_links', 'SELECT')`), "f");
    assert.equal(sql(`select has_table_privilege('${role}', 'public.share_links', 'INSERT')`), "f");
    assert.throws(() => sql(`set role ${role}; select token_digest, note from public.share_links`));
  }
  for (const role of ["anon", "authenticated"]) {
    assert.throws(() => sql(`set role ${role}; select public.resolve_share_link('${digest}', now())`));
    assert.throws(() => sql(`set role ${role}; select public.resolve_share_link('${digest}', now(), '${viewId}')`));
    assert.throws(() => sql(`set role ${role}; select public.manage_share_links('${household}', '${owner}', 'list', '{}')`));
  }
  assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.share_links'::regclass`), "t");
  assert.match(sql(`select indexdef from pg_indexes where tablename = 'share_links' and indexdef like '%token_digest%'`), /UNIQUE INDEX/);
  assert.equal(sql(`select count(*) from public.share_links where token_digest = '${digest}'`), "1");
  assert.ok(!sql("select row_to_json(s) from public.share_links s").includes(token));
  sql(`insert into public.parenting_time_changes(household_id, plan_id, party_id, start_at, end_at, category, label)
    select '${household}', '${plan}', '${party}', '2090-01-02T00:00:00Z', '2090-01-03T00:00:00Z', 'holiday', 'bound-' || n
      from generate_series(1, 501) n`);
  assert.equal(resolve(digest), null, "over-limit data fails closed instead of silently truncating");
  assert.equal(resolve(digest, now, createViewId(3)), null);
  assert.equal(count(), 3, "unavailable public resources do not count");
  sql("delete from public.parenting_time_changes where label like 'bound-%'");
  sql(`update public.parenting_time_plans set active = false where id = '${plan}'`);
  assert.equal(resolve(digest, now, createViewId(3)), null);
  assert.equal(count(), 3);
  sql(`update public.parenting_time_plans set active = true where id = '${plan}'`);
  sql(`update public.parenting_time_plans set time_zone = 'invalid' where id = '${plan}'`);
  assert.equal(resolve(digest, now, createViewId(3)), null);
  assert.equal(count(), 3, "an invalid projection must not count");
  sql(`update public.parenting_time_plans set time_zone = 'Europe/Zurich' where id = '${plan}'`);
  add("2090-01-02T00:00:00Z", "infinity", "holiday", "invalid-end");
  assert.equal(resolve(digest, now, createViewId(3)), null);
  assert.equal(count(), 3);
  sql("delete from public.parenting_time_changes where label = 'invalid-end'");
  // Exercise actual RPC updates beyond capacity without weakening the rate limiter.
  sql(`do $$ declare n integer; begin
    for n in 10..1044 loop
      update public.share_links set read_count = 0 where id = '${link.id}';
      perform public.resolve_share_link('${digest}', '${new Date(now).toISOString()}',
        ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid);
    end loop;
  end $$`);
  assert.equal(count(), 1038);
  assert.equal(sql(`select cardinality(recent_view_ids) from public.share_links where id = '${link.id}'`), "1024");
  assert.ok(resolve(digest, now, createViewId(1044)).changes);
  assert.equal(count(), 1038, "retained identifiers are deduplicated");
  assert.ok(resolve(digest, now, createViewId(10)).changes);
  assert.equal(count(), 1039, "evicted identifiers can count again");
  assert.equal(command("update", { id: link.id, note: "counter survives edits" }).link.viewCount, 1039);
  for (const invalidCount of ["-1", "9007199254740992"]) {
    assert.throws(() => sql(`update public.share_links set view_count = ${invalidCount} where id = '${link.id}'`));
  }
  sql(`update public.share_links set view_count = 9007199254740991 where id = '${link.id}'`);
  assert.ok(resolve(digest, now, createViewId(2000)).changes);
  assert.equal(count(), Number.MAX_SAFE_INTEGER);
  sql(`insert into public.share_links(household_id, created_by_user_id, resource_type, token_digest, expires_at, categories)
    select '${household}', '${owner}', 'parenting_changes', lpad(n::text, 64, '0'), '${expiresAt}', array['holiday']
      from generate_series(1, 499) n`);
  assert.equal(command("list").links.length, 500);
  assert.equal(command("create", { ...input, digest: tokenDigest(createToken()) }).status, 409);
  sql(`delete from public.share_links where id <> '${link.id}'`);
  assert.deepEqual(command("delete", { id: link.id }), { ok: true });
  assert.equal(resolve(digest), null);
  assert.equal(command("update", { id: link.id, note: "deleted" }).status, 404);
  assert.equal(command("delete", { id: link.id }).status, 404);
  const next = command("create", { ...input, digest: tokenDigest(createToken()) }).link;
  sql(`delete from auth.users where id = '${owner}'`);
  assert.equal(sql(`select count(*) from public.share_links where id = '${next.id}'`), "0");
  sql(`insert into auth.users values ('${owner}')`);
  command("create", { ...input, digest: tokenDigest(createToken()) });
  // The pre-existing parenting-party trigger requires dependent plans/changes removed first.
  sql(`delete from public.parenting_time_changes where household_id = '${household}';
    delete from public.parenting_time_plans where household_id = '${household}'`);
  sql(`delete from public.households where id = '${household}'`);
  assert.equal(sql("select count(*) from public.share_links"), "0");
});
