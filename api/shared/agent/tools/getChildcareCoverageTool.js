const { resolveOccurrences } = require("../../childcare");

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

module.exports = function createGetChildcareCoverageTool({ db, householdId, householdState, toClientError }) {
  return {
    definition: {
      name: "get_childcare_coverage",
      description: [
        "Read effective, persisted childcare coverage for the current household and a requested date range.",
        "Use this whenever users ask who is caring for which children, when care starts or ends, or about changed care dates/providers.",
        "Cancelled occurrences are excluded. Moves and replacements include their original date and change action.",
        "This tool reports scheduled care only and does not infer parenting-time responsibility or availability.",
      ].join(" "),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          fromDate: { type: "string", description: "Inclusive start date in YYYY-MM-DD format." },
          toDate: { type: "string", description: "Inclusive end date in YYYY-MM-DD format." },
        },
        required: ["fromDate", "toDate"],
      },
    },
    async execute(args) {
      const fromDate = cleanString(args?.fromDate);
      const toDate = cleanString(args?.toDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        throw toClientError("fromDate and toDate must use YYYY-MM-DD");
      }

      let occurrences;
      try {
        const data = await db.getChildcare(householdId);
        occurrences = resolveOccurrences(data, fromDate, toDate);
        const providersById = new Map(data.providers.map((provider) => [provider.id, provider]));
        const membersById = new Map((householdState.members ?? []).map((member) => [member.id, member]));
        occurrences = occurrences.map((occurrence) => ({
          id: occurrence.id,
          date: occurrence.date,
          originalDate: occurrence.originalDate,
          change: occurrence.overrideAction,
          provider: providersById.get(occurrence.providerId)?.name ?? null,
          providerId: occurrence.providerId,
          children: occurrence.childIds.map((id) => ({
            id,
            name: membersById.get(id)?.firstName ?? null,
          })),
          allDay: occurrence.allDay,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
        }));
      } catch (error) {
        if (error.status === 400) {
          throw toClientError(error.message);
        }
        throw error;
      }

      return {
        ok: true,
        fromDate,
        toDate,
        count: occurrences.length,
        occurrences,
      };
    },
  };
};
