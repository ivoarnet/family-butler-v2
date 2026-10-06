const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const {
  assert, validateId, validateParty, validatePlan, validateHandovers, compileHandovers,
  validateChange, resolveParentingTime, getPlanStartTimestamp, getPlanEndTimestamp,
  resolvePersistedParentingTime, checkParentingResponsibility,
} = require("../shared/parentingTime");

const validatedPlan = (body, parties) => {
  if (Array.isArray(body.handovers) && body.handovers.length > 0) {
    const handovers = validateHandovers(body.handovers, parties);
    const plan = validatePlan({ ...body, recurrenceMode: "alternating", rules: compileHandovers(handovers) }, parties);
    return { ...plan, handovers };
  }
  return validatePlan(body, parties);
};

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
    const household = await db.getParentingTimeHousehold(householdId, userId);
    if (!household) {
      context.res = { status: 404, body: { error: "household not found" } };
      return;
    }
    const method = request.method.toUpperCase();
    if (method === "GET" && (!resource || resource === "resolve")) {
      const data = await db.getParentingTime(householdId);
      context.res = {
        status: 200,
        body: resource === "resolve"
          ? resolvePersistedParentingTime(data, request.query?.startAt, request.query?.endAt, { allowPartial: true })
          : data,
      };
      return;
    }
    const body = request.body;
    if (method === "POST" && resource === "check") {
      assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
      const data = await db.getParentingTime(householdId);
      context.res = { status: 200, body: checkParentingResponsibility(data, body.partyId, body.startAt, body.endAt) };
      return;
    }
    if (method === "POST" && resource === "preview") {
      assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
      const data = await db.getParentingTime(householdId);
      const plan = validatedPlan(body.plan, data.parties);
      context.res = {
        status: 200,
        body: { intervals: resolveParentingTime({ plan: { ...plan, id: null, active: true }, parties: data.parties, changes: data.changes },
          body.startAt, body.endAt) },
      };
      return;
    }
    if (method === "DELETE" && resource === "changes") {
      const id = validateId(request.query?.id ?? body?.id, "id");
      await db.deleteParentingChange(householdId, id);
      context.res = { status: 204 };
      return;
    }
    assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
    if ((method === "POST" || method === "PUT") && resource === "parties") {
      const partyId = method === "PUT" ? validateId(body.id, "id") : null;
      assert(body.active === undefined || typeof body.active === "boolean", "active must be a boolean");
      const party = validateParty(body, household.memberIds);
      context.res = {
        status: method === "POST" ? 201 : 200,
        body: method === "POST"
          ? await db.createParentingParty(householdId, party)
          : await db.updateParentingParty(householdId, partyId, { ...party, active: body.active !== false }),
      };
      return;
    }
    if ((method === "POST" || method === "PUT") && resource === "plan") {
      const data = await db.getParentingTime(householdId);
      const plan = validatedPlan(body, data.parties);
      const planEnd = getPlanEndTimestamp(plan);
      assert(data.changes.every((change) => Date.parse(change.startAt) >= getPlanStartTimestamp(plan)
        && (planEnd === null || Date.parse(change.endAt) <= planEnd)),
      "plan effective dates must include all existing one-off changes");
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
      const planEnd = getPlanEndTimestamp(data.plan);
      assert(planEnd === null || Date.parse(change.endAt) <= planEnd,
        "one-off changes cannot end after the plan's effectiveTo date");
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
