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

const metadataCatalog = (locale) => ({
  language: locale,
  catalog: { sections: [{ items: [
    { itemId: "Milch", name: locale === "en-US" ? "Milk" : "Milch" },
    { itemId: "Getränke", name: locale === "en-US" ? "Drinks" : "Getränke" },
  ] }] },
});
const metadataClient = (overrides = {}) => {
  class MockBring {
    async login() {}
    async getItems() {
      return { purchase: [
        { name: "Milk", specification: "2 l" },
        { name: "Custom drink", specification: "" },
        { name: "Handwritten", specification: "" },
      ], recently: [] };
    }
    async getItemsDetails() {
      return [
        { itemId: "Milch", userIconItemId: "", imageUrl: "" },
        { itemId: "Custom drink", userIconItemId: "Getränke", imageUrl: "" },
        { itemId: "Handwritten", userIconItemId: "", imageUrl: "" },
      ];
    }
    async loadCatalog(locale) { return metadataCatalog(locale); }
  }
  Object.assign(MockBring.prototype, overrides);
  return createBringClient(householdId, { env, Client: MockBring });
};

test("SDK catalogs resolve translated standard items; custom icons use provider identifiers, never item names", async () => {
  const items = await metadataClient().getItems("remote");
  assert.deepEqual(items, [
    { name: "Milk", specification: "2 l", checked: false, iconId: "milch", imageUrl: null },
    { name: "Custom drink", specification: "", checked: false, iconId: "getraenke", imageUrl: null },
    { name: "Handwritten", specification: "", checked: false, iconId: null, imageUrl: null },
  ]);
});

test("explicit provider icon and verified image take priority over the standard catalog", async () => {
  const imageUrl = "https://web.getbring.com/assets/images/items/provider-photo_2.png";
  const items = await metadataClient({
    async getItemsDetails() { return [{ itemId: "Milch", userIconItemId: "Getränke", imageUrl }]; },
  }).getItems("remote");
  assert.equal(items[0].iconId, "getraenke");
  assert.equal(items[0].imageUrl, imageUrl);
});

test("provider catalog identifiers use the verified Bring filename normalization, not custom names", async () => {
  for (const [providerId, expected] of [
    ["Getränke", "getraenke"], ["Große-Tüte!", "grosse_tuete"], ["Café Artikel", "cafe_artikel"],
  ]) {
    const items = await metadataClient({
      async getItemsDetails() { return [{ itemId: "Custom drink", userIconItemId: providerId, imageUrl: "" }]; },
      async loadCatalog(locale) {
        const result = metadataCatalog(locale);
        result.catalog.sections[0].items.push({ itemId: providerId, name: "Provider label" });
        return result;
      },
    }).getItems("remote");
    assert.equal(items[1].iconId, expected);
  }
  const items = await metadataClient({
    async getItemsDetails() { return [{ itemId: "Custom drink", userIconItemId: "Arbitrary custom name", imageUrl: "" }]; },
  }).getItems("remote");
  assert.equal(items[1].iconId, null);
});

test("unsafe image references and unsafe icon identifiers never leave the adapter", async () => {
  for (const imageUrl of [
    "https://attacker.invalid/image.png",
    "http://web.getbring.com/assets/images/items/milch.png",
    "https://web.getbring.com:443/assets/images/items/milch.png",
    "https://user@web.getbring.com/assets/images/items/milch.png",
    "https://web.getbring.com/assets/images/items/milch.png?redirect=evil",
    "https://web.getbring.com/assets/images/items/milch.png#fragment",
    "https://web.getbring.com/assets/images/items/../secret.png",
    "https://web.getbring.com/assets/images/items/%2e%2e.png",
    "//web.getbring.com/assets/images/items/milch.png",
    "https://web.getbring.com/assets/images/items/milch.png\n",
    "https://web.getbring.com/assets/images/items/Milch.png",
  ]) {
    const items = await metadataClient({
      async getItemsDetails() { return [{ itemId: "Milch", userIconItemId: "../unsafe", imageUrl }]; },
    }).getItems("remote");
    assert.equal(items[0].iconId, "milch");
    assert.equal(items[0].imageUrl, null);
  }
});

test("ambiguous translated identities cannot borrow another item's metadata", async () => {
  const items = await metadataClient({
    async loadCatalog(locale) {
      const result = metadataCatalog(locale);
      result.catalog.sections[0].items.push({ itemId: "Another", name: "Milk" });
      return result;
    },
    async getItemsDetails() { return [{ itemId: "Milch", userIconItemId: "Getränke", imageUrl: "" }]; },
  }).getItems("remote");
  assert.equal(items[0].iconId, null);
});

test("ambiguous detail records omit metadata instead of clearing a cached custom icon", async () => {
  const items = await metadataClient({
    async getItemsDetails() {
      return [
        { itemId: "Milch", userIconItemId: "Milch", imageUrl: "" },
        { itemId: "Milk", userIconItemId: "Getränke", imageUrl: "" },
      ];
    },
  }).getItems("remote");
  assert.equal(Object.hasOwn(items[0], "iconId"), false);
  assert.equal(Object.hasOwn(items[0], "imageUrl"), false);
});

test("details explicitly belonging to another list cannot attach or clear metadata", async () => {
  const items = await metadataClient({
    async getItemsDetails() {
      return [{ itemId: "Milch", listUuid: "another-list", userIconItemId: "Getränke", imageUrl: "" }];
    },
  }).getItems("remote");
  assert.equal(items[0].name, "Milk");
  assert.equal(Object.hasOwn(items[0], "iconId"), false);
  assert.equal(Object.hasOwn(items[0], "imageUrl"), false);
});

test("metadata outages and malformed metadata never invalidate an authoritative item snapshot or clear cached fields", async () => {
  for (const overrides of [
    { async getItemsDetails() { throw new Error("private provider response"); }, async loadCatalog() { throw new Error("offline"); } },
    { async getItemsDetails() { return {}; }, async loadCatalog() { return { language: "de-DE", catalog: { sections: [{}] } }; } },
    { async getItemsDetails() { return [{ itemId: 1 }]; }, async loadCatalog() { return { catalog: { sections: [] } }; } },
  ]) {
    const items = await metadataClient(overrides).getItems("remote");
    assert.equal(items.length, 3);
    assert.equal(Object.hasOwn(items[0], "iconId"), false);
    assert.equal(Object.hasOwn(items[0], "imageUrl"), false);
  }
  const items = await metadataClient({
    async getItemsDetails() { throw new Error("offline"); },
  }).getItems("remote");
  assert.equal(Object.hasOwn(items[0], "iconId"), false);
  assert.equal(Object.hasOwn(items[0], "imageUrl"), false);
  assert.equal(Object.hasOwn(items[1], "iconId"), false);
  const missingCatalog = await metadataClient({
    async loadCatalog(locale) {
      if (locale === "de-DE") throw new Error("offline");
      return metadataCatalog(locale);
    },
  }).getItems("remote");
  assert.equal(Object.hasOwn(missingCatalog[1], "iconId"), false);
  assert.equal(Object.hasOwn(missingCatalog[1], "imageUrl"), false);
});

test("catalog cache is bounded to two locales per client and expires", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const calls = [];
  const client = metadataClient({
    async loadCatalog(locale) { calls.push(locale); return metadataCatalog(locale); },
  });
  await client.getItems("first");
  await client.getItems("second");
  assert.deepEqual(calls.sort(), ["de-DE", "en-US"]);
  t.mock.timers.tick(3600001);
  await client.getItems("third");
  assert.equal(calls.length, 4);
});

test("hanging metadata has one independent three-second overall budget without late SDK calls", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const calls = [];
  let resolveDetails;
  const client = metadataClient({
    async getItemsDetails() {
      calls.push("details");
      return new Promise((resolve) => { resolveDetails = resolve; });
    },
    async loadCatalog(locale) { calls.push(locale); return new Promise(() => {}); },
  });
  const pending = client.getItems("remote");
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(3000);
  const items = await pending;
  assert.equal(items.length, 3);
  assert.equal(Object.hasOwn(items[0], "iconId"), false);
  resolveDetails([]);
  t.mock.timers.tick(30000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["details", "de-DE", "en-US"]);
});

test("an unresolved catalog cache entry expires with the metadata budget so the next snapshot can recover", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let calls = 0;
  const client = metadataClient({
    async loadCatalog(locale) {
      calls++;
      if (calls <= 2) return new Promise(() => {});
      return metadataCatalog(locale);
    },
  });
  const pending = client.getItems("remote");
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(3000);
  assert.equal(Object.hasOwn((await pending)[0], "iconId"), false);
  const recovered = await client.getItems("remote");
  assert.equal(recovered[0].iconId, "milch");
  assert.equal(calls, 4);
});

test("metadata timeout discards only pending catalogs and preserves successfully cached locales", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const calls = { "de-DE": 0, "en-US": 0 };
  const client = metadataClient({
    async loadCatalog(locale) {
      calls[locale]++;
      if (locale === "en-US" && calls[locale] === 1) return new Promise(() => {});
      return metadataCatalog(locale);
    },
  });
  const pending = client.getItems("remote");
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(3000);
  await pending;
  assert.equal((await client.getItems("remote"))[0].iconId, "milch");
  assert.deepEqual(calls, { "de-DE": 1, "en-US": 2 });
});

test("metadata cannot extend the main fifteen-second timeout or start after its deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let finishItems;
  const calls = [];
  const client = metadataClient({
    async getItems() { return new Promise((resolve) => { finishItems = resolve; }); },
    async getItemsDetails() { calls.push("details"); return new Promise(() => {}); },
    async loadCatalog(locale) { calls.push(locale); return new Promise(() => {}); },
  });
  const pending = client.getItems("remote");
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(14000);
  finishItems({ purchase: [{ name: "Milk", specification: "" }], recently: [] });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(975);
  assert.equal((await pending).length, 1);
  assert.equal(calls.length, 3);

  const late = client.getItems("remote");
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(15000);
  await assert.rejects(late, /Bring is unavailable/);
  finishItems({ purchase: [{ name: "Milk", specification: "" }], recently: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 3);
});
