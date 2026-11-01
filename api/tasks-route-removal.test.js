const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const path = require("node:path");

test("Tasks deploys the household CRUD and optional move resource Azure Functions route", () => {
  const definition = JSON.parse(readFileSync(path.join(__dirname, "tasks/function.json"), "utf8"));
  const trigger = definition.bindings.find((binding) => binding.type === "httpTrigger");
  assert.equal(trigger.route, "households/{householdId}/tasks/{resource?}");
  assert.equal(trigger.authLevel, "anonymous");
  assert.deepEqual(trigger.methods, ["get", "post", "put", "delete"]);
  assert.ok(definition.bindings.some((binding) => binding.type === "http" && binding.name === "res"));
  assert.equal(typeof require("./tasks"), "function");
});

test("no Azure Function restores any legacy global Tasks route", () => {
  for (const directory of readdirSync(__dirname, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const config = path.join(__dirname, directory.name, "function.json");
    if (!existsSync(config)) continue;
    const definition = JSON.parse(readFileSync(config, "utf8"));
    for (const trigger of definition.bindings.filter((binding) => binding.type === "httpTrigger")) {
      const route = (trigger.route ?? directory.name).replace(/^\/+/, "");
      assert.notEqual(route.split("/")[0].toLowerCase(), "tasks", `${directory.name} exposes global Tasks`);
    }
  }
});
