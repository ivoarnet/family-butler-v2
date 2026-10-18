const { assert, validateId } = require("./validation");
const { validIconId, validImageUrl } = require("./bring-metadata");

const MAX_ITEMS = 200;
const MAX_SYNC_ITEMS = 2000;
const key = (name) => name.trim().toLowerCase();
const text = (value, field, max, allowEmpty = false) => {
  assert(typeof value === "string" && value.trim().length <= max
    && (allowEmpty || value.trim().length > 0) && !/[\u0000-\u001f]/.test(value), `${field} is invalid`);
  return value.trim();
};
const validateMutation = (resource, method, input) => {
  assert(input && typeof input === "object" && !Array.isArray(input), "JSON object body is required");
  const data = {};
  if (method !== "POST" || input.id !== undefined) data.id = validateId(input.id, "id");
  if (input.revision !== undefined) {
    assert(Number.isSafeInteger(input.revision) && input.revision >= 0, "revision is invalid");
    data.revision = input.revision;
  }
  if (resource === "lists" && method === "DELETE") return data;
  if (resource === "items") {
    data.listId = validateId(input.listId, "listId");
    if (method === "POST" || input.name !== undefined) data.name = text(input.name, "name", 160);
    if (input.specification !== undefined) data.specification = text(input.specification, "specification", 500, true);
    if (input.checked !== undefined) {
      assert(typeof input.checked === "boolean", "checked must be a boolean");
      data.checked = input.checked;
    }
  } else {
    if (method === "POST" || input.name !== undefined) data.name = text(input.name, "name", 160);
    if (input.remoteId !== undefined) data.remoteId = input.remoteId === null ? null : text(input.remoteId, "remoteId", 200);
    assert(method !== "POST" || input.remoteId === undefined, "link an existing list after creating it");
  }
  return data;
};

// A malformed or over-limit response must never become an authoritative empty snapshot.
const validateRemoteItems = (items, maxItems = MAX_ITEMS) => {
  if (!Array.isArray(items) || items.length > maxItems) throw new Error("unavailable");
  return items.map((item) => {
    if (!item || typeof item.checked !== "boolean" || typeof item.specification !== "string") throw new Error("unavailable");
    const name = text(item.name, "name", 160);
    if (name !== item.name) throw new Error("unavailable");
    text(item.specification, "specification", 500, true);
    if (item.specification.length > 500) throw new Error("unavailable");
    return {
      name,
      specification: item.specification,
      checked: item.checked,
      ...(item.iconId === null || validIconId(item.iconId) ? { iconId: item.iconId } : {}),
      ...(item.imageUrl === null || validImageUrl(item.imageUrl) ? { imageUrl: item.imageUrl } : {}),
    };
  });
};
const listBringLists = async (client) => {
  if (!client) return null;
  try {
    const lists = await client.listLists();
    if (!Array.isArray(lists) || lists.length > 200) throw new Error("unavailable");
    return lists.map((list) => ({
      id: text(list?.id, "id", 200),
      name: text(list?.name, "name", 160),
    }));
  } catch (_) { throw new Error("unavailable"); }
};

const syncList = async (db, householdId, listId, client, connectionRevision) => {
  if (!client) return { syncStatus: "unavailable" };
  let lease;
  try {
    const state = await db.acquireGrocerySync(householdId, listId, connectionRevision);
    if (!state.lease) return { syncStatus: state.syncStatus || "local" };
    lease = state.lease;
    const deadline = Date.now() + 100000;
    const run = async (operation) => {
      if (Date.now() > deadline) throw new Error("unavailable");
      await db.renewGrocerySync(householdId, lease);
      if (Date.now() > deadline) throw new Error("unavailable");
      return operation();
    };
    // Validate account membership even for old links, before touching remote data.
    const lists = await run(() => listBringLists(client));
    if (!lists.some((list) => list.id === state.remoteId)) throw new Error("unavailable");
    if (!Array.isArray(state.items) || state.items.length > MAX_SYNC_ITEMS) throw new Error("unavailable");
    const initial = validateRemoteItems(await run(() => client.getItems(state.remoteId)), MAX_SYNC_ITEMS + MAX_ITEMS);
    const remoteByName = new Map(initial.map((item) => [item.name, item]));
    const liveNames = new Set(state.items.filter((item) => !item.deleted).map((item) => item.name));
    const matches = (item) => {
      const remote = remoteByName.get(item.name);
      return remote && remote.checked === item.checked
        && (item.checked || remote.specification === item.specification);
    };
    const pending = state.items.filter((item) => item.pending);
    const removals = new Set(pending.flatMap((item) => [
      ...(item.removeNames || []), ...(item.deleted ? [item.name] : []),
    ]));
    // Read-before-write makes progress durable remotely even if the time budget
    // expires before acknowledgement. Retried batches skip already completed work.
    // A current live identity is updated by save, never deleted as an old name.
    for (const name of removals) {
      if (remoteByName.has(name) && !liveNames.has(name)) {
        await run(() => client.removeItem(state.remoteId, name));
      }
    }
    for (const item of state.items) {
      if (!item.deleted && (item.pending || [...removals].some((name) => key(name) === key(item.name))) && !matches(item)) {
        await run(() => client.saveItem(state.remoteId, {
          name: item.name, specification: item.specification, checked: item.checked,
        }));
      }
    }
    const remoteItems = validateRemoteItems(await run(() => client.getItems(state.remoteId)));
    await db.renewGrocerySync(householdId, lease);
    return await db.finishGrocerySync(householdId, lease, remoteItems);
  } catch (error) {
    if (lease) {
      try { await db.releaseGrocerySync(householdId, lease); } catch (_) { /* A newer lease owns recovery. */ }
    }
    if (error.status === 404 || error.status === 409) throw error;
    return { syncStatus: "unavailable" };
  }
};

module.exports = { validateMutation, validateRemoteItems, listBringLists, syncList, MAX_ITEMS };
