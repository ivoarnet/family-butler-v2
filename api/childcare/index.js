const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");
const {
  assert, validateId, validateProvider, validateArrangement, validateOverride, resolveOccurrences, isScheduled,
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
          ? {
            occurrences: resolveOccurrences(data, request.query?.startDate, request.query?.endDate).map((occurrence) => ({
              ...occurrence,
              providerName: data.providers.find((provider) => provider.id === occurrence.providerId)?.name ?? null,
            })),
          }
          : data,
      };
      return;
    }
    if ((method === "POST" && ["providers", "arrangements", "preview"].includes(resource))
      || (method === "PUT" && ["providers", "arrangements", "overrides"].includes(resource))) {
      const body = request.body;
      assert(body && typeof body === "object" && !Array.isArray(body), "JSON object body is required");
      let result;
      if (resource === "providers") {
        const provider = validateProvider(body);
        result = method === "PUT"
          ? await db.updateChildcareProvider(householdId, validateId(body.id, "id"), provider)
          : await db.createChildcareProvider(householdId, provider);
      } else {
        const data = await db.getChildcare(householdId);
        if (resource === "overrides") {
          result = await db.saveChildcareOverride(householdId,
            validateOverride(body, data.arrangements, data.providers, data.overrides));
        } else {
          const draft = resource === "preview" ? body.arrangement : body;
          assert(draft && typeof draft === "object" && !Array.isArray(draft), "arrangement object is required");
          const arrangement = validateArrangement(draft, data.providers, household.memberIds);
          const id = method === "PUT" || (resource === "preview" && draft.id != null)
            ? validateId(draft.id, "id") : null;
          if (id) {
            assert(data.arrangements.some((item) => item.id === id), "arrangement is not part of this household");
            const currentArrangement = data.arrangements.find((item) => item.id === id);
            assert(data.overrides.filter((item) => item.arrangementId === id && item.action !== "add"
              && !(item.action === "cancel" && !isScheduled(currentArrangement, item.originalDate)))
              .every((item) => isScheduled(arrangement, item.originalDate)),
            "schedule change would remove an occurrence with a one-off change; keep its weekday and effective dates");
          }
          if (resource === "preview") {
            result = { occurrences: resolveOccurrences({
              arrangements: [{ ...arrangement, id: id ?? "preview", householdId }],
              overrides: id ? data.overrides.filter((item) => item.arrangementId === id) : [],
            }, body.startDate, body.endDate) };
          } else {
            result = method === "PUT"
              ? await db.updateChildcareArrangement(householdId, id, arrangement)
              : await db.createChildcareArrangement(householdId, arrangement);
          }
        }
      }
      context.res = { status: method === "POST" && resource !== "preview" ? 201 : 200, body: result };
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
