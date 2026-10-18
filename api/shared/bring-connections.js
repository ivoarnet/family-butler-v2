const { configuredHouseholds, createBringClient, createClientFromCredentials } = require("./bring");
const { readKey, encryptCredentials, decryptCredentials, validateCredentials } = require("./bring-credentials");
const { listBringLists } = require("./groceries");

const createConnections = (store, {
  env = process.env, createEnvironmentClient = createBringClient,
  createCredentialClient = createClientFromCredentials,
} = {}) => {
  const metadata = async (householdId) => store.getBringConnectionMetadata
    ? await store.getBringConnectionMetadata(householdId) : null;
  const status = async (householdId) => {
    const row = await metadata(householdId);
    const source = row ? (row.enabled ? "stored" : null)
      : configuredHouseholds(env).includes(householdId) ? "environment" : null;
    return { configured: source !== null, source, canConfigure: Boolean(readKey(env)) };
  };
  const resolve = async (householdId) => {
    // A storage outage never falls back to a potentially disconnected environment account.
    const row = store.getBringConnection ? await store.getBringConnection(householdId) : null;
    const revision = row?.revision ?? 0;
    if (row) return { revision, client: row.enabled
      ? createCredentialClient(decryptCredentials(householdId, row, env)) : null };
    return { revision, client: createEnvironmentClient(householdId, { env }) };
  };
  const save = async (householdId, input) => {
    const credentials = validateCredentials(input);
    const encrypted = encryptCredentials(householdId, credentials, env);
    const before = await metadata(householdId);
    const client = createCredentialClient(credentials);
    if (!await listBringLists(client)) throw new Error("unavailable");
    await store.saveBringConnection(householdId, encrypted, before?.revision ?? 0);
    return { configured: true, source: "stored", canConfigure: Boolean(readKey(env)) };
  };
  const disconnect = async (householdId) => {
    if (!readKey(env)) throw new Error("unavailable");
    const before = await metadata(householdId);
    await store.disconnectBringConnection(householdId, before?.revision ?? 0);
    return { configured: false, source: null, canConfigure: Boolean(readKey(env)) };
  };
  return { status, resolve, save, disconnect };
};

// Keyset pagination bounds every database response; the worker supplies its time budget.
async function* connectionHouseholds(store, env = process.env, deadline = Infinity) {
  const seen = new Set();
  let after = null;
  for (let page = 0; page < 100; page++) {
    if (Date.now() > deadline) return;
    const rows = await store.listBringConnections(after, 100);
    if (!Array.isArray(rows) || rows.length > 100) throw new Error("unavailable");
    for (const row of rows) {
      if (typeof row.household_id !== "string" || (after && row.household_id <= after)) throw new Error("unavailable");
      after = row.household_id;
      seen.add(after);
      if (row.enabled) yield after;
    }
    if (rows.length < 100) {
      for (const id of configuredHouseholds(env)) if (!seen.has(id)) yield id;
      return;
    }
  }
}

module.exports = { createConnections, connectionHouseholds };
