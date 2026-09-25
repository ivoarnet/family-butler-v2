const { EVENT_MODEL_DESCRIPTION, cleanString, isIsoDate, toEventTypesContext, toEventOutput } = require("./eventModel");

const normalizeForSearch = (value) => cleanString(value).toLowerCase();

module.exports = function createGetEventsTool({ householdState, toClientError }) {
  return {
    definition: {
      name: "get_events",
      description: [
        "Read household events and available event types.",
        "Use this for event lookups, schedule questions, and before choosing an event to update.",
        "Always keep available event types in context when handling event requests.",
        EVENT_MODEL_DESCRIPTION,
        toEventTypesContext(householdState.eventTypes),
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          fromDate: { type: "string" },
          toDate: { type: "string" },
          memberId: { type: "string" },
          eventTypeId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
    async execute(args) {
      const events = Array.isArray(householdState.events) ? householdState.events : [];
      const members = Array.isArray(householdState.members) ? householdState.members : [];
      const eventTypes = Array.isArray(householdState.eventTypes) ? householdState.eventTypes : [];

      const memberById = new Map(members.map((member) => [member.id, member]));
      const eventTypeById = new Map(eventTypes.map((eventType) => [eventType.id, eventType]));

      const query = normalizeForSearch(args?.query);
      const fromDate = cleanString(args?.fromDate);
      const toDate = cleanString(args?.toDate);
      const memberId = cleanString(args?.memberId);
      const eventTypeId = cleanString(args?.eventTypeId);
      const limit = Number.isInteger(args?.limit) ? args.limit : 50;

      if (fromDate && !isIsoDate(fromDate)) {
        throw toClientError("fromDate must use YYYY-MM-DD");
      }
      if (toDate && !isIsoDate(toDate)) {
        throw toClientError("toDate must use YYYY-MM-DD");
      }
      if (fromDate && toDate && toDate < fromDate) {
        throw toClientError("toDate must be on or after fromDate");
      }

      const filtered = events
        .filter((event) => {
          if (fromDate && event.date < fromDate) {
            return false;
          }
          if (toDate && event.date > toDate) {
            return false;
          }
          if (memberId && !event.memberIds.includes(memberId)) {
            return false;
          }
          if (eventTypeId && event.eventTypeId !== eventTypeId) {
            return false;
          }
          if (!query) {
            return true;
          }

          const memberLabels = event.memberIds
            .map((id) => memberById.get(id))
            .filter(Boolean)
            .map((member) => member.firstName)
            .join(" ");
          const eventTypeName = event.eventTypeId ? eventTypeById.get(event.eventTypeId)?.name ?? "" : "";
          const searchable = normalizeForSearch([
            event.title,
            event.location,
            event.notes,
            memberLabels,
            eventTypeName,
          ].filter(Boolean).join(" "));
          return searchable.includes(query);
        })
        .slice()
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) {
            return dateCompare;
          }
          const aStart = a.startTime ?? "99:99";
          const bStart = b.startTime ?? "99:99";
          return aStart.localeCompare(bStart);
        })
        .slice(0, limit)
        .map((event) => ({
          ...toEventOutput(event),
          memberNames: event.memberIds
            .map((id) => memberById.get(id)?.firstName)
            .filter(Boolean),
          eventType: event.eventTypeId
            ? {
                id: event.eventTypeId,
                name: eventTypeById.get(event.eventTypeId)?.name ?? null,
              }
            : null,
        }));

      return {
        ok: true,
        count: filtered.length,
        events: filtered,
        availableEventTypes: eventTypes
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((eventType) => ({
            id: eventType.id,
            name: eventType.name,
            icon: eventType.icon ?? null,
            color: eventType.color ?? null,
            sortOrder: eventType.sortOrder,
          })),
      };
    },
  };
};
