const fs = require("node:fs");
const path = require("node:path");

const output = path.join(__dirname, "grocery-sync-package");
const apiRoot = path.join(__dirname, "../api");
const apiPackage = JSON.parse(fs.readFileSync(path.join(apiRoot, "package.json"), "utf8"));
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(__dirname, "host.json"), path.join(output, "host.json"));
fs.cpSync(path.join(__dirname, "grocery-sync"), path.join(output, "grocery-sync"), { recursive: true });
fs.cpSync(path.join(apiRoot, "shared"), path.join(output, "shared"), { recursive: true });
// Reuse the API's reviewed dependencies; the worker is not a second source of versions.
fs.writeFileSync(path.join(output, "package.json"), `${JSON.stringify({
  name: "family-butler-grocery-worker",
  version: "0.1.0",
  private: true,
  scripts: { start: "func start" },
  dependencies: apiPackage.dependencies || {},
}, null, 2)}\n`);
