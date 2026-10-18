const path = require("node:path");
const { existsSync } = require("node:fs");
const sharedRoot = existsSync(path.join(__dirname, "../shared/db/index.js"))
  ? path.join(__dirname, "../shared")
  : path.join(__dirname, "../../api/shared");
const db = require(path.join(sharedRoot, "db"));
const { validateId } = require(path.join(sharedRoot, "validation"));
const { syncList } = require(path.join(sharedRoot, "groceries"));
const { configuredHouseholds, createBringClient } = require(path.join(sharedRoot, "bring"));

module.exports = async function grocerySync() {
  // Credentials are read only by the Bring adapter; never log configuration or errors.
  const households = configuredHouseholds();
  const deadline = Date.now() + 180000;
  for (const householdId of households.slice(0, 100)) {
    if (Date.now() > deadline) return;
    try {
      validateId(householdId, "householdId");
      const client = createBringClient(householdId);
      if (!client) continue;
      const { lists } = await db.getGroceries(householdId);
      for (const list of lists.filter((item) => item.remoteId)) {
        if (Date.now() > deadline) return;
        try { await syncList(db, householdId, list.id, client); } catch (_) { /* Retry next poll. */ }
      }
    } catch (_) { /* A household outage must not interrupt other households. */ }
  }
};
