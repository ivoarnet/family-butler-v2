const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const {
  assert, validateId, validateProvider, validateArrangement, validateOverride, resolveOccurrences,
} = require("../shared/childcare");

module.exports = async function childcare(context, req) {
  try {
    const request = req ?? context.req;
    const userId = await getAuthenticatedUserId(request?.headers);
    if (!userId) {
      context.res = { status: 401, body: { error: "authentication required" } };
      return;
    }
    const householdId = validateId(request?.params?.householdId ?? context.bindingData?.householdId, "householdId");
    const resource = request?.params?.resource ?? context.bindingData?.resource;
    const household = await db.getChildcareHousehold(householdId, userId);
    if (!household) {
      context.res = { status: 404, body: { error: "household not found" } };
      return;
    }
    const method = request.method.toUpperCase();
    if (method === "GET" && (!resource || resource === "occurrences")) {
      const data = await db.getChildcare(householdId);
      context.res = {
        status: 200,
        body: resource === "occurrences"
          ? { occurrences: resolveOccurrences(data, request.query?.startDate, request.query?.endDate) }
          : data,
      };
      return;
    }
    if ((method === "POST" && ["providers", "arrangements"].includes(resource))
      || (method === "PUT" && resource === "overrides")) {
      const body = request.body;
      assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
      let result;
      if (resource === "providers") {
        result = await db.createChildcareProvider(householdId, validateProvider(body));
      } else {
        const data = await db.getChildcare(householdId);
        result = resource === "arrangements"
          ? await db.createChildcareArrangement(householdId, validateArrangement(body, data.providers, household.memberIds))
          : await db.saveChildcareOverride(householdId, validateOverride(body, data.arrangements, data.providers));
      }
      context.res = { status: method === "POST" ? 201 : 200, body: result };
      return;
    }
    context.res = { status: 405, body: { error: "method or childcare resource not supported" } };
  } catch (error) {
    context.log.error("childcare handler failed", error);
    context.res = {
      status: error.status || 500,
      body: { error: error.status === 400 ? error.message : "Internal server error" },
    };
  }
};
