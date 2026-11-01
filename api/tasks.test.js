const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, execFile } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createHandler } = require("./tasks");
const createProvider = require("./shared/db/providers/tasks");
const { validateMutation, validateFilters } = require("./shared/tasks");

const householdId = "00000000-0000-0000-0000-000000000001";
const ownerId = "00000000-0000-0000-0000-000000000002";
const memberId = "00000000-0000-0000-0000-000000000003";
const id = "00000000-0000-0000-0000-000000000004";
const otherHousehold = "00000000-0000-0000-0000-000000000005";
const otherMember = "00000000-0000-0000-0000-000000000006";
const task = { title: "Clean room", memberId, coins: 5, dueDate: "2026-11-01", repeatRule: "none" };
const invoke = async (handler, method, body, resource, query, household = householdId) => {
  const context = {};
  await handler(context, { method, params: { householdId: household, resource }, body, query });
  return context.res;
};
const store = () => ({
  getTasksHousehold: async () => ({ id: householdId }),
  getTasks: async () => [],
  mutateTasks: async () => ({ ok: true, id }),
});

test("Tasks authenticates every route and isolates inaccessible households before validation or data access", async () => {
  let accessed = false;
  const forbidden = async () => { accessed = true; throw new Error("unexpected"); };
  for (const [method, resource] of [["GET"], ["POST"], ["PUT"], ["DELETE"], ["POST", "move"]]) {
    assert.equal((await invoke(createHandler({ getTasksHousehold: forbidden }, async () => null), method, null, resource)).status, 401);
    const db = { getTasksHousehold: async (...args) => {
      assert.deepEqual(args, [householdId, ownerId]);
      return null;
    }, getTasks: forbidden, mutateTasks: forbidden };
    assert.equal((await invoke(createHandler(db, async () => ownerId), method, null, resource)).status, 404);
  }
  assert.equal(accessed, false);
});

test("CRUD and moves delegate one transaction with authenticated owner, household, normalized payload and revisions", async () => {
  const calls = [];
  const db = store();
  db.mutateTasks = async (...args) => { calls.push(args); return { ok: true, id }; };
  const handler = createHandler(db, async () => ownerId);
  for (const [method, body, resource, action] of [
    ["POST", { ...task, id, title: " Clean room " }, undefined, "create"],
    ["PUT", { ...task, id, revision: 4 }, undefined, "update"],
    ["DELETE", { id, revision: 5 }, undefined, "delete"],
    ["POST", { id, revision: 6, status: "in_progress" }, "move", "move"],
    ["POST", { id, revision: 7, status: "done", beforeId: memberId }, "move", "move"],
  ]) {
    const response = await invoke(handler, method, body, resource);
    assert.equal(response.status, action === "create" ? 201 : 200);
    assert.deepEqual(response.body, { ok: true, id });
    assert.deepEqual(calls.at(-1), [householdId, ownerId, action, validateMutation(action, body)]);
  }
});

test("strict UUID, numeric, date, title and full payload validation", async () => {
  const bad = [
    null, [], {}, { ...task, householdId }, { ...task, title: " " }, { ...task, title: "x".repeat(161) },
    { ...task, title: "\nClean" }, { ...task, title: "a\u0000b" }, { ...task, title: 42 },
    { ...task, memberId: null }, { ...task, memberId: "bad" }, { ...task, id: null },
    ...[-1, 1.5, "5", null, true, 1000001, Infinity, NaN].map((coins) => ({ ...task, coins })),
    ...["2026-02-29", "2026-11-31", "2026-1-01", "0000-01-01", "", 5].map((dueDate) => ({ ...task, dueDate })),
    { ...task, dueDate: null, repeatRule: "daily" }, { ...task, dueDate: undefined },
    { ...task, repeatRule: "monthly" }, { ...task, repeatRule: null },
  ];
  const handler = createHandler(store(), async () => ownerId);
  for (const body of bad) assert.equal((await invoke(handler, "POST", body)).status, 400, JSON.stringify(body));
  for (const revision of [undefined, null, "0", -1, 1.5, 2147483647]) {
    assert.equal((await invoke(handler, "PUT", { ...task, id, revision })).status, 400);
    assert.equal((await invoke(handler, "DELETE", { id, revision })).status, 400);
  }
  assert.equal((await invoke(handler, "PUT", { id, revision: 0, title: "Partial" })).status, 400);
  assert.equal((await invoke(handler, "DELETE", { id, revision: 0, title: "extra" })).status, 400);
  for (const body of [{ id, revision: 0, status: "open" }, { id, revision: 0, status: "done", beforeId: id },
    { id, revision: 0, status: "done", beforeId: "" }, { id, revision: 0, status: "done", coins: 1 }]) {
    assert.equal((await invoke(handler, "POST", body, "move")).status, 400);
  }
  for (const status of ["open", null, 1]) {
    assert.equal((await invoke(handler, "PUT", { ...task, id, revision: 0, status })).status, 400);
  }
  assert.equal(validateMutation("update", { ...task, id, revision: 0, status: "done" }).status, "done");
  assert.equal((await invoke(handler, "POST", { ...task, dueDate: null, coins: 0 })).status, 201);
  assert.equal(validateMutation("create", { ...task, title: "😀".repeat(160) }).title.length, 320);
});

test("GET filters are strict, inclusive, paired, ordered and bounded and normalized", async () => {
  let received;
  const db = store();
  db.getTasks = async (...args) => { received = args; return [{ id }]; };
  const handler = createHandler(db, async () => ownerId);
  const filters = { memberId: memberId.toUpperCase(), status: "open", startDate: "2026-11-01", endDate: "2026-11-01" };
  assert.deepEqual((await invoke(handler, "GET", undefined, undefined, filters)).body, { tasks: [{ id }] });
  assert.deepEqual(received, [householdId, ownerId, { ...filters, memberId }]);
  for (const query of [{ status: "" }, { status: "other" }, { memberId: "" }, { memberId: [memberId] },
    { startDate: "2026-11-01" }, { endDate: "2026-11-01" }, { startDate: "", endDate: "" },
    { startDate: "2026-02-30", endDate: "2026-03-01" }, { startDate: "2026-11-02", endDate: "2026-11-01" },
    { startDate: "2026-01-01", endDate: "2028-01-01" }, { limit: 10 }]) {
    assert.equal((await invoke(handler, "GET", undefined, undefined, query)).status, 400);
  }
  assert.deepEqual(validateFilters(), {});
});

test("Tasks masks internal errors and propagates conflicts and resource not-found safely", async () => {
  const db = store();
  const handler = createHandler(db, async () => ownerId);
  for (const status of [400, 404, 409, 500, 503]) {
    db.mutateTasks = async () => { throw Object.assign(new Error("internal SQL secret"), { status }); };
    const response = await invoke(handler, "DELETE", { id, revision: 0 });
    assert.equal(response.status, [400, 404, 409].includes(status) ? status : 500);
    assert.doesNotMatch(JSON.stringify(response), /internal|SQL|secret/);
  }
  for (const [method, resource] of [["PATCH"], ["GET", "move"], ["PUT", "move"], ["POST", "complete"]]) {
    assert.equal((await invoke(handler, method, {}, resource)).status, 405);
  }
});

test("provider scopes owner lookup, maps exactly the Task contract and uses RPC for reads and all writes", async () => {
  const calls = [];
  const row = { id, household_id: householdId, title: task.title, member_id: memberId, coins: 5,
    status: "todo", sort_order: 0, due_date: null, repeat_rule: "none", series_id: null, completed_at: null,
    revision: 0, next_task_id: memberId, creation_payload: "private" };
  const provider = createProvider(async (endpoint, options) => {
    calls.push([endpoint, options]);
    return endpoint === "households" ? [{ id: householdId }]
      : options.body.p_action === "read" ? { tasks: [row] } : { ok: true, id };
  });
  assert.deepEqual(await provider.getTasksHousehold(householdId, ownerId), { id: householdId });
  assert.deepEqual(calls[0][1].params, {
    select: "id", id: `eq.${householdId}`, created_by_user_id: `eq.${ownerId}`, limit: 1,
  });
  assert.deepEqual(await provider.getTasks(householdId, ownerId, { status: "open" }), [{
    id, householdId, title: task.title, memberId, coins: 5, status: "todo", sortOrder: 0,
    dueDate: null, repeatRule: "none", seriesId: null, completedAt: null, revision: 0,
  }]);
  for (const action of ["create", "update", "delete", "move"]) {
    await provider.mutateTasks(householdId, ownerId, action, { id });
    assert.deepEqual(calls.at(-1), ["rpc/mutate_household_task", {
      method: "POST", body: { p_household: householdId, p_user: ownerId, p_action: action, p_data: { id } },
    }]);
  }
  for (const result of [null, [], { tasks: null }, { error: "SQL secret", status: 409 }]) {
    const broken = createProvider(async () => result);
    await assert.rejects(() => broken.getTasks(householdId, ownerId), /unavailable/);
  }
});

const pgSocket = process.env.TASKS_TEST_PG_SOCKET || process.env.GROCERY_TEST_PG_SOCKET;
test("PostgreSQL Tasks transactions, ordering, recurrence, optimistic concurrency, isolation and RLS", {
  skip: !pgSocket,
}, async (t) => {
  const database = `tasks_test_${process.pid}`;
  const args = ["-h", pgSocket, "-p", process.env.TASKS_TEST_PG_PORT || process.env.GROCERY_TEST_PG_PORT || "55439",
    "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement, db = database) => execFileSync("psql", [...args, "-d", db, "-c", statement],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).trim();
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
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
    create table public.household_members(id uuid primary key, household_id uuid not null references public.households(id) on delete cascade);
    create table public.tasks(id uuid primary key, title text not null);
    insert into public.tasks values ('${id}', 'Unowned legacy global task');
    alter table public.tasks enable row level security;
    insert into public.households values ('${householdId}', '${ownerId}'), ('${otherHousehold}', '${otherHousehold}');
    insert into public.household_members values ('${memberId}', '${householdId}'), ('${otherMember}', '${otherHousehold}');
    grant select on public.households to authenticated;
  `);
  for (let run = 0; run < 2; run++) execFileSync("psql", [...args, "-d", database], {
    input: readFileSync(path.join(__dirname, "../docs/sql/tasks.sql"), "utf8"), stdio: ["pipe", "pipe", "pipe"],
  });
  const statement = (action, data, household = householdId, user = ownerId) =>
    `select public.mutate_household_task(${quote(household)}::uuid, ${quote(user)}::uuid, ${quote(action)}, ${quote(JSON.stringify(data))}::jsonb)`;
  const command = (action, data = {}, household, user) => JSON.parse(sql(statement(action, data, household, user)));
  const provider = createProvider(async (_endpoint, options) => {
    const { p_household, p_user, p_action, p_data } = options.body;
    return command(p_action, p_data, p_household, p_user);
  });
  const mutate = (action, data) => provider.mutateTasks(householdId, ownerId, action, data);
  const snapshot = (filters) => provider.getTasks(householdId, ownerId, filters);
  const create = async (changes = {}) => {
    const taskId = randomUUID();
    await mutate("create", { ...task, id: taskId, ...changes });
    return taskId;
  };
  const move = async (taskId, status, beforeId = null) => {
    const current = (await snapshot()).find((card) => card.id === taskId);
    return mutate("move", { id: taskId, revision: current.revision, status, beforeId });
  };
  const clear = () => sql("delete from public.household_tasks");

  await t.test("migration leaves incompatible global Tasks untouched, inaccessible and entirely outside the new API", async () => {
    assert.equal(sql("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tasks'"), "2");
    assert.deepEqual(await snapshot(), []);
    assert.equal(command("update", { ...task, id, revision: 0 }).status, 404);
    assert.equal(command("delete", { id, revision: 0 }).status, 404);
    await mutate("create", { ...task, id });
    assert.equal((await snapshot())[0].title, task.title);
    await mutate("delete", { id, revision: 0 });
    assert.equal(sql(`select title from public.tasks where id = '${id}'`), "Unowned legacy global task");
    assert.throws(() => sql("set role anon; select * from public.tasks"));
    assert.throws(() => sql("set role authenticated; select * from public.tasks"));
    assert.throws(() => sql("set role service_role; select * from public.tasks"));
  });

  await t.test("CRUD idempotence retains immutable creation payload across edits and isolates all households", async () => {
    const taskId = await create();
    assert.deepEqual(await mutate("create", { ...task, id: taskId }), { ok: true, id: taskId });
    assert.equal((await snapshot()).length, 1);
    assert.equal(command("create", { ...task, id: taskId, coins: 10 }).status, 409);
    await mutate("update", { ...task, id: taskId, revision: 0, title: "Updated", coins: 0, dueDate: null });
    assert.equal((await snapshot())[0].revision, 1);
    assert.deepEqual(await mutate("create", { ...task, id: taskId }), { ok: true, id: taskId });
    assert.equal((await snapshot())[0].title, "Updated");
    for (const action of ["read", "create", "update", "delete", "move"]) {
      assert.equal(command(action, { ...task, id: taskId, revision: 1 }, otherHousehold).status, 404);
    }
    assert.equal(command("read", {}, householdId, otherHousehold).status, 404);
    assert.equal(command("delete", { id: randomUUID(), revision: 0 }).status, 404);
    assert.equal(command("create", { ...task, memberId: otherMember }).status, 400);
    assert.equal(command("update", { ...task, id: taskId, revision: 1, memberId: otherMember }).status, 400);
    assert.equal(command("update", { ...task, id: taskId, revision: 0 }).status, 409);
    assert.equal(command("delete", { id: taskId, revision: 0 }).status, 409);
    await mutate("delete", { id: taskId, revision: 1 });
    assert.deepEqual(await snapshot(), []);
  });

  await t.test("same and cross-column reorder updates contiguous positions and only the moved revision", async () => {
    clear();
    const a = await create(), b = await create(), c = await create();
    await move(c, "todo", a);
    assert.deepEqual((await snapshot()).map((card) => [card.id, card.sortOrder, card.revision]),
      [[c, 0, 1], [a, 1, 0], [b, 2, 0]]);
    await move(a, "in_progress");
    await move(b, "in_progress", a);
    assert.deepEqual((await snapshot()).map((card) => [card.id, card.status, card.sortOrder]),
      [[c, "todo", 0], [b, "in_progress", 0], [a, "in_progress", 1]]);
    await move(b, "in_progress");
    assert.deepEqual((await snapshot()).filter((card) => card.status === "in_progress").map((card) => card.id), [a, b]);
    const before = await snapshot();
    assert.equal(command("move", { id: c, revision: 1, status: "done", beforeId: a }).status, 400);
    assert.deepEqual(await snapshot(), before);
    await mutate("delete", { id: a, revision: 1 });
    assert.equal((await snapshot()).find((card) => card.id === b).sortOrder, 0);
  });

  await t.test("editing status reorders lanes and completion creates only the updated recurring successor", async () => {
    clear();
    const a = await create({ repeatRule: "daily" });
    const b = await create();
    await mutate("update", { ...task, id: a, revision: 0, status: "in_progress", repeatRule: "daily" });
    assert.deepEqual((await snapshot()).map((card) => [card.id, card.status, card.sortOrder, card.revision]),
      [[b, "todo", 0, 0], [a, "in_progress", 0, 1]]);
    await mutate("update", { ...task, id: a, revision: 1, status: "done", repeatRule: "daily",
      title: "Updated task", dueDate: "2026-11-10" });
    let rows = await snapshot();
    const completed = rows.find((card) => card.id === a);
    const next = rows.find((card) => card.id !== a && card.id !== b);
    assert.equal(completed.status, "done");
    assert.ok(completed.completedAt);
    assert.equal(completed.revision, 2);
    assert.equal(next.title, "Updated task");
    assert.equal(next.dueDate, "2026-11-11");
    assert.equal(next.status, "todo");
    await mutate("update", { ...task, id: a, revision: 2, status: "todo", repeatRule: "daily" });
    rows = await snapshot();
    assert.equal(rows.find((card) => card.id === a).completedAt, null);
    assert.equal(rows.length, 3);
    await mutate("update", { ...task, id: a, revision: 3, status: "done", repeatRule: "daily" });
    assert.equal((await snapshot()).length, 3);
  });

  await t.test("date/member/open filters map nulls and include both date boundaries without undated cards", async () => {
    clear();
    const a = await create({ dueDate: "2026-11-01" });
    const b = await create({ dueDate: "2026-11-07" });
    const c = await create({ dueDate: null });
    await move(b, "done");
    assert.deepEqual((await snapshot({ startDate: "2026-11-01", endDate: "2026-11-07" })).map((card) => card.id), [a, b]);
    assert.deepEqual((await snapshot({ status: "open", memberId })).map((card) => card.id), [a, c]);
    assert.deepEqual(await snapshot({ memberId: otherMember }), []);
    assert.equal((await snapshot({ status: "done" }))[0].completedAt === null, false);
    const undated = (await snapshot()).find((card) => card.id === c);
    assert.equal(undated.seriesId, null);
    assert.equal(undated.dueDate, null);
    for (const filters of [{ startDate: "2026-11-01" }, { status: null },
      { startDate: "2026-02-30", endDate: "2026-03-01" },
      { startDate: "2026-01-01", endDate: "2028-01-01" }]) assert.equal(command("read", filters).status, 400);
  });

  await t.test("daily and weekly first completion spawn one linked occurrence; reopening/edits/deletion never respawn", async () => {
    for (const [repeatRule, expectedDate] of [["daily", "2026-11-02"], ["weekly", "2026-11-08"]]) {
      clear();
      const recurring = await create({ repeatRule });
      await move(recurring, "done");
      const rows = await snapshot();
      const next = rows.find((card) => card.id !== recurring);
      const done = rows.find((card) => card.id === recurring);
      assert.equal(rows.length, 2);
      assert.equal(next.dueDate, expectedDate);
      assert.equal(next.seriesId, recurring);
      assert.equal(done.seriesId, recurring);
      assert.equal(next.coins, 5);
      assert.equal(next.status, "todo");
      assert.equal(next.revision, 0);
      assert.ok(done.completedAt);
      assert.equal(command("move", { id: recurring, revision: 0, status: "done" }).status, 409);
      await move(recurring, "done");
      assert.equal((await snapshot()).length, 2);
      await move(recurring, "todo");
      assert.equal((await snapshot()).find((card) => card.id === recurring).completedAt, null);
      assert.equal(command("update", { ...task, id: recurring, revision: 3, repeatRule: "none" }).status, 400);
      await mutate("update", { ...task, id: recurring, revision: 3, repeatRule,
        title: "Edited original", coins: 10, dueDate: "2026-12-01" });
      assert.equal((await snapshot()).find((card) => card.id === next.id).title, task.title);
      await mutate("delete", { id: next.id, revision: 0 });
      await move(recurring, "done");
      assert.equal((await snapshot()).length, 1);
      assert.equal(sql(`select next_task_id from public.household_tasks where id = '${recurring}'`), next.id);
      assert.ok(sql(`select first_completed_at from public.household_tasks where id = '${recurring}'`));
    }
    clear();
    const a = await create();
    await move(a, "done");
    assert.equal(command("update", { ...task, id: a, revision: 1, repeatRule: "daily" }).status, 400);
    assert.equal((await snapshot())[0].repeatRule, "none");
    assert.equal((await snapshot())[0].revision, 1);
    await move(a, "todo");
    assert.equal(command("update", { ...task, id: a, revision: 2, repeatRule: "weekly" }).status, 400);
    await move(a, "done");
    assert.equal((await snapshot()).length, 1, "completed single tasks cannot be converted into misleading recurring cards");
    clear();
    const editable = await create();
    await mutate("update", { ...task, id: editable, revision: 0, repeatRule: "daily" });
    await move(editable, "done");
    const editedRows = await snapshot();
    assert.equal(editedRows.length, 2, "recurrence configured before first completion still spawns exactly once");
    assert.equal(editedRows.find((card) => card.id !== editable).dueDate, "2026-11-02");
  });

  await t.test("SQL rejects malformed service calls and composite FK rejects cross-household membership", async () => {
    clear();
    for (const data of [
      { ...task, coins: "5" }, { ...task, coins: 1.2 }, { ...task, coins: -1 }, { ...task, coins: 1000001 },
      { ...task, title: "\nClean\n" }, { ...task, dueDate: "2026-02-30" },
      { ...task, dueDate: null, repeatRule: "daily" }, { ...task, dueDate: "10000-01-01" },
      { ...task, status: "done" }, { ...task, memberId: null }, { ...task, repeatRule: null },
    ]) assert.equal(command("create", data).status, 400, JSON.stringify(data));
    assert.deepEqual(await snapshot(), []);
    const a = await create();
    assert.throws(() => sql(`update public.household_tasks set member_id = '${otherMember}' where id = '${a}'`));
    assert.equal(command("move", { id: a, revision: 0, status: "done", beforeId: a }).status, 400);
    assert.equal(command("move", { id: a, revision: "0", status: "done" }).status, 400);
    assert.equal(command("update", { ...task, id: a, revision: 0, status: "open" }).status, 400);
    for (const [repeatRule, dueDate] of [["daily", "9999-12-31"], ["weekly", "9999-12-25"]]) {
      const boundary = await create({ dueDate, repeatRule });
      const before = await snapshot();
      assert.equal(command("move", { id: boundary, revision: 0, status: "done" }).status, 400);
      assert.deepEqual(await snapshot(), before, "failed successor creation rolls back completion and reorder");
    }
  });

  await t.test("owner-only RLS and RPC grants prevent browser and direct service-role writes", async () => {
    clear();
    const a = await create();
    assert.equal(sql(`set role authenticated; set request.jwt.claim.sub = '${ownerId}'; select count(id) from public.household_tasks`), "1");
    assert.equal(sql(`set role authenticated; set request.jwt.claim.sub = '${otherHousehold}'; select count(id) from public.household_tasks`), "0");
    assert.throws(() => sql(`set role authenticated; ${statement("delete", { id: a, revision: 0 })}`));
    assert.throws(() => sql(`set role anon; ${statement("read", {})}`));
    assert.throws(() => sql("set role service_role; delete from public.household_tasks"));
    assert.throws(() => sql("set role authenticated; select first_completed_at from public.household_tasks"));
    assert.deepEqual(JSON.parse(sql(`set role service_role; ${statement("read", {})}`)).tasks.map((row) => row.id), [a]);
  });

  await t.test("task cap bounds storage and read results and failed recurrence completion remains atomic", async () => {
    clear();
    const a = await create({ repeatRule: "daily" });
    sql(`insert into public.household_tasks(id, household_id, title, member_id, coins, sort_order, creation_payload)
      select gen_random_uuid(), '${householdId}', 'Limit task', '${memberId}', 0, n, '{}'::jsonb
      from generate_series(1, 9999) n`);
    assert.equal((await snapshot()).length, 10000);
    assert.equal(command("create", task).status, 409);
    assert.equal(command("move", { id: a, revision: 0, status: "done" }).status, 409);
    const original = (await snapshot()).find((card) => card.id === a);
    assert.equal(original.status, "todo");
    assert.equal(original.revision, 0);
    assert.equal(original.completedAt, null);
    assert.equal(sql(`select next_task_id is null and first_completed_at is null from public.household_tasks where id = '${a}'`), "t");
    sql(`insert into public.household_tasks(id, household_id, title, member_id, coins, sort_order, creation_payload)
      values(gen_random_uuid(), '${householdId}', 'Imported excess', '${memberId}', 0, 10000, '{}'::jsonb)`);
    assert.equal(command("read").status, 409, "over-limit imports fail closed rather than returning a partial board");
  });

  await t.test("concurrent completion/reorder serialize under household lock and stale revision loses without duplicate recurrence", async () => {
    clear();
    const a = await create({ repeatRule: "daily" }), b = await create();
    const run = (query) => new Promise((resolve, reject) => execFile("psql", [...args, "-d", database, "-c", query],
      { encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout.trim().split("\n").at(-1)))));
    const results = await Promise.all([
      run(statement("move", { id: a, revision: 0, status: "done" })),
      run(statement("move", { id: a, revision: 0, status: "done" })),
      run(statement("move", { id: b, revision: 0, status: "in_progress" })),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 2);
    assert.equal(results.filter((result) => result.status === 409).length, 1);
    const rows = await snapshot();
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row.seriesId === a).length, 2);
    for (const status of ["todo", "in_progress", "done"]) {
      assert.deepEqual(rows.filter((row) => row.status === status).map((row) => row.sortOrder),
        rows.filter((row) => row.status === status).map((_row, index) => index));
    }
  });

  await t.test("household deletion cascades tasks and members while individual assigned-member deletion is restricted", async () => {
    const household = randomUUID(), member = randomUUID(), taskId = randomUUID();
    sql(`insert into public.households values ('${household}', '${ownerId}');
      insert into public.household_members values ('${member}', '${household}')`);
    assert.equal(command("create", { ...task, id: taskId, memberId: member }, household).ok, true);
    assert.throws(() => sql(`delete from public.household_members where id = '${member}'`));
    sql(`delete from public.households where id = '${household}'`);
    assert.equal(sql(`select count(*) from public.household_tasks where household_id = '${household}'`), "0");
    assert.equal(sql(`select count(*) from public.household_members where household_id = '${household}'`), "0");
    assert.equal(sql(`select count(*) from public.tasks where id = '${id}'`), "1", "legacy global data remains untouched");
  });
});
