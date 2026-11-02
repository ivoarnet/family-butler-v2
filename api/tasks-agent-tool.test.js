const assert = require("node:assert/strict");
const test = require("node:test");
const createAgentTools = require("./shared/agent/tools");
const { defaultDueDate } = require("./shared/agent/tools/tasksTool");

const householdId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const memberId = "00000000-0000-0000-0000-000000000003";
const otherMemberId = "00000000-0000-0000-0000-000000000004";
const members = [
  { id: memberId, firstName: "Alex" },
  { id: otherMemberId, firstName: "Sam" },
];
const task = {
  id: "00000000-0000-0000-0000-000000000005",
  title: "Practice guitar",
  memberId,
  coins: 1,
  dueDate: "2026-11-05",
  repeatRule: "none",
  status: "todo",
  revision: 2,
};
const makeTools = (db, householdMembers = members) => {
  const context = {
    db,
    householdId,
    householdState: { members: householdMembers },
    userId,
    toClientError: (message) => Object.assign(new Error(message), { statusCode: 400 }),
  };
  return createAgentTools(context);
};

test("three UTC workdays skips weekends", () => {
  assert.equal(defaultDueDate(new Date("2026-11-02T23:59:00Z")), "2026-11-05");
  assert.equal(defaultDueDate(new Date("2026-11-06T10:00:00Z")), "2026-11-11");
  assert.equal(defaultDueDate(new Date("2026-11-07T10:00:00Z")), "2026-11-11");
});

test("registered task tool creates a one-coin task with default assignee and due date", async () => {
  const calls = [];
  const tools = makeTools({
    async mutateTasks(...args) {
      calls.push(args);
    },
  });
  const definition = tools.definitions.find((tool) => tool.name === "manage_tasks");
  assert.ok(definition);
  assert.match(definition.description, /three UTC workdays/);
  const result = await tools.executeTool("manage_tasks", { action: "create", title: "Arrange a hairdresser appointment" });
  assert.equal(result.ok, true);
  assert.equal(result.task.title, "Arrange a hairdresser appointment");
  assert.equal(result.task.memberId, memberId);
  assert.equal(result.task.coins, 1);
  assert.equal(result.task.dueDate, defaultDueDate());
  assert.match(result.task.id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(calls, [[householdId, userId, "create", {
    id: result.task.id,
    title: "Arrange a hairdresser appointment",
    memberId,
    coins: 1,
    dueDate: result.task.dueDate,
    repeatRule: "none",
  }]]);
});

test("task creation respects specified member, reward and due date, and rejects foreign members", async () => {
  const calls = [];
  const tools = makeTools({ async mutateTasks(...args) { calls.push(args); } });
  const result = await tools.executeTool("manage_tasks", {
    action: "create",
    title: "Buy a present",
    memberId: otherMemberId,
    coins: 3,
    dueDate: "2026-11-16",
  });
  assert.equal(result.task.memberName, "Sam");
  assert.equal(result.task.coins, 3);
  assert.equal(result.task.dueDate, "2026-11-16");
  await assert.rejects(
    tools.executeTool("manage_tasks", { action: "create", title: "Invalid assignment", memberId: "foreign-member" }),
    /not part of this household/
  );
  await assert.rejects(
    tools.executeTool("manage_tasks", { action: "create", title: "Invalid date", dueDate: "0000-01-01" }),
    /valid YYYY-MM-DD/
  );
  assert.equal(calls.length, 1);
});

test("a null due date still receives the default", async () => {
  let created;
  const tools = makeTools({
    async mutateTasks(_householdId, _userId, _action, taskInput) {
      created = taskInput;
    },
  });
  const result = await tools.executeTool("manage_tasks", { action: "create", title: "Call the dentist", dueDate: null });
  assert.equal(created.dueDate, defaultDueDate());
  assert.equal(result.task.dueDate, created.dueDate);
});

test("task listing reads open tasks and completion earns only the matched task's configured coins", async () => {
  const reads = [];
  const mutations = [];
  const tools = makeTools({
    async getTasks(...args) {
      reads.push(args);
      return { tasks: [task], leaderboard: { week: [], month: [] } };
    },
    async mutateTasks(...args) {
      mutations.push(args);
    },
  });
  const list = await tools.executeTool("manage_tasks", { action: "list", query: "guitar" });
  assert.equal(list.count, 1);
  assert.equal(list.tasks[0].memberName, "Alex");
  assert.deepEqual(reads[0], [householdId, userId, { status: "open" }]);
  const completed = await tools.executeTool("manage_tasks", { action: "complete", taskId: task.id });
  assert.deepEqual(completed, { ok: true, taskId: task.id, title: task.title, coinsEarned: 1 });
  assert.deepEqual(mutations, [[householdId, userId, "update", {
    id: task.id,
    revision: task.revision,
    title: task.title,
    memberId,
    coins: task.coins,
    dueDate: task.dueDate,
    repeatRule: task.repeatRule,
    status: "done",
  }]]);
});

test("completion rejects a task that is not open", async () => {
  const tools = makeTools({
    async getTasks() {
      return { tasks: [], leaderboard: { week: [], month: [] } };
    },
    async mutateTasks() {
      assert.fail("closed task must not be mutated");
    },
  });
  await assert.rejects(
    tools.executeTool("manage_tasks", { action: "complete", taskId: task.id }),
    /Open task not found/
  );
});
