const path = require("node:path");
const { existsSync } = require("node:fs");
const sharedRoot = existsSync(path.join(__dirname, "../shared/db/index.js"))
  ? path.join(__dirname, "../shared")
  : path.join(__dirname, "../../api/shared");
const db = require(path.join(sharedRoot, "db"));
const { validateId } = require(path.join(sharedRoot, "validation"));
const { syncList } = require(path.join(sharedRoot, "groceries"));
const { connectionHouseholds, createConnections } = require(path.join(sharedRoot, "bring-connections"));

const createWorker = (store, { env = process.env, ...options } = {}) => async function grocerySync() {
  // Credentials are read only by the Bring adapter; never log configuration or errors.
  const connections = createConnections(store, { env, ...options });
  const deadline = Date.now() + 180000;
  try {
    for await (const householdId of connectionHouseholds(store, env, deadline)) {
      if (Date.now() > deadline) return;
      try {
        validateId(householdId, "householdId");
        const { client, revision } = await connections.resolve(householdId);
        if (!client) continue;
        const { lists } = await store.getGroceries(householdId);
        for (const list of lists.filter((item) => item.remoteId)) {
          if (Date.now() > deadline) return;
          try { await syncList(store, householdId, list.id, client, revision); } catch (_) { /* Retry next poll. */ }
        }
      } catch (_) { /* A household outage must not interrupt other households. */ }
    }
  } catch (_) { /* Storage failure must not reactivate environment-only accounts. */ }
};
module.exports = createWorker(db);
module.exports.createWorker = createWorker;
