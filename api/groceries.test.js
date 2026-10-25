const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, execFile } = require("node:child_process");
const { readFileSync, readdirSync, existsSync, rmSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { createHandler } = require("./groceries");
const createProvider = require("./shared/db/providers/groceries");
const { validateMutation, validateRemoteItems, syncList } = require("./shared/groceries");

const householdId = "00000000-0000-0000-0000-000000000001";
const otherHousehold = "00000000-0000-0000-0000-000000000002";
const ownerId = "00000000-0000-0000-0000-000000000003";
const listId = "00000000-0000-0000-0000-000000000004";
const itemId = "00000000-0000-0000-0000-000000000005";
const invoke = async (handler, method, resource, body) => {
  const context = { log: { error() { throw new Error("must not log raw errors"); } } };
  await handler(context, { method, params: { householdId, resource }, body });
  return context.res;
};
const store = () => ({
  getChildcareHousehold: async () => ({ id: householdId }),
  getGroceries: async () => ({ lists: [{ id: listId, name: "Food", items: [] }] }),
  mutateGroceries: async () => ({ ok: true }),
});

test("HTTP groceries authenticates and scopes every request before accessing data or Bring", async () => {
  let accessed = false;
  const forbidden = () => { accessed = true; throw new Error("not expected"); };
  const unauthenticated = createHandler({ getChildcareHousehold: forbidden }, async () => null, forbidden);
  assert.equal((await invoke(unauthenticated, "GET")).status, 401);
  const unknownHousehold = createHandler({ getChildcareHousehold: async () => null, getGroceries: forbidden }, async () => ownerId, forbidden);
  assert.equal((await invoke(unknownHousehold, "POST", "sync", { listId })).status, 404);
  assert.equal(accessed, false);
});

test("local mutations require no Bring client or network calls", async () => {
  const db = store();
  const calls = [];
  db.mutateGroceries = async (...args) => { calls.push(args); return { ok: true }; };
  const handler = createHandler(db, async () => ownerId, () => { throw new Error("offline"); });
  for (const [method, resource, body] of [
    ["POST", "lists", { name: "Food" }],
    ["PUT", "lists", { id: listId, name: "Home", remoteId: null }],
    ["DELETE", "lists", { id: listId }],
    ["POST", "items", { listId, name: "Milk" }],
    ["PUT", "items", { listId, id: itemId, checked: true }],
    ["DELETE", "items", { listId, id: itemId }],
  ]) assert.ok((await invoke(handler, method, resource, body)).status < 300);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[2], [householdId, "lists_delete", { id: listId }]);
});

test("list deletion validates IDs, scopes owner access, and propagates lease conflicts without Bring", async () => {
  const calls = [];
  const forbidden = () => { throw new Error("Bring must not be accessed"); };
  const db = {
    ...store(),
    getChildcareHousehold: async (...args) => { calls.push(args); return { id: householdId }; },
    getBringConnection: forbidden,
    getBringConnectionMetadata: forbidden,
    mutateGroceries: async (...args) => { calls.push(args); return { ok: true }; },
  };
  const handler = createHandler(db, async () => ownerId, forbidden);
  for (const body of [undefined, null, [], {}, { id: null }, { id: "bad" }]) {
    assert.equal((await invoke(handler, "DELETE", "lists", body)).status, 400);
  }
  assert.equal((await invoke(handler, "DELETE", "lists", { id: listId, remoteId: "ignored" })).status, 200);
  assert.deepEqual(calls.at(-2), [householdId, ownerId]);
  assert.deepEqual(calls.at(-1), [householdId, "lists_delete", { id: listId }]);
  db.mutateGroceries = async () => { throw Object.assign(new Error("sync in progress"), { status: 409 }); };
  assert.deepEqual(await invoke(handler, "DELETE", "lists", { id: listId }),
    { status: 409, body: { error: "conflict; refresh and retry" } });
  db.mutateGroceries = forbidden;
  assert.equal((await invoke(createHandler(db, async () => null, forbidden), "DELETE", "lists", { id: listId })).status, 401);
  db.getChildcareHousehold = async () => null;
  assert.equal((await invoke(handler, "DELETE", "lists", { id: listId })).status, 404);
});

test("HTTP returns disconnected lists, rejects bad inputs, and masks provider secrets", async () => {
  const db = store();
  const handler = createHandler(db, async () => ownerId, () => null);
  assert.equal((await invoke(handler, "GET")).body.bringConfigured, false);
  const invalidConfiguration = createHandler(db, async () => ownerId, () => { throw new Error("bad secret config"); });
  assert.equal((await invoke(invalidConfiguration, "GET")).status, 200);
  for (const body of [null, [], { listId, name: "" }, { listId, name: "Milk", checked: "yes" },
    { listId, name: "Milk", specification: "x".repeat(501) }, { listId: "bad", name: "Milk" }]) {
    assert.equal((await invoke(handler, "POST", "items", body)).status, 400);
  }
  assert.equal((await invoke(handler, "GET", "bring-lists")).status, 503);
  assert.deepEqual((await invoke(handler, "POST", "sync", { listId })).body, { syncStatus: "unavailable" });
  db.getGroceries = async () => { throw new Error("mail/password/internal provider body"); };
  const failure = await invoke(handler, "GET");
  assert.equal(failure.status, 500);
  assert.equal(failure.body.error, "unavailable");
});

test("remote links must belong to this household's configured account", async () => {
  let mutations = 0;
  const db = { ...store(), mutateGroceries: async () => { mutations++; return { ok: true }; } };
  const handler = createHandler(db, async () => ownerId, () => ({
    listLists: async () => [{ id: "allowed", name: "Food" }],
  }));
  assert.equal((await invoke(handler, "PUT", "lists", { id: listId, remoteId: "other" })).status, 400);
  assert.equal((await invoke(handler, "PUT", "lists", { id: listId, remoteId: "allowed" })).status, 200);
  assert.equal(mutations, 1);
});

test("validation permits optional stable creation IDs and optimistic revisions", () => {
  assert.deepEqual(validateMutation("items", "POST", { listId, id: itemId, name: " Milk ", checked: false, revision: 0 }),
    { id: itemId, listId, name: "Milk", checked: false, revision: 0 });
  assert.throws(() => validateMutation("lists", "PUT", { id: listId, revision: -1 }), { status: 400 });
  assert.throws(() => validateMutation("items", "PUT", { id: itemId, listId, name: "bad\nname" }), { status: 400 });
  assert.throws(() => validateMutation("lists", "POST", { name: "Food", remoteId: "remote" }), { status: 400 });
  assert.deepEqual(validateMutation("lists", "DELETE", { id: listId, revision: 2, name: "ignored", remoteId: "ignored" }),
    { id: listId, revision: 2 });
  assert.throws(() => validateMutation("lists", "DELETE", { id: listId, revision: -1 }), { status: 400 });
});

test("remote snapshots reject malformed, incomplete-shaped, and over-limit data", () => {
  for (const value of [null, {}, { items: [] }, [{ name: "Milk", checked: false }],
    [{ name: " Milk ", specification: "", checked: false }],
    [{ name: "Milk", specification: "", checked: undefined }], Array(201).fill({ name: "Milk", specification: "", checked: false })]) {
    assert.throws(() => validateRemoteItems(value));
  }
  assert.deepEqual(validateRemoteItems([]), []);
});

test("only trusted sync metadata propagates; mutations cannot write it and invalid optional fields do not discard core items", () => {
  const item = { name: "Milk", specification: "", checked: false };
  const imageUrl = "https://web.getbring.com/assets/images/items/milch.png";
  assert.deepEqual(validateRemoteItems([{ ...item, iconId: "milch", imageUrl }]), [{ ...item, iconId: "milch", imageUrl }]);
  assert.deepEqual(validateRemoteItems([{ ...item, iconId: null, imageUrl: null }]), [{ ...item, iconId: null, imageUrl: null }]);
  assert.deepEqual(validateRemoteItems([{ ...item, iconId: "../bad", imageUrl: "https://attacker.invalid/x.png" }]), [item]);
  assert.deepEqual(validateMutation("items", "POST", { listId, ...item, iconId: "milch", imageUrl }),
    { listId, name: "Milk", specification: "", checked: false });
});

test("sync forwards optional provider metadata including explicit clears to persistence", async () => {
  const items = [{ name: "Milk", specification: "", checked: false, iconId: "milch", imageUrl: null }];
  let received;
  const lease = { id: listId, token: randomUUID(), fence: 1, revision: 0 };
  const db = {
    acquireGrocerySync: async () => ({ lease, remoteId: "remote", items: [] }),
    renewGrocerySync: async () => {},
    finishGrocerySync: async (_household, _lease, snapshot) => { received = snapshot; return { syncStatus: "synced" }; },
  };
  assert.equal((await syncList(db, householdId, listId, {
    listLists: async () => [{ id: "remote", name: "Food" }],
    getItems: async () => items,
  })).syncStatus, "synced");
  assert.deepEqual(received, items);
});

test("database facade sends bounded named RPC commands and handles conflicts", async () => {
  const calls = [];
  const provider = createProvider(async (...args) => { calls.push(args); return { lists: [] }; });
  await provider.getGroceries(householdId);
  assert.deepEqual(calls[0], ["rpc/grocery_command", {
    method: "POST", body: { p_household: householdId, p_action: "read", p_data: {} },
  }]);
  await provider.mutateGroceries(householdId, "lists_delete", { id: listId });
  assert.deepEqual(calls[1], ["rpc/grocery_command", {
    method: "POST", body: { p_household: householdId, p_action: "lists_delete", p_data: { id: listId } },
  }]);
  const conflict = createProvider(async () => ({ error: "stale sync", status: 409 }));
  await assert.rejects(conflict.renewGrocerySync(householdId, {}), { status: 409 });
});

test("sync removes every old identity before saves; tombstones never become saves", async () => {
  const calls = [];
  const remote = new Map(["Old", "Gone before", "Gone"].map((name) => [
    name, { name, specification: "", checked: false },
  ]));
  const lease = { id: listId, token: randomUUID(), fence: 1, revision: 0 };
  const db = {
    acquireGrocerySync: async () => ({
      lease, remoteId: "remote", items: [
        { name: "New", specification: "2", checked: true, pending: true, removeNames: ["Old"] },
        { name: "Gone", deleted: true, pending: true, removeNames: ["Gone before"] },
      ],
    }),
    renewGrocerySync: async () => {},
    finishGrocerySync: async () => { calls.push("finish"); return { syncStatus: "synced" }; },
  };
  const client = {
    listLists: async () => [{ id: "remote", name: "Food" }],
    removeItem: async (_id, name) => { calls.push(`remove:${name}`); remote.delete(name); },
    saveItem: async (_id, item) => { calls.push(`save:${item.name}:${item.checked}`); remote.set(item.name, item); },
    getItems: async () => [...remote.values()],
  };
  assert.deepEqual(await syncList(db, householdId, listId, client), { syncStatus: "synced" });
  assert.deepEqual(calls, ["remove:Old", "remove:Gone before", "remove:Gone", "save:New:true", "finish"]);
});

test("200 slow pending writes make forward progress across deadline-limited retries", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const remote = new Map();
  const writes = [];
  let released = 0;
  let finished = 0;
  const items = Array.from({ length: 200 }, (_, index) => ({
    name: `Item-${index}`, specification: `${index}`, checked: false, pending: true, removeNames: [],
  }));
  const db = {
    acquireGrocerySync: async () => ({ lease: { id: listId }, remoteId: "remote", items }),
    renewGrocerySync: async () => {},
    releaseGrocerySync: async () => { released++; },
    finishGrocerySync: async (_household, _lease, snapshot) => {
      assert.equal(snapshot.length, 200);
      finished++;
      return { syncStatus: "synced" };
    },
  };
  const client = {
    listLists: async () => [{ id: "remote", name: "Food" }],
    getItems: async () => [...remote.values()],
    removeItem: async () => { throw new Error("not expected"); },
    saveItem: async (_id, item) => {
      writes.push(item.name);
      remote.set(item.name, item);
      now += 1000;
    },
  };
  assert.equal((await syncList(db, householdId, listId, client)).syncStatus, "unavailable");
  assert.ok(remote.size > 0 && remote.size < 200);
  assert.equal((await syncList(db, householdId, listId, client)).syncStatus, "synced");
  assert.equal(writes.length, 200);
  assert.equal(new Set(writes).size, 200);
  assert.equal(released, 1);
  assert.equal(finished, 1);
});

test("oversized retry snapshot permits cleanup after a silent rename removal failure at capacity", async () => {
  const unchanged = Array.from({ length: 199 }, (_, index) => ({
    name: `Item-${index}`, specification: "", checked: false, pending: false, removeNames: [],
  }));
  const renamed = { name: "B", specification: "renamed", checked: false, pending: true, removeNames: ["A"] };
  const remote = new Map([...unchanged, { name: "A", specification: "old", checked: false }]
    .map(({ name, specification, checked }) => [name, { name, specification, checked }]));
  let removalAttempts = 0;
  let saves = 0;
  let finishes = 0;
  let releases = 0;
  const db = {
    acquireGrocerySync: async () => ({ lease: { id: listId }, remoteId: "remote", items: [...unchanged, renamed] }),
    renewGrocerySync: async () => {},
    releaseGrocerySync: async () => { releases++; },
    finishGrocerySync: async (_household, _lease, snapshot) => {
      finishes++;
      assert.equal(snapshot.length, 200);
      assert.equal(snapshot.some((item) => item.name === "A"), false);
      assert.equal(snapshot.filter((item) => item.name === "B").length, 1);
      return { syncStatus: "synced" };
    },
  };
  const client = {
    listLists: async () => [{ id: "remote", name: "Food" }],
    getItems: async () => [...remote.values()],
    removeItem: async (_id, name) => {
      if (++removalAttempts > 1) remote.delete(name);
    },
    saveItem: async (_id, item) => { saves++; remote.set(item.name, item); },
  };
  assert.equal((await syncList(db, householdId, listId, client)).syncStatus, "unavailable");
  assert.equal(remote.size, 201);
  assert.equal(finishes, 0);
  assert.equal(releases, 1);
  assert.equal((await syncList(db, householdId, listId, client)).syncStatus, "synced");
  assert.equal(remote.size, 200);
  assert.equal(removalAttempts, 2);
  assert.equal(saves, 1);
  assert.equal(finishes, 1);
});

test("failed fetches and lost fences never acknowledge or import an empty snapshot", async () => {
  let finishes = 0;
  let releases = 0;
  const db = {
    acquireGrocerySync: async () => ({ lease: { id: listId }, remoteId: "remote", items: [] }),
    renewGrocerySync: async () => {},
    finishGrocerySync: async () => { finishes++; },
    releaseGrocerySync: async () => { releases++; },
  };
  const client = { listLists: async () => [{ id: "remote", name: "Food" }], getItems: async () => { throw new Error("secret"); } };
  assert.equal((await syncList(db, householdId, listId, client)).syncStatus, "unavailable");
  client.getItems = async () => ({ items: [] });
  assert.equal((await syncList(db, householdId, listId, client)).syncStatus, "unavailable");
  assert.equal(finishes, 0);
  assert.equal(releases, 2);
  db.renewGrocerySync = async () => { throw Object.assign(new Error("stale sync"), { status: 409 }); };
  await assert.rejects(syncList(db, householdId, listId, client), { status: 409 });
});

test("SWA API remains HTTP-only and the optional timer package contains its shared runtime", () => {
  for (const entry of readdirSync(__dirname, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const config = path.join(__dirname, entry.name, "function.json");
    if (!existsSync(config)) continue;
    const bindings = JSON.parse(readFileSync(config, "utf8")).bindings;
    assert.ok(bindings.filter((binding) => binding.type.endsWith("Trigger"))
      .every((binding) => binding.type === "httpTrigger"), `${entry.name} is not SWA-compatible`);
  }
  const root = path.join(__dirname, "..");
  const workflow = readFileSync(path.join(root,
    ".github/workflows/azure-static-web-apps-polite-hill-0ea169003.yml"), "utf8");
  assert.match(workflow, /needs:\s*\n\s+- validate/);
  assert.match(workflow, /GROCERY_TEST_PG_SOCKET: 127\.0\.0\.1/);
  assert.match(workflow, /test -n "\$GROCERY_TEST_PG_SOCKET"/);
  assert.match(workflow, /numPassedTests < 1/);
  assert.doesNotMatch(workflow, /package-lock=false/);
  const apiPackage = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8"));
  const apiLock = JSON.parse(readFileSync(path.join(__dirname, "package-lock.json"), "utf8"));
  const rootLock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.deepEqual(apiLock.packages[""].dependencies, apiPackage.dependencies);
  for (const [packagePath, details] of Object.entries(apiLock.packages)) {
    if (packagePath) assert.deepEqual(rootLock.packages[packagePath], details);
  }
  const output = path.join(root, "workers/grocery-sync-package");
  try {
    execFileSync(process.execPath, ["workers/build-grocery-sync.js"], { cwd: root });
    assert.equal(JSON.parse(readFileSync(path.join(output, "grocery-sync/function.json"), "utf8")).bindings[0].type, "timerTrigger");
    assert.ok(existsSync(path.join(output, "shared/db/providers/groceries.js")));
    assert.ok(existsSync(path.join(output, "shared/bring-connections.js")));
    assert.ok(existsSync(path.join(output, "shared/bring-credentials.js")));
    assert.ok(existsSync(path.join(output, "shared/bring-metadata.js")));
    const packaged = JSON.parse(readFileSync(path.join(output, "package.json"), "utf8"));
    assert.deepEqual(packaged.dependencies, apiPackage.dependencies);
    const lock = JSON.parse(readFileSync(path.join(output, "package-lock.json"), "utf8"));
    assert.deepEqual(lock.packages[""].dependencies, packaged.dependencies);
    assert.equal(lock.name, packaged.name);
    assert.deepEqual(
      Object.fromEntries(Object.entries(lock.packages).filter(([packagePath]) => packagePath)),
      Object.fromEntries(Object.entries(apiLock.packages).filter(([packagePath]) => packagePath)),
    );
    execFileSync(process.execPath, ["-e", 'require("./workers/grocery-sync-package/grocery-sync")().catch(() => process.exit(1))'], {
      cwd: root, env: { ...process.env, BRING_ACCOUNTS_JSON: "" },
    });
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

// Optional real PostgreSQL coverage; no additional test dependency or remote service.
test("PostgreSQL grocery RPC persistence, reconciliation, fencing, and RLS", {
  skip: !process.env.GROCERY_TEST_PG_SOCKET,
}, async (t) => {
  const database = `grocery_test_${process.pid}`;
  const args = ["-h", process.env.GROCERY_TEST_PG_SOCKET, "-p", process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, db = database) => execFileSync("psql", [...args, "-d", db, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const concurrentCommand = (statement, applicationName) => new Promise((resolve, reject) => {
    execFile("psql", [...args, "-d", database, "-c", statement], {
      encoding: "utf8", env: { ...process.env, PGAPPNAME: applicationName },
    }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout.trim().split("\n").at(-1))));
  });
  const waitForSleepingTransaction = async (applicationName) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (sql(`select exists (select 1 from pg_stat_activity where application_name = ${quote(applicationName)}
        and wait_event = 'PgSleep')`) === "t") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("concurrent transaction did not reach its locked pause");
  };
  sql(`create database ${database}`, "postgres");
  t.after(() => sql(`drop database ${database}`, "postgres"));
  sql(`
    select pg_advisory_xact_lock(17293021);
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.households(id uuid primary key, created_by_user_id uuid not null);
    insert into public.households values ('${householdId}', '${ownerId}'), ('${otherHousehold}', '${otherHousehold}');
    grant select on public.households to authenticated;
  `);
  for (let run = 0; run < 2; run++) {
    execFileSync("psql", [...args, "-d", database], {
      input: readFileSync(require("node:path").join(__dirname, "../docs/sql/groceries.sql"), "utf8"),
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  const provider = createProvider(async (_path, options) => {
    const { p_household, p_action, p_data } = options.body;
    return JSON.parse(sql(`select public.grocery_command(${quote(p_household)}::uuid, ${quote(p_action)}, ${quote(JSON.stringify(p_data))}::jsonb)`));
  });
  const mutate = (action, data, household = householdId) => provider.mutateGroceries(household, action, data);
  const snapshot = async () => (await provider.getGroceries(householdId)).lists;
  const createList = async () => {
    const id = randomUUID();
    await mutate("lists_post", { id, name: `Food-${id}` });
    return id;
  };
  const client = (remoteId) => {
    const remote = new Map();
    const operations = [];
    return {
      remote, operations,
      listLists: async () => [{ id: remoteId, name: "Remote food" }],
      getItems: async () => [...remote.values()],
      saveItem: async (_id, item) => { operations.push(`save:${item.name}`); remote.set(item.name, { ...item }); },
      removeItem: async (_id, name) => { operations.push(`remove:${name}`); remote.delete(name); },
    };
  };

  await t.test("provider metadata roundtrips, updates pending rows without overwriting core fields, retains on outage and clears explicitly", async () => {
    const id = await createList();
    await mutate("lists_put", { id, remoteId: `metadata-${id}` });
    const imageUrl = "https://web.getbring.com/assets/images/items/milch.png";
    const remote = { name: "Milk", specification: "remote", checked: false, iconId: "milch", imageUrl };
    const finish = async (items) => {
      const { lease } = await provider.acquireGrocerySync(householdId, id);
      return provider.finishGrocerySync(householdId, lease, items);
    };
    const item = async () => (await snapshot()).find((list) => list.id === id).items[0];
    await finish([remote]);
    assert.equal((await item()).iconId, "milch");
    assert.equal((await item()).imageUrl, imageUrl);
    const itemId = (await item()).id;
    await mutate("items_put", { listId: id, id: itemId, specification: "local pending", checked: true,
      iconId: "forged", imageUrl: "https://attacker.invalid/x.png" });
    await finish([{ ...remote, iconId: "getraenke", imageUrl: null }]);
    assert.equal((await item()).specification, "local pending");
    assert.equal((await item()).checked, true);
    assert.equal((await item()).iconId, "getraenke");
    assert.equal((await item()).imageUrl, null);
    assert.equal(sql(`select pending from public.grocery_items where id = '${itemId}'`), "t");
    const { iconId, imageUrl: ignoredImage, ...withoutMetadata } = remote;
    await finish([withoutMetadata]);
    assert.equal((await item()).iconId, "getraenke");
    await finish([{ ...withoutMetadata, iconId: null, imageUrl: null }]);
    assert.equal((await item()).iconId, null);
    await finish([remote]);
    await mutate("items_put", { listId: id, id: itemId, name: "Renamed locally" });
    assert.equal((await item()).iconId, null);
    assert.equal((await item()).imageUrl, null);
    await finish([{ ...remote, name: "Renamed locally" }]);
    assert.equal((await item()).iconId, "milch");
    await mutate("lists_put", { id, remoteId: null });
    assert.equal((await item()).iconId, null);
    assert.equal((await item()).imageUrl, null);
    await mutate("lists_put", { id, remoteId: `metadata-${id}` });
    await finish([{ ...remote, name: "Renamed locally" }]);
    await mutate("lists_put", { id, remoteId: `replacement-${id}` });
    assert.equal((await item()).iconId, null);
    assert.equal((await item()).imageUrl, null);
  });

  await t.test("local durable rows, checkoffs, deduplication, retry IDs and optimistic CAS", async () => {
    await mutate("lists_post", { id: listId, name: "Food" });
    assert.equal((await mutate("lists_post", { name: " food " })).id, listId);
    const add = await mutate("items_post", { id: itemId, listId, name: "Milk" });
    assert.equal(add.id, itemId);
    assert.equal((await mutate("items_post", { listId, name: "milk" })).id, itemId);
    await mutate("items_put", { id: itemId, listId, checked: true, revision: 0 });
    await assert.rejects(mutate("items_put", { id: itemId, listId, checked: false, revision: 0 }), { status: 409 });
    const list = (await snapshot()).find((item) => item.id === listId);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].checked, true);
    assert.equal(list.syncStatus, "local");
    await mutate("items_delete", { listId, id: itemId });
    await mutate("items_delete", { listId, id: itemId });
    assert.equal((await snapshot()).find((item) => item.id === listId).items.length, 0);
  });

  await t.test("cross-household list/item IDs cannot be mutated", async () => {
    await assert.rejects(mutate("items_post", { listId, name: "Secret" }, otherHousehold), { status: 404 });
    await assert.rejects(provider.acquireGrocerySync(otherHousehold, listId), { status: 404 });
    await assert.rejects(mutate("lists_put", { id: listId, name: "Stale", revision: 0 }), { status: 409 });
    assert.deepEqual(await mutate("lists_delete", { id: listId }, otherHousehold), { ok: true });
    assert.ok((await snapshot()).some((list) => list.id === listId));
  });

  await t.test("local list deletion cascades all items and is idempotent", async () => {
    const id = await createList();
    await mutate("items_post", { listId: id, name: "Milk" });
    await assert.rejects(mutate("lists_delete", { id, revision: 0 }), { status: 409 });
    assert.equal((await mutate("lists_delete", { id })).ok, true);
    assert.deepEqual(await mutate("lists_delete", { id }), { ok: true });
    assert.equal((await snapshot()).some((list) => list.id === id), false);
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}'`), "0");
  });

  await t.test("linked list deletion works offline and preserves Bring contents without sending pending removals", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const added = await mutate("items_post", { listId: id, name: "Milk" });
    const bring = client(remoteId);
    await syncList(provider, householdId, id, bring);
    await mutate("items_delete", { listId: id, id: added.id });
    await mutate("items_post", { listId: id, name: "Eggs" });
    const before = [...bring.remote.values()];
    const operations = [...bring.operations];
    const handler = createHandler({ ...store(), ...provider }, async () => ownerId,
      () => { throw new Error("offline"); });
    assert.equal((await invoke(handler, "DELETE", "lists", { id })).status, 200);
    assert.deepEqual([...bring.remote.values()], before);
    assert.deepEqual(bring.operations, operations);
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}'`), "0");
    await assert.rejects(provider.acquireGrocerySync(householdId, id), { status: 404 });
    assert.equal((await snapshot()).some((list) => list.id === id), false);
  });

  await t.test("active leases block deletion; expired leases and stale workers cannot resurrect deleted lists", async () => {
    const id = await createList();
    await mutate("lists_put", { id, remoteId: `remote-${id}` });
    await mutate("items_post", { listId: id, name: "Milk" });
    const { lease } = await provider.acquireGrocerySync(householdId, id);
    await assert.rejects(mutate("lists_delete", { id }), { status: 409 });
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}'`), "1");
    sql(`update public.grocery_lists set lease_until = clock_timestamp() - interval '1 second' where id = '${id}'`);
    await mutate("lists_delete", { id });
    for (const action of ["renewGrocerySync", "releaseGrocerySync", "finishGrocerySync"]) {
      await assert.rejects(provider[action](householdId, lease, [{ name: "Ghost", specification: "", checked: false }]),
        { status: 404 });
      await assert.rejects(provider[action](otherHousehold, lease, []), { status: 404 });
    }
    await assert.rejects(mutate("items_post", { listId: id, name: "Ghost" }), { status: 404 });
    await assert.rejects(mutate("lists_put", { id, name: "Ghost" }), { status: 404 });
    await assert.rejects(provider.acquireGrocerySync(householdId, id), { status: 404 });
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}'`), "0");
  });

  await t.test("a worker queued behind deletion cannot recreate the list or acquire a stale mapping", async () => {
    const id = await createList();
    await mutate("lists_put", { id, remoteId: `remote-${id}` });
    const applicationName = `delete-race-${id}`;
    const deletion = concurrentCommand(`begin; set local lock_timeout = '3s';
      select id from public.households where id = '${householdId}' for update;
      select pg_sleep(1);
      select public.grocery_command('${householdId}', 'lists_delete', '{"id":"${id}"}');
      commit;`, applicationName);
    await waitForSleepingTransaction(applicationName);
    const acquisition = concurrentCommand(`set lock_timeout = '3s';
      select public.grocery_command('${householdId}', 'acquire', '{"id":"${id}"}')`, `acquire-${id}`);
    const [deleted, acquired] = await Promise.all([deletion, acquisition]);
    assert.equal(deleted.ok, true);
    assert.equal(acquired.status, 404);
    assert.equal((await snapshot()).some((list) => list.id === id), false);
  });

  await t.test("pending local wins, imports remote checkoffs, remote deletion, and no echo", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const local = await mutate("items_post", { listId: id, name: "Milk", specification: "2 L", checked: true });
    const bring = client(remoteId);
    bring.remote.set("Milk", { name: "Milk", specification: "old", checked: false });
    bring.remote.set("Eggs", { name: "Eggs", specification: "6", checked: false });
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    let list = (await snapshot()).find((item) => item.id === id);
    assert.equal(list.items.find((item) => item.id === local.id).checked, true);
    assert.equal(list.items.length, 2);
    const writes = bring.operations.length;
    bring.remote.set("Eggs", { name: "Eggs", specification: "6", checked: true });
    await syncList(provider, householdId, id, bring);
    list = (await snapshot()).find((item) => item.id === id);
    assert.equal(list.items.find((item) => item.name === "Eggs").checked, true);
    assert.equal(bring.operations.length, writes);
    bring.remote.delete("Eggs");
    await syncList(provider, householdId, id, bring);
    assert.equal((await snapshot()).find((item) => item.id === id).items.length, 1);
  });

  await t.test("Bring check-offs confirm by checked/name while preserving local specification", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const added = await mutate("items_post", { listId: id, name: "Milk", specification: "2 L", checked: true });
    const bring = client(remoteId);
    const save = bring.saveItem;
    bring.saveItem = (_remoteId, item) => save(_remoteId, {
      ...item, specification: item.checked ? "" : item.specification,
    });
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    await syncList(provider, householdId, id, bring);
    let local = (await snapshot()).find((list) => list.id === id).items[0];
    assert.equal(local.specification, "2 L");
    assert.equal(bring.operations.length, 1);
    await mutate("items_put", { listId: id, id: added.id, checked: false });
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    assert.equal(bring.remote.get("Milk").specification, "2 L");
    bring.remote.set("Milk", { name: "Milk", checked: true, specification: "" });
    await syncList(provider, householdId, id, bring);
    await syncList(provider, householdId, id, bring);
    local = (await snapshot()).find((list) => list.id === id).items[0];
    assert.equal(local.checked, true);
    assert.equal(local.specification, "2 L");
    bring.remote.set("Milk", { name: "Milk", checked: true, specification: "remote detail" });
    await syncList(provider, householdId, id, bring);
    local = (await snapshot()).find((list) => list.id === id).items[0];
    assert.equal(local.specification, "remote detail");
  });

  await t.test("rename and deletion survive remote write then crash and retry idempotently", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const item = await mutate("items_post", { listId: id, name: "Old" });
    const bring = client(remoteId);
    const realSave = bring.saveItem;
    bring.saveItem = async (...args) => { await realSave(...args); throw new Error("crash after save"); };
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "unavailable");
    await mutate("items_put", { listId: id, id: item.id, name: "New" });
    bring.saveItem = realSave;
    await syncList(provider, householdId, id, bring);
    assert.deepEqual([...bring.remote.keys()], ["New"]);
    assert.ok(bring.operations.indexOf("remove:Old") < bring.operations.indexOf("save:New"));
    await mutate("items_delete", { listId: id, id: item.id });
    const remove = bring.removeItem;
    bring.removeItem = async (...args) => { await remove(...args); throw new Error("crash after removal"); };
    await syncList(provider, householdId, id, bring);
    assert.equal((await snapshot()).find((row) => row.id === id).items.length, 0);
    bring.removeItem = remove;
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    assert.equal(bring.remote.size, 0);
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}' and deleted and not pending`), "1");
    // An old timed-out request may complete even after deletion was acknowledged.
    bring.remote.set("Old", { name: "Old", specification: "", checked: false });
    bring.remote.set("New", { name: "New", specification: "", checked: false });
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "pending");
    assert.equal((await snapshot()).find((row) => row.id === id).items.length, 0);
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    assert.equal(bring.remote.size, 0);
  });

  await t.test("deleted-name reuse and rename chains remove old identities before saving their replacements", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const first = await mutate("items_post", { listId: id, name: "First" });
    const second = await mutate("items_post", { listId: id, name: "Second" });
    const bring = client(remoteId);
    await syncList(provider, householdId, id, bring);
    await mutate("items_delete", { listId: id, id: second.id });
    await mutate("items_put", { listId: id, id: first.id, name: "Second" });
    await mutate("items_post", { listId: id, name: "First" });
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    assert.deepEqual([...bring.remote.keys()].sort(), ["First", "Second"]);
    assert.equal((await snapshot()).find((row) => row.id === id).items.length, 2);
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}' and deleted`), "1");
  });

  await t.test("acknowledged tombstones retain history without consuming active item capacity", async () => {
    const id = await createList();
    await mutate("lists_put", { id, remoteId: `remote-${id}` });
    sql(`insert into public.grocery_items(household_id,list_id,name,deleted,pending)
      select '${householdId}', '${id}', 'Deleted-' || n, true, false from generate_series(1,200) n`);
    await mutate("items_post", { listId: id, name: "Current" });
    const acquired = await provider.acquireGrocerySync(householdId, id);
    assert.equal(acquired.items.length, 1);
    await provider.releaseGrocerySync(householdId, acquired.lease);
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}' and deleted`), "200");
  });

  await t.test("stale PUT cannot resurrect pending or acknowledged tombstones; explicit POST can", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const item = await mutate("items_post", { listId: id, name: "Milk" });
    const bring = client(remoteId);
    await syncList(provider, householdId, id, bring);
    await mutate("items_delete", { listId: id, id: item.id });
    await assert.rejects(mutate("items_put", { listId: id, id: item.id, checked: true }), { status: 409 });
    await syncList(provider, householdId, id, bring);
    await assert.rejects(mutate("items_put", { listId: id, id: item.id, name: "Stale rename" }), { status: 409 });
    assert.equal((await snapshot()).find((row) => row.id === id).items.length, 0);
    const restored = await mutate("items_post", { listId: id, name: "Milk", specification: "explicit add" });
    assert.equal(restored.id, item.id);
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "synced");
    assert.equal((await snapshot()).find((row) => row.id === id).items[0].specification, "explicit add");
  });

  await t.test("acknowledged rename/delete history expires so legitimate Bring re-adds import again", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const item = await mutate("items_post", { listId: id, name: "Old" });
    const bring = client(remoteId);
    await syncList(provider, householdId, id, bring);
    await mutate("items_put", { listId: id, id: item.id, name: "New" });
    await syncList(provider, householdId, id, bring);
    assert.equal(sql(`select retire_at > clock_timestamp() from public.grocery_items where id = '${item.id}'`), "t");
    bring.remote.set("Old", { name: "Old", specification: "late", checked: false });
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "pending");
    assert.equal((await snapshot()).find((row) => row.id === id).items.length, 1);
    await syncList(provider, householdId, id, bring);
    sql(`update public.grocery_items set retire_at = clock_timestamp() - interval '1 second' where id = '${item.id}'`);
    bring.remote.set("Old", { name: "Old", specification: "legitimate re-add", checked: false });
    await syncList(provider, householdId, id, bring);
    let list = (await snapshot()).find((row) => row.id === id);
    assert.deepEqual(list.items.map((row) => row.name).sort(), ["New", "Old"]);
    const readded = list.items.find((row) => row.name === "Old");
    await mutate("items_delete", { listId: id, id: readded.id });
    await syncList(provider, householdId, id, bring);
    const retired = sql(`select retire_at::text from public.grocery_items where id = '${readded.id}'`);
    await mutate("items_delete", { listId: id, id: readded.id });
    assert.equal(sql(`select retire_at::text from public.grocery_items where id = '${readded.id}'`), retired);
    sql(`update public.grocery_items set retire_at = clock_timestamp() - interval '1 second' where id = '${readded.id}'`);
    bring.remote.set("Old", { name: "Old", specification: "re-added again", checked: false });
    await syncList(provider, householdId, id, bring);
    list = (await snapshot()).find((row) => row.id === id);
    assert.equal(list.items.find((row) => row.name === "Old").specification, "re-added again");
  });

  await t.test("concurrent sync and edits are excluded; stale workers cannot renew, release or finish", async () => {
    const id = await createList();
    await mutate("lists_put", { id, remoteId: `remote-${id}` });
    const first = await provider.acquireGrocerySync(householdId, id);
    for (const field of ["token", "fence", "revision"]) {
      const missing = { ...first.lease };
      delete missing[field];
      for (const invalidLease of [missing, { ...first.lease, [field]: null }]) {
        for (const action of ["renewGrocerySync", "releaseGrocerySync", "finishGrocerySync"]) {
          await assert.rejects(provider[action](householdId, invalidLease, []), { status: 409 });
        }
      }
      for (const invalidSnapshot of [undefined, null, {}, ""]) {
        await assert.rejects(provider.finishGrocerySync(householdId, first.lease, invalidSnapshot), { status: 400 });
      }
    }
    await assert.rejects(provider.acquireGrocerySync(householdId, id), { status: 409 });
    await assert.rejects(mutate("items_post", { listId: id, name: "Milk" }), { status: 409 });
    sql(`update public.grocery_lists set lease_until = clock_timestamp() - interval '1 second' where id = '${id}'`);
    await assert.rejects(provider.renewGrocerySync(householdId, first.lease), { status: 409 });
    await mutate("items_post", { listId: id, name: "Milk" });
    const second = await provider.acquireGrocerySync(householdId, id);
    for (const action of ["renewGrocerySync", "releaseGrocerySync", "finishGrocerySync"]) {
      await assert.rejects(provider[action](householdId, first.lease, []), { status: 409 });
    }
    await provider.releaseGrocerySync(householdId, second.lease);
    await assert.rejects(provider.renewGrocerySync(householdId, second.lease), { status: 409 });
  });

  await t.test("simultaneous PostgreSQL workers serialize on the list row", async () => {
    const id = await createList();
    await mutate("lists_put", { id, remoteId: `remote-${id}` });
    const acquire = () => new Promise((resolve, reject) => execFile("psql", [...args, "-d", database, "-c",
      `select public.grocery_command('${householdId}', 'acquire', '{"id":"${id}"}')`],
    { encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout.trim()))));
    const attempts = await Promise.all([acquire(), acquire()]);
    assert.equal(attempts.filter((result) => result.lease).length, 1);
    assert.equal(attempts.filter((result) => result.status === 409).length, 1);
    await provider.releaseGrocerySync(householdId, attempts.find((result) => result.lease).lease);
  });

  await t.test("unconfirmed snapshots retain pending writes and tombstones; failed fetch does not erase local items", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const added = await mutate("items_post", { listId: id, name: "Milk" });
    const bring = client(remoteId);
    bring.getItems = async () => [];
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "pending");
    assert.equal((await snapshot()).find((item) => item.id === id).items.length, 1);
    bring.getItems = async () => { throw new Error("outage"); };
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "unavailable");
    assert.equal((await snapshot()).find((item) => item.id === id).items.length, 1);
    await mutate("items_delete", { listId: id, id: added.id });
    bring.getItems = async () => [{ name: "Milk", specification: "", checked: false }];
    assert.equal((await syncList(provider, householdId, id, bring)).syncStatus, "pending");
    assert.equal((await snapshot()).find((item) => item.id === id).items.length, 0);
    assert.equal(sql(`select count(*) from public.grocery_items where list_id = '${id}' and pending and deleted`), "1");
  });

  await t.test("inbound same-name items deduplicate and unlink preserves local data", async () => {
    const id = await createList();
    const remoteId = `remote-${id}`;
    await mutate("lists_put", { id, remoteId });
    const bring = client(remoteId);
    bring.getItems = async () => [
      { name: "Milk", specification: "", checked: false },
      { name: "milk", specification: "duplicate", checked: true },
    ];
    await syncList(provider, householdId, id, bring);
    assert.equal((await snapshot()).find((item) => item.id === id).items.length, 1);
    assert.deepEqual(bring.operations, []);
    await mutate("lists_put", { id, remoteId: null });
    const list = (await snapshot()).find((item) => item.id === id);
    assert.equal(list.items.length, 1);
    assert.equal(list.remoteId, null);
    assert.equal(list.syncStatus, "local");
  });

  await t.test("deletion keeps household-first lock ordering with connection mutations", async () => {
    execFileSync("psql", [...args, "-d", database], {
      input: readFileSync(path.join(__dirname, "../docs/sql/bring-connections.sql"), "utf8"),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const id = await createList();
    const applicationName = `connection-delete-race-${id}`;
    const connection = concurrentCommand(`begin; set local lock_timeout = '3s';
      select id from public.households where id = '${householdId}' for update;
      select pg_sleep(1);
      select public.bring_connection_command('${householdId}', false, null, 0);
      commit;`, applicationName);
    await waitForSleepingTransaction(applicationName);
    const deletion = concurrentCommand(`set lock_timeout = '3s';
      select public.grocery_command('${householdId}', 'lists_delete', '{"id":"${id}"}')`, `delete-${id}`);
    const [changed, deleted] = await Promise.all([connection, deletion]);
    assert.equal(changed.ok, true);
    assert.equal(deleted.ok, true);
    assert.equal((await snapshot()).some((list) => list.id === id), false);
  });

  await t.test("RLS owner-only reads and forbidden direct sync-state writes/RPC", () => {
    sql(`update public.grocery_items set icon_id = 'milch',
      image_url = 'https://web.getbring.com/assets/images/items/milch.png'
      where household_id = '${householdId}' and not deleted`);
    const asOwner = `set role authenticated; set request.jwt.claim.sub = '${ownerId}';`;
    const asOther = `set role authenticated; set request.jwt.claim.sub = '${otherHousehold}';`;
    assert.ok(Number(sql(`${asOwner} select count(id) from public.grocery_lists`)) > 0);
    assert.equal(sql(`${asOther} select count(id) from public.grocery_lists`), "0");
    assert.ok(Number(sql(`${asOwner} select count(id) from public.grocery_items`)) > 0);
    assert.ok(Number(sql(`${asOwner} select count(icon_id) + count(image_url) from public.grocery_items`)) > 0);
    assert.equal(sql(`${asOther} select count(icon_id) + count(image_url) from public.grocery_items`), "0");
    assert.doesNotThrow(() => sql(`${asOwner} select icon_id, image_url from public.grocery_items`));
    assert.throws(() => sql(`${asOwner} update public.grocery_items set icon_id = 'forged'`));
    assert.throws(() => sql(`${asOwner} update public.grocery_lists set sync_status = 'synced'`));
    assert.throws(() => sql(`${asOwner} select public.grocery_command('${householdId}', 'read', '{}')`));
    assert.throws(() => sql(`${asOwner} select lease_token from public.grocery_lists`));
    assert.throws(() => sql(`set role service_role; update public.grocery_items set pending = false`));
    assert.throws(() => sql(`set role service_role; update public.grocery_items set icon_id = 'forged'`));
  });
});
