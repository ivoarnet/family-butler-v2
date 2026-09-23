const db = require("../shared/db");
const { APP_ROLES, authenticateRequest, createHttpError } = require("../shared/auth");
const { getUserHouseholdContext } = require("../shared/user-households");

const asResponse = (contextData) => ({
  defaultHouseholdId: contextData.defaultHouseholdId,
  households: contextData.households,
  linkedMembers: contextData.linkedMembers,
});

module.exports = async function userSettings(context, req) {
  try {
    const currentUser = await authenticateRequest(req);
    const method = typeof req?.method === "string" ? req.method.toUpperCase() : "";

    if (method === "GET") {
      const settings = await getUserHouseholdContext(currentUser);
      context.res = {
        status: 200,
        body: asResponse(settings),
      };
      return;
    }

    if (method === "PUT") {
      if (currentUser.role === APP_ROLES.demouser) {
        throw createHttpError(403, "Forbidden");
      }

      const defaultHouseholdId = typeof req.body?.defaultHouseholdId === "string" ? req.body.defaultHouseholdId.trim() : "";
      if (!defaultHouseholdId) {
        throw createHttpError(400, "defaultHouseholdId is required");
      }

      const settings = await getUserHouseholdContext(currentUser);
      const canUse = settings.households.some((household) => household.id === defaultHouseholdId);
      if (!canUse) {
        throw createHttpError(403, "Forbidden");
      }

      await db.setUserDefaultHousehold(currentUser.id, defaultHouseholdId);
      const refreshed = await getUserHouseholdContext(currentUser);

      context.res = {
        status: 200,
        body: asResponse(refreshed),
      };
      return;
    }

    context.res = {
      status: 405,
      body: { error: "method not allowed" },
    };
  } catch (error) {
    context.log.error("user-settings handler failed", error);
    context.res = {
      status: typeof error?.status === "number" ? error.status : 500,
      body: { error: error instanceof Error ? error.message : "Internal server error" },
    };
  }
};
