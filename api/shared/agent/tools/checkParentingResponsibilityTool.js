const { checkParentingResponsibility } = require("../../parentingTime");

module.exports = function createCheckParentingResponsibilityTool({ db, householdId, toClientError }) {
  return {
    definition: {
      name: "check_parenting_responsibility",
      description: [
        "Read whether an explicit parenting party has any responsibility during a time range in the current household.",
        "Uses the persisted parenting-time plan and one-off changes, not childcare coverage.",
        "The explicit party UUID is a development-only input; never infer a party from 'me', the signed-in user, or a name.",
        "Ask for the party UUID when missing. Unknown results are not evidence of no responsibility.",
        "This check is informational and must not block or mutate event creation or updates.",
      ].join(" "),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          partyId: { type: "string", description: "Explicit active parenting-party UUID in the current household." },
          startAt: { type: "string", description: "Inclusive ISO 8601 date-time with timezone." },
          endAt: { type: "string", description: "Exclusive ISO 8601 date-time with timezone; range at most 366 days." },
        },
        required: ["partyId", "startAt", "endAt"],
      },
    },
    async execute(args) {
      try {
        const data = await db.getParentingTime(householdId);
        return { ok: true, ...checkParentingResponsibility(data, args?.partyId, args?.startAt, args?.endAt) };
      } catch (error) {
        if (error.status === 400) throw toClientError(error.message);
        throw error;
      }
    },
  };
};
