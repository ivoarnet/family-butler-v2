const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const checkJavaScript = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") checkJavaScript(file);
    } else if (entry.isFile() && file.endsWith(".js")) {
      new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
    }
  }
};

checkJavaScript(__dirname);
