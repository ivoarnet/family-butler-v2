const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createBringClient, configuredHouseholds } = require("./shared/bring");

const householdId = "11111111-1111-4111-8111-111111111111";
const env = { BRING_ACCOUNTS_JSON: JSON.stringify({ [householdId]: { mail: "test@example.invalid", password: "test-only" } }) };

test("settings and local grocery handlers load without the optional SDK", () => {
  execFileSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const { randomBytes } = require("node:crypto");
    const Module = require("node:module");
    const originalLoad = Module._load;
    Module._load = function (name, ...args) {
      if (name === "bring-shopping") throw new Error("SDK unavailable");
      return originalLoad.call(this, name, ...args);
    };
    const { createHandler } = require("./groceries");
    const store = {
      getChildcareHousehold: async () => ({ id: "${householdId}" }),
      getBringConnectionMetadata: async () => null,
      getGroceries: async () => ({ lists: [] }),
      mutateGroceries: async () => ({ ok: true }),
    };
    const env = { BRING_CREDENTIALS_KEY: randomBytes(32).toString("base64") };
    const handler = createHandler(store, async () => "owner", undefined, { env });
    const invoke = async (method, resource, body) => {
      const context = {};
      await handler(context, { method, params: { householdId: "${householdId}", resource }, body });
      return context.res;
    };
    (async () => {
      assert.deepEqual(await invoke("GET", "connection"), {
        status: 200, body: { configured: false, source: null, canConfigure: true },
      });
      assert.equal((await invoke("GET")).status, 200);
      assert.equal((await invoke("POST", "lists", { name: "Local groceries" })).status, 201);
      assert.deepEqual(await invoke("PUT", "connection", {
        mail: "test@example.invalid", password: "test-only",
      }), { status: 503, body: { error: "unavailable" } });
    })().catch(() => process.exit(1));
  `], { cwd: __dirname });
});

test("Bring configuration is household-scoped and malformed config disables integration", () => {
  assert.equal(createBringClient(householdId, { env: {} }), null);
  assert.equal(createBringClient("other", { env }), null);
  assert.equal(createBringClient("toString", { env }), null);
  assert.deepEqual(configuredHouseholds(env), [householdId]);
  assert.deepEqual(configuredHouseholds({ BRING_ACCOUNTS_JSON: "invalid" }), []);
});

test("adapter translates lists/items and encodes form values without network", async () => {
  const calls = [];
  class MockBring {
    async login() { calls.push("login"); }
    async loadLists() { return { lists: [{ listUuid: "remote", name: "Groceries" }] }; }
    async getItems() {
      return { purchase: [{ name: "Milk", specification: "2 l" }], recently: [{ name: "Bread", specification: "" }] };
    }
    async saveItem(...args) { calls.push(["save", ...args]); }
    async moveToRecentList(...args) { calls.push(["check", ...args]); }
    async removeItem(...args) { calls.push(["remove", ...args]); }
  }
  const client = createBringClient(householdId, { env, Client: MockBring });
  assert.deepEqual(await client.listLists(), [{ id: "remote", name: "Groceries" }]);
  assert.deepEqual(await client.getItems("remote"), [
    { name: "Bread", specification: "", checked: true },
    { name: "Milk", specification: "2 l", checked: false },
  ]);
  await client.saveItem("remote", { name: "A&B", specification: "2 + 3", checked: true });
  await client.removeItem("remote", "A&B");
  assert.deepEqual(calls, [
    "login", ["save", "remote", "A%26B", "2%20%2B%203"], ["check", "remote", "A%26B"],
    ["remove", "remote", "A%26B"],
  ]);
});

test("adapter rejects incomplete snapshots rather than treating them as deletion", async () => {
  class MockBring {
    async login() {}
    async getItems() { return { purchase: [] }; }
  }
  const client = createBringClient(householdId, { env, Client: MockBring });
  await assert.rejects(client.getItems("remote"), /Bring is unavailable/);
});

test("provider exceptions are redacted and failed login can be retried", async () => {
  let attempts = 0;
  class MockBring {
    async login() { if (++attempts === 1) throw new Error("private credentials"); }
    async loadLists() { return { lists: [] }; }
  }
  const client = createBringClient(householdId, { env, Client: MockBring });
  await assert.rejects(client.listLists(), (error) => !error.message.includes("private credentials"));
  assert.deepEqual(await client.listLists(), []);
});

test("unreachable Bring calls have a bounded wait", async () => {
  class MockBring { async login() { return new Promise(() => {}); } }
  const client = createBringClient(householdId, { env, Client: MockBring, timeoutMs: 5 });
  await assert.rejects(client.listLists(), /Bring is unavailable/);
});

test("a late login cannot start a write after the caller timed out", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let finishLogin;
  let writes = 0;
  class MockBring {
    async login() { return new Promise((resolve) => { finishLogin = resolve; }); }
    async saveItem() { writes++; }
  }
  const client = createBringClient(householdId, { env, Client: MockBring, timeoutMs: 5 });
  const pending = client.saveItem("remote", { name: "Milk", specification: "", checked: false });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(6);
  await assert.rejects(pending);
  finishLogin();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes, 0);
});

test("a late save cannot start a checkoff after the caller timed out", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let finishSave;
  let checkoffs = 0;
  class MockBring {
    async login() {}
    async saveItem() { return new Promise((resolve) => { finishSave = resolve; }); }
    async moveToRecentList() { checkoffs++; }
  }
  const client = createBringClient(householdId, { env, Client: MockBring, timeoutMs: 5 });
  const pending = client.saveItem("remote", { name: "Milk", specification: "", checked: true });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(6);
  await assert.rejects(pending);
  finishSave();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(checkoffs, 0);
});
