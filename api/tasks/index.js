const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const { validateId } = require("../shared/validation");
const { validateMutation, validateFilters } = require("../shared/tasks");

const createHandler = (store, authenticate) => async (context, req) => {
  try {
    const request = req ?? context.req;
    const userId = await authenticate(request?.headers);
    if (!userId) {
      context.res = { status: 401, body: { error: "authentication required" } };
      return;
    }
    const householdId = validateId(request?.params?.householdId ?? context.bindingData?.householdId, "householdId");
    if (!await store.getTasksHousehold(householdId, userId)) {
      context.res = { status: 404, body: { error: "household not found" } };
      return;
    }
    const resource = request?.params?.resource ?? context.bindingData?.resource;
    const method = request?.method?.toUpperCase();
    let body;
    let status = 200;
    if (method === "GET" && !resource) {
      body = await store.getTasks(householdId, userId, validateFilters(request.query ?? {}));
    } else {
      const action = resource === "move" && method === "POST" ? "move"
        : !resource ? { POST: "create", PUT: "update", DELETE: "delete" }[method] : null;
      if (!action) {
        context.res = { status: 405, body: { error: "method or task resource not supported" } };
        return;
      }
      body = await store.mutateTasks(householdId, userId, action, validateMutation(action, request.body));
      status = action === "create" ? 201 : 200;
    }
    context.res = { status, body };
  } catch (error) {
    const status = [400, 404, 409].includes(error.status) ? error.status : 500;
    context.res = { status, body: { error: status === 400 ? "invalid task request"
      : status === 404 ? "not found" : status === 409 ? "conflict; refresh and retry" : "unavailable" } };
  }
};

module.exports = createHandler(db, getAuthenticatedUserId);
module.exports.createHandler = createHandler;
