const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const {
  assert, validateId, validateParty, validatePlan, validateChange, resolveParentingTime, getPlanStartTimestamp,
} = require("../shared/parentingTime");

module.exports = async function parentingTime(context, req) {
  try {
    const request = req ?? context.req;
    const userId = await getAuthenticatedUserId(request?.headers);
    if (!userId) {
      context.res = { status: 401, body: { error: "authentication required" } };
      return;
    }
    const householdId = validateId(request?.params?.householdId ?? context.bindingData?.householdId, "householdId");
    const resource = request?.params?.resource ?? context.bindingData?.resource;
    if (!await db.getParentingTimeHousehold(householdId, userId)) {
      context.res = { status: 404, body: { error: "household not found" } };
      return;
    }
    const method = request.method.toUpperCase();
    if (method === "GET" && (!resource || resource === "resolve")) {
      const data = await db.getParentingTime(householdId);
      context.res = {
        status: 200,
        body: resource === "resolve"
          ? { intervals: resolveParentingTime(data, request.query?.startAt, request.query?.endAt) }
          : data,
      };
      return;
    }
    const body = request.body;
    assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
    if (method === "POST" && resource === "parties") {
      context.res = { status: 201, body: await db.createParentingParty(householdId, validateParty(body)) };
      return;
    }
    if ((method === "POST" || method === "PUT") && resource === "plan") {
      const data = await db.getParentingTime(householdId);
      const plan = validatePlan(body, data.parties);
      assert(data.changes.every((change) => Date.parse(change.startAt) >= getPlanStartTimestamp(plan)),
        "effectiveFrom cannot be after an existing one-off change");
      context.res = { status: 200, body: await db.saveParentingPlan(householdId, plan) };
      return;
    }
    if ((method === "POST" || method === "PUT") && resource === "changes") {
      const data = await db.getParentingTime(householdId);
      assert(data.plan?.active, "an active parenting-time plan is required before adding one-off changes");
      const id = method === "PUT" ? validateId(body.id, "id") : undefined;
      const change = validateChange({ ...body, id }, data.parties, data.changes, id ?? null);
      assert(Date.parse(change.startAt) >= getPlanStartTimestamp(data.plan),
        "one-off changes cannot start before the plan's effectiveFrom date");
      change.planId = data.plan.id;
      context.res = {
        status: method === "POST" ? 201 : 200,
        body: method === "POST"
          ? await db.createParentingChange(householdId, change)
          : await db.updateParentingChange(householdId, id, change),
      };
      return;
    }
    context.res = { status: 405, body: { error: "method or parenting-time resource not supported" } };
  } catch (error) {
    context.log.error("parenting-time handler failed", error);
    context.res = {
      status: error.status || 500,
      body: { error: error.status === 400 ? error.message : "Internal server error" },
    };
  }
};
