const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { readKey, encryptCredentials, decryptCredentials, validateCredentials } = require("./shared/bring-credentials");
const { createConnections, connectionHouseholds } = require("./shared/bring-connections");
const { syncList } = require("./shared/groceries");
const { createHandler } = require("./groceries");
const { createWorker } = require("../workers/grocery-sync");
const createProvider = require("./shared/db/providers/groceries");

const householdId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const credentials = { mail: "test@example.invalid", password: "test-only-secret" };
const makeEnv = () => ({
  BRING_CREDENTIALS_KEY: randomBytes(32).toString("base64"),
  BRING_ACCOUNTS_JSON: JSON.stringify({ [householdId]: credentials, [otherId]: credentials }),
});
const client = { listLists: async () => [] };
const invoke = async (handler, method, resource, body) => {
  const context = { log() { assert.fail("credentials must never be logged"); } };
  await handler(context, { method, params: { householdId, resource }, body });
  return context.res;
};
const fixture = () => {
  let row = null;
  let locked = false;
  const store = {
    getChildcareHousehold: async () => ({ id: householdId }),
    getGroceries: async () => ({ lists: [] }),
    mutateGroceries: async () => ({ ok: true }),
    getBringConnectionMetadata: async () => row && ({ enabled: row.enabled, revision: row.revision }),
    getBringConnection: async () => row,
    saveBringConnection: async (_id, envelope, revision) => {
      assert.equal(revision, row?.revision ?? 0);
      if (locked) throw Object.assign(new Error("private credentials"), { status: 409 });
      row = { ...envelope, enabled: true, revision: revision + 1 };
    },
    disconnectBringConnection: async (_id, revision) => {
      assert.equal(revision, row?.revision ?? 0);
      if (locked) throw Object.assign(new Error("private credentials"), { status: 409 });
      row = { enabled: false, revision: revision + 1 };
    },
  };
  return { store, lock: (value) => { locked = value; }, row: () => row };
};

test("AES-GCM uses unique IVs, authenticated household/version, canonical keys and safe failures", () => {
  const env = makeEnv();
  const encrypted = encryptCredentials(householdId, credentials, env);
  const second = encryptCredentials(householdId, credentials, env);
  assert.notEqual(encrypted.iv, second.iv);
  assert.notEqual(encrypted.ciphertext, second.ciphertext);
  assert.deepEqual(decryptCredentials(householdId, encrypted, env), credentials);
  for (const candidate of [
    { ...encrypted, ciphertext: `${encrypted.ciphertext[0] === "A" ? "B" : "A"}${encrypted.ciphertext.slice(1)}` },
    { ...encrypted, iv: randomBytes(12).toString("base64") },
    { ...encrypted, tag: randomBytes(16).toString("base64") },
    { ...encrypted, version: 2 }, { ...encrypted, ciphertext: "x".repeat(12000) },
  ]) assert.throws(() => decryptCredentials(householdId, candidate, env), { message: "unavailable" });
  assert.throws(() => decryptCredentials(otherId, encrypted, env), { message: "unavailable" });
  assert.throws(() => decryptCredentials(householdId, encrypted, makeEnv()), { message: "unavailable" });
  for (const key of [undefined, "", "x", randomBytes(31).toString("base64"),
    env.BRING_CREDENTIALS_KEY.slice(0, -1), `${env.BRING_CREDENTIALS_KEY}\n`]) {
    assert.equal(readKey({ BRING_CREDENTIALS_KEY: key }), null);
  }
});

test("credential payloads are bounded and reject unknown fields and invalid types", () => {
  for (const input of [null, [], {}, { ...credentials, householdId }, { ...credentials, mail: "bad" },
    { ...credentials, mail: "x".repeat(255) }, { ...credentials, password: "" },
    { ...credentials, password: "x".repeat(1025) }, { ...credentials, password: "bad\npassword" },
    { ...credentials, password: 123 }]) {
    assert.throws(() => validateCredentials(input), { status: 400 });
  }
  assert.deepEqual(validateCredentials(credentials), credentials);
});

test("connection routes authorize before storage and never expose metadata secrets", async () => {
  const env = makeEnv();
  const { store, row } = fixture();
  const options = { env, createCredentialClient: () => client };
  const handler = createHandler(store, async () => "owner", () => client, options);
  assert.deepEqual((await invoke(handler, "GET", "connection")).body,
    { configured: true, source: "environment", canConfigure: true });
  const saved = await invoke(handler, "PUT", "connection", credentials);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { configured: true, source: "stored", canConfigure: true });
  assert.ok(row().ciphertext);
  assert.ok(!JSON.stringify(row()).includes(credentials.password));
  store.getBringConnection = () => { assert.fail("metadata must not read/decrypt credentials"); };
  assert.deepEqual((await invoke(handler, "GET", "connection")).body, saved.body);
  assert.equal((await invoke(handler, "GET")).body.bringConfigured, true);
  const forbidden = () => { assert.fail("unauthorized storage access"); };
  for (const [method, resource] of [["GET", "connection"], ["PUT", "connection"], ["DELETE", "connection"], ["POST", "connection-test"]]) {
    assert.equal((await invoke(createHandler({ getChildcareHousehold: forbidden }, async () => null), method, resource, credentials)).status, 401);
    assert.equal((await invoke(createHandler({ getChildcareHousehold: async () => null }, async () => "other"), method, resource, credentials)).status, 404);
  }
});

test("disconnect overrides environment fallback, tests current credentials only, and never calls provider after mutation", async () => {
  const env = makeEnv();
  const { store } = fixture();
  const calls = [];
  const handler = createHandler(store, async () => "owner", () => { calls.push("environment"); return client; }, {
    env, createCredentialClient: (account) => {
      assert.deepEqual(account, credentials);
      calls.push("stored");
      return client;
    },
  });
  assert.deepEqual((await invoke(handler, "POST", "connection-test")).body, { connected: true });
  assert.equal((await invoke(handler, "POST", "connection-test", credentials)).status, 400);
  await invoke(handler, "PUT", "connection", credentials);
  await invoke(handler, "POST", "connection-test", {});
  assert.deepEqual(calls, ["environment", "stored", "stored"]);
  const disconnected = await invoke(handler, "DELETE", "connection");
  assert.deepEqual(disconnected.body, { configured: false, source: null, canConfigure: true });
  assert.equal((await invoke(handler, "POST", "connection-test")).status, 503);
  assert.equal((await invoke(handler, "GET")).body.bringConfigured, false);
  assert.deepEqual(calls, ["environment", "stored", "stored"]);
});

test("locked replacements/disconnect conflict; outages, changed key and malformed configuration preserve local CRUD", async () => {
  const env = makeEnv();
  const { store, lock } = fixture();
  const handler = createHandler(store, async () => "owner", () => client, {
    env, createCredentialClient: () => client,
  });
  await invoke(handler, "PUT", "connection", credentials);
  lock(true);
  for (const method of ["PUT", "DELETE"]) {
    const response = await invoke(handler, method, "connection", credentials);
    assert.equal(response.status, 409);
    assert.ok(!JSON.stringify(response).includes(credentials.password));
  }
  env.BRING_CREDENTIALS_KEY = makeEnv().BRING_CREDENTIALS_KEY;
  assert.equal((await invoke(handler, "GET", "connection")).body.configured, true);
  assert.equal((await invoke(handler, "POST", "connection-test")).status, 503);
  env.BRING_CREDENTIALS_KEY = "invalid";
  assert.equal((await invoke(handler, "GET", "connection")).body.canConfigure, false);
  assert.equal((await invoke(handler, "PUT", "connection", credentials)).status, 503);
  assert.equal((await invoke(handler, "DELETE", "connection")).status, 503);
  env.BRING_CREDENTIALS_KEY = makeEnv().BRING_CREDENTIALS_KEY;
  lock(false);
  assert.deepEqual((await invoke(handler, "DELETE", "connection")).body,
    { configured: false, source: null, canConfigure: true });
  store.getBringConnectionMetadata = store.getBringConnection = async () => { throw new Error(credentials.password); };
  assert.equal((await invoke(handler, "GET", "connection")).status, 503);
  assert.equal((await invoke(handler, "GET")).status, 200);
  assert.equal((await invoke(handler, "POST", "items", { listId: randomUUID(), name: "Milk" })).status, 201);
  assert.equal((await invoke(handler, "GET", "bring-lists")).status, 503);
});

test("failed credential tests never persist and provider exceptions cannot leak through connection errors", async () => {
  const { store, row } = fixture();
  const env = makeEnv();
  const handler = createHandler(store, async () => "owner", null, {
    env, createCredentialClient: () => ({
      listLists: async () => { throw Object.assign(new Error(credentials.password), { status: 400 }); },
    }),
  });
  const response = await invoke(handler, "PUT", "connection", credentials);
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: "unavailable" });
  assert.equal(row(), null);
  const unsafeConstructor = createHandler(store, async () => "owner", null, {
    env, createCredentialClient: () => { throw Object.assign(new Error(credentials.password), { status: 400 }); },
  });
  assert.deepEqual((await invoke(unsafeConstructor, "PUT", "connection", credentials)).body,
    { error: "invalid connection request" });
  delete env.BRING_CREDENTIALS_KEY;
  assert.deepEqual((await invoke(handler, "DELETE", "connection")).body, { error: "unavailable" });
  assert.equal(row(), null);
});

test("worker includes enabled stored credentials, excludes disabled env overrides and paginates bounded metadata", async () => {
  const env = makeEnv();
  const encrypted = encryptCredentials(householdId, credentials, env);
  const calls = [];
  const store = {
    listBringConnections: async (after, limit) => {
      assert.equal(after, null); assert.equal(limit, 100);
      return [{ household_id: householdId, enabled: true }, { household_id: otherId, enabled: false }];
    },
    getBringConnection: async () => ({ ...encrypted, enabled: true, revision: 1 }),
    getGroceries: async (id) => { calls.push(id); return { lists: [] }; },
  };
  await createWorker(store, { env, createCredentialClient: () => client,
    createEnvironmentClient: () => { assert.fail("disabled environment must not activate"); } })();
  assert.deepEqual(calls, [householdId]);
  let pages = 0;
  const ids = Array.from({ length: 101 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  const paged = {
    listBringConnections: async (after, limit) => {
      pages++;
      return ids.filter((id) => !after || id > after).slice(0, limit).map((id) => ({ household_id: id, enabled: true }));
    },
  };
  const collected = [];
  for await (const id of connectionHouseholds(paged, {})) collected.push(id);
  assert.equal(pages, 2);
  assert.deepEqual(collected, ids);
  let environmentCalls = 0;
  await createWorker({ listBringConnections: async () => { throw new Error("offline"); } }, {
    env, createEnvironmentClient: () => { environmentCalls++; return client; },
  })();
  assert.equal(environmentCalls, 0);
});

test("provider metadata requests omit ciphertext and connection mutations use named RPC", async () => {
  const calls = [];
  const provider = createProvider(async (url, options) => {
    calls.push([url, options]);
    return url.startsWith("rpc/") ? { ok: true } : [];
  });
  await provider.getBringConnectionMetadata(householdId);
  assert.equal(calls[0][1].params.select, "enabled,revision");
  await provider.disconnectBringConnection(householdId, 3);
  assert.deepEqual(calls[1], ["rpc/bring_connection_command", { method: "POST", body: {
    p_household: householdId, p_enabled: false, p_envelope: null, p_revision: 3,
  } }]);
});

test("a client resolved before replacement cannot acquire a newly linked list or make provider calls", async () => {
  const env = makeEnv();
  const { store } = fixture();
  let providerCalls = 0;
  const oldClient = { listLists: async () => { providerCalls++; return []; } };
  await store.saveBringConnection(householdId, encryptCredentials(householdId, credentials, env), 0);
  const connections = createConnections(store, { env, createCredentialClient: () => oldClient });
  const resolved = await connections.resolve(householdId);
  await store.saveBringConnection(householdId, encryptCredentials(householdId, credentials, env), 1);
  store.acquireGrocerySync = async (_household, _list, expectedRevision) => {
    assert.equal(expectedRevision, 1);
    throw Object.assign(new Error("connection changed"), { status: 409 });
  };
  await assert.rejects(syncList(store, householdId, randomUUID(), resolved.client, resolved.revision), { status: 409 });
  assert.equal(providerCalls, 0);
});

test("PostgreSQL encrypted connection RPC atomically detaches mappings, fences credentials, locks sync and denies browsers", {
  skip: !process.env.GROCERY_TEST_PG_SOCKET,
}, async () => {
  const database = `bring_connection_test_${process.pid}`;
  const args = ["-h", process.env.GROCERY_TEST_PG_SOCKET, "-p", process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, db = database) => execFileSync("psql", [...args, "-d", db, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  sql(`create database ${database}`, "postgres");
  try {
    sql(`select pg_advisory_xact_lock(17293021); do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
      end $$;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table public.households(id uuid primary key, created_by_user_id uuid);
      insert into public.households values ('${householdId}', '${householdId}');`);
    for (const file of ["groceries.sql", "bring-connections.sql", "bring-connections.sql"]) {
      execFileSync("psql", [...args, "-d", database], {
        input: readFileSync(path.join(__dirname, "../docs/sql", file), "utf8"), stdio: ["pipe", "pipe", "pipe"],
      });
    }
    const command = (action, data) => JSON.parse(sql(`select public.grocery_command('${householdId}', ${quote(action)}, ${quote(JSON.stringify(data))})`));
    const env = makeEnv();
    const connection = (enabled, revision) => {
      const envelope = enabled ? encryptCredentials(householdId, credentials, env) : null;
      return JSON.parse(sql(`select public.bring_connection_command('${householdId}', ${enabled},
        ${envelope ? `${quote(JSON.stringify(envelope))}::jsonb` : "null"}, ${revision})`));
    };
    const listId = randomUUID();
    command("lists_post", { id: listId, name: "Food" });
    command("lists_put", { id: listId, remoteId: "old-account", connectionRevision: 0 });
    command("items_post", { listId, name: "Keep" });
    const gone = command("items_post", { listId, name: "Delete" }).id;
    command("items_delete", { listId, id: gone });
    const lease = command("acquire", { id: listId, connectionRevision: 0 }).lease;
    assert.equal(connection(true, 0).status, 409);
    assert.equal(connection(false, 0).status, 409);
    command("release", lease);
    assert.deepEqual(connection(true, 0), { ok: true });
    const state = command("read", {}).lists[0];
    assert.equal(state.remoteId, null);
    assert.deepEqual(state.items.map((item) => item.name), ["Keep"]);
    assert.equal(sql(`select count(*) from public.grocery_items where deleted or cardinality(remove_names) > 0 or retire_at is not null`), "0");
    assert.equal(command("lists_put", { id: listId, remoteId: "stale", connectionRevision: 0 }).status, 409);
    assert.equal(command("acquire", { id: listId, connectionRevision: 0 }).status, 409);
    for (const connectionRevision of [undefined, null]) {
      assert.equal(command("acquire", { id: listId, connectionRevision }).status, 409);
      assert.equal(command("lists_put", { id: listId, remoteId: "unguarded", connectionRevision }).status, 409);
    }
    assert.equal(command("lists_put", { id: listId, name: "Renamed locally" }).ok, true);
    assert.equal(command("finish", { ...lease, items: [] }).status, 409);
    assert.equal(connection(false, 0).status, 409);
    let oldAccountCalls = 0;
    const oldClient = { listLists: async () => { oldAccountCalls++; return []; } };
    const connections = createConnections({
      getBringConnection: async () => JSON.parse(sql("select row_to_json(c) from public.bring_connections c")),
    }, { env, createCredentialClient: () => oldClient });
    const resolved = await connections.resolve(householdId);
    assert.equal(resolved.revision, 1);
    assert.deepEqual(connection(true, 1), { ok: true });
    assert.deepEqual(command("lists_put", { id: listId, remoteId: "new-account", connectionRevision: 2 }), { ok: true, id: listId });
    const syncStore = createProvider(async (_url, options) => command(options.body.p_action, options.body.p_data));
    await assert.rejects(syncList(syncStore, householdId, listId, resolved.client, resolved.revision), { status: 409 });
    assert.equal(oldAccountCalls, 0);
    assert.equal(command("lists_put", { id: listId, remoteId: "stale-account", connectionRevision: resolved.revision }).status, 409);
    assert.deepEqual(connection(false, 2), { ok: true });
    assert.equal(command("read", {}).lists[0].remoteId, null);
    assert.equal(command("acquire", { id: listId }).status, 409);
    assert.equal(command("lists_put", { id: listId, remoteId: "disabled-override" }).status, 409);
    assert.equal(sql("select enabled::text || ':' || revision::text || ':' || (ciphertext is null)::text from public.bring_connections"), "false:3:true");
    for (const role of ["anon", "authenticated"]) {
      assert.equal(sql(`select has_table_privilege('${role}', 'public.bring_connections', 'select')`), "f");
      assert.equal(sql(`select has_function_privilege('${role}', 'public.bring_connection_command(uuid,boolean,jsonb,bigint)', 'execute')`), "f");
      assert.throws(() => sql(`set role ${role}; select * from public.bring_connections`));
      assert.throws(() => sql(`set role ${role}; select public.bring_connection_command('${householdId}', false, null, 2)`));
    }
  } finally { sql(`drop database ${database}`, "postgres"); }
});
