const Bring = require("bring-shopping");

const unavailable = () => new Error("Bring is unavailable; synchronization will retry later");

const bounded = async (operation, timeoutMs) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(unavailable()), timeoutMs);
      }),
    ]);
  } catch {
    // Provider errors can include account credentials or private item details.
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }
};

const readAccounts = (env) => {
  try {
    const accounts = JSON.parse(env.BRING_ACCOUNTS_JSON || "{}");
    if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) return {};
    return accounts;
  } catch {
    return {};
  }
};

const configuredHouseholds = (env = process.env) =>
  Object.entries(readAccounts(env))
    .filter(([id, account]) => /^[0-9a-f-]{36}$/i.test(id)
      && typeof account?.mail === "string" && account.mail.trim()
      && typeof account?.password === "string" && account.password)
    .map(([id]) => id);

// This is the only module that knows the third-party client's API.
const createBringClient = (householdId, { env = process.env, Client = Bring, timeoutMs = 15000 } = {}) => {
  const accounts = readAccounts(env);
  const account = Object.hasOwn(accounts, householdId) ? accounts[householdId] : null;
  return createClientFromCredentials(account, { Client, timeoutMs });
};

const createClientFromCredentials = (account, { Client = Bring, timeoutMs = 15000 } = {}) => {
  if (!account || typeof account.mail !== "string" || !account.mail.trim()
    || typeof account.password !== "string" || !account.password) return null;

  const client = new Client({ mail: account.mail, password: account.password });
  let login;
  const call = (operation) => {
    const deadline = Date.now() + timeoutMs;
    const ensureActive = () => { if (Date.now() >= deadline) throw unavailable(); };
    return bounded(async () => {
      if (!login) login = client.login().catch(() => { login = null; throw unavailable(); });
      await login;
      ensureActive();
      return operation(ensureActive);
    }, timeoutMs);
  };

  return {
    async listLists() {
      return call(async () => {
        const result = await client.loadLists();
        if (!Array.isArray(result?.lists) || result.lists.some((list) =>
          typeof list?.listUuid !== "string" || !list.listUuid || typeof list.name !== "string")) {
          throw unavailable();
        }
        return result.lists.map((list) => ({ id: list.listUuid, name: list.name }));
      });
    },
    async getItems(listId) {
      return call(async () => {
        const result = await client.getItems(listId);
        if (!Array.isArray(result?.purchase) || !Array.isArray(result?.recently)) throw unavailable();
        const items = new Map();
        for (const [entries, checked] of [[result.recently, true], [result.purchase, false]]) {
          for (const item of entries) {
            if (typeof item?.name !== "string" || !item.name.trim()
              || typeof item.specification !== "string") throw unavailable();
            items.set(item.name, { name: item.name, specification: item.specification, checked });
          }
        }
        return [...items.values()];
      });
    },
    async saveItem(listId, item) {
      return call(async (ensureActive) => {
        // The SDK interpolates form fields instead of encoding them.
        const name = encodeURIComponent(item.name);
        await client.saveItem(listId, name, encodeURIComponent(item.specification));
        ensureActive();
        if (item.checked) await client.moveToRecentList(listId, name);
      });
    },
    async removeItem(listId, name) {
      return call(() => client.removeItem(listId, encodeURIComponent(name)));
    },
  };
};

module.exports = { createBringClient, createClientFromCredentials, configuredHouseholds };
