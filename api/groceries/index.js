const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const { assert, validateId } = require("../shared/validation");
const { validateMutation, listBringLists, syncList } = require("../shared/groceries");
const { createConnections } = require("../shared/bring-connections");

// Factories make the same auth and synchronization paths independently testable.
const createHandler = (store, authenticate, createClient, options = {}) => async (context, req) => {
  let connectionRequest = false;
  try {
    const request = req ?? context.req;
    const userId = await authenticate(request?.headers);
    if (!userId) {
      context.res = { status: 401, body: { error: "authentication required" } };
      return;
    }
    const householdId = validateId(request?.params?.householdId ?? context.bindingData?.householdId, "householdId");
    if (!await store.getChildcareHousehold(householdId, userId)) {
      context.res = { status: 404, body: { error: "household not found" } };
      return;
    }
    const resource = request?.params?.resource ?? context.bindingData?.resource;
    connectionRequest = resource === "connection" || resource === "connection-test";
    const method = request.method.toUpperCase();
    const connections = createConnections(store, {
      ...options, ...(createClient ? { createEnvironmentClient: createClient } : {}),
    });
    const client = async () => {
      try { return await connections.resolve(householdId); } catch (_) { return { client: null }; }
    };
    let body;
    let status = 200;
    if (method === "GET" && !resource) {
      let bringConfigured = false;
      try { bringConfigured = (await connections.status(householdId)).configured; } catch (_) { /* Local reads remain available. */ }
      body = { ...await store.getGroceries(householdId), bringConfigured };
    } else if (resource === "connection" && method === "GET") {
      body = await connections.status(householdId);
    } else if (resource === "connection" && method === "PUT") {
      body = await connections.save(householdId, request.body);
    } else if (resource === "connection" && method === "DELETE") {
      body = await connections.disconnect(householdId);
    } else if (resource === "connection-test" && method === "POST") {
      assert(request.body == null || (typeof request.body === "object" && !Array.isArray(request.body)
        && Object.keys(request.body).length === 0), "body must be empty");
      const current = await connections.resolve(householdId);
      if (!await listBringLists(current.client)) throw new Error("unavailable");
      body = { connected: true };
    } else if (method === "GET" && resource === "bring-lists") {
      try {
        const lists = await listBringLists((await client()).client);
        if (!lists) throw new Error("unavailable");
        body = { lists };
      } catch (_) {
        context.res = { status: 503, body: { error: "unavailable" } };
        return;
      }
    } else if (method === "POST" && resource === "sync") {
      const listId = validateId(request.body?.listId, "listId");
      // Check local ownership/existence even when Bring is not configured.
      const data = await store.getGroceries(householdId);
      assert(data.lists.some((list) => list.id === listId), "list is not part of this household");
      const current = await client();
      body = await syncList(store, householdId, listId, current.client, current.revision);
    } else if ((resource === "lists" && ["POST", "PUT"].includes(method))
      || (resource === "items" && ["POST", "PUT", "DELETE"].includes(method))) {
      const data = validateMutation(resource, method, request.body);
      if (resource === "lists" && data.remoteId != null) {
        try {
          const current = await client();
          const lists = await listBringLists(current.client);
          if (!lists) throw new Error("unavailable");
          assert(lists.some((list) => list.id === data.remoteId), "remote list is not available for this household");
          data.connectionRevision = current.revision;
        } catch (error) {
          if (error.status === 400) throw error;
          context.res = { status: 503, body: { error: "unavailable" } };
          return;
        }
      }
      body = await store.mutateGroceries(householdId, `${resource}_${method.toLowerCase()}`, data);
      status = method === "POST" ? 201 : 200;
    } else {
      context.res = { status: 405, body: { error: "method or grocery resource not supported" } };
      return;
    }
    context.res = { status, body };
  } catch (error) {
    const status = [400, 404, 409].includes(error.status) ? error.status : connectionRequest ? 503 : 500;
    context.res = {
      status,
      body: { error: status === 400 ? (connectionRequest ? "invalid connection request" : error.message)
        : status === 409 ? "conflict; refresh and retry" : status === 404 ? "not found" : "unavailable" },
    };
  }
};

module.exports = createHandler(db, getAuthenticatedUserId);
module.exports.createHandler = createHandler;
