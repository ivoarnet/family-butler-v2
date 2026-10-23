const test = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync, readFileSync, statSync } = require("node:fs");
const path = require("node:path");

const apiDirectory = __dirname;

const taskRouteMethods = () => readdirSync(apiDirectory)
  .filter((entry) => statSync(path.join(apiDirectory, entry)).isDirectory())
  .flatMap((directory) => {
    const functionPath = path.join(apiDirectory, directory, "function.json");
    try {
      const definition = JSON.parse(readFileSync(functionPath, "utf8"));
      return definition.bindings
        .filter((binding) => binding.type === "httpTrigger")
        .filter((binding) => (binding.route || directory).split("/").at(-1) === "tasks")
        .flatMap((binding) => (binding.methods || ["get", "post", "put", "patch", "delete"])
          .map((method) => method.toLowerCase()));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  });

for (const method of ["get", "post"]) {
  test(`no deployed function exposes the Tasks ${method.toUpperCase()} route`, () => {
    assert.equal(taskRouteMethods().includes(method), false);
  });
}
