const test = require("node:test");
const assert = require("node:assert/strict");
const { createBringClient, configuredHouseholds } = require("./shared/bring");

const householdId = "11111111-1111-4111-8111-111111111111";
const env = { BRING_ACCOUNTS_JSON: JSON.stringify({ [householdId]: { mail: "test@example.invalid", password: "test-only" } }) };

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
