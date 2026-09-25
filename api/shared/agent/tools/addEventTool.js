const { randomUUID } = require("crypto");
const {
  EVENT_MODEL_DESCRIPTION,
  cleanString,
  normalizeTime24Hour,
  isIsoDate,
  isFiveMinuteStepTime,
  toEventTypesContext,
  toEventMembersContext,
  toAvailableMembers,
  toEventOutput,
} = require("./eventModel");

const toNormalizedTokens = (value) =>
  cleanString(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3);

const resolveEventTypeId = ({ eventTypeId, eventTypeHint, title, eventTypes }) => {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    return null;
  }

  const requestedId = cleanString(eventTypeId);
  if (requestedId) {
    return eventTypes.some((eventType) => eventType.id === requestedId) ? requestedId : "__invalid__";
  }

  const hint = cleanString(eventTypeHint);
  const exact = eventTypes.find((eventType) => cleanString(eventType.name).toLowerCase() === hint.toLowerCase());
  if (exact) {
    return exact.id;
  }

  const hintTokens = new Set(toNormalizedTokens([hint, title].join(" ")));
  let bestMatch = null;

  for (const eventType of eventTypes) {
    const name = cleanString(eventType.name);
    if (!name) {
      continue;
    }

    const normalizedName = name.toLowerCase();
    let score = 0;
    if (hint && (hint.toLowerCase().includes(normalizedName) || normalizedName.includes(hint.toLowerCase()))) {
      score += 20;
    }

    for (const token of toNormalizedTokens(name)) {
      if (hintTokens.has(token)) {
        score += 3;
      }
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: eventType.id, score };
    }
  }

  return bestMatch && bestMatch.score > 0 ? bestMatch.id : null;
};

module.exports = function createAddEventTool({ db, householdId, householdState, toClientError }) {
  return {
    definition: {
      name: "add_event",
      description: [
        "Add a new event to the current household.",
        "Always choose a fitting event type when possible using available event types.",
        "Before persisting, call with confirmAdd=false (or omitted) to show a preview card payload, then call again with confirmAdd=true after explicit user confirmation.",
        EVENT_MODEL_DESCRIPTION,
        toEventMembersContext(householdState.members),
        toEventTypesContext(householdState.eventTypes),
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          confirmAdd: { type: "boolean" },
          event: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              date: { type: "string" },
              memberIds: { type: "array", minItems: 1, items: { type: "string" } },
              allDay: { type: "boolean" },
              startTime: { type: ["string", "null"] },
              endTime: { type: ["string", "null"] },
              eventTypeId: { type: ["string", "null"] },
              eventTypeHint: { type: ["string", "null"] },
              repeatRule: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
            },
            required: ["title", "date", "memberIds"],
          },
        },
        required: ["event"],
      },
    },
    async execute(args) {
      const confirmAdd = args?.confirmAdd === true;
      const input = args?.event;
      if (!input || typeof input !== "object") {
        throw toClientError("event is required");
      }

      const title = cleanString(input.title);
      if (!title) {
        throw toClientError("event title is required");
      }

      const date = cleanString(input.date);
      if (!date || !isIsoDate(date)) {
        throw toClientError("event date must use YYYY-MM-DD");
      }

      const memberIds = Array.isArray(input.memberIds) ? [...new Set(input.memberIds.map((id) => cleanString(id)).filter(Boolean))] : [];
      if (memberIds.length === 0) {
        throw toClientError("event memberIds are required");
      }

      const members = Array.isArray(householdState.members) ? householdState.members : [];
      const memberById = new Map(members.map((member) => [member.id, member]));
      for (const memberId of memberIds) {
        if (!memberById.has(memberId)) {
          throw toClientError(`event member id is not part of this household: ${memberId}`);
        }
      }

      const allDay = input.allDay !== false;
      const startTime = normalizeTime24Hour(input.startTime);
      const endTime = normalizeTime24Hour(input.endTime);

      if (!allDay && (!startTime || !endTime)) {
        throw toClientError("event startTime and endTime are required for non all-day events");
      }
      if (!allDay && startTime && endTime && (!isFiveMinuteStepTime(startTime) || !isFiveMinuteStepTime(endTime))) {
        throw toClientError("event startTime and endTime must use 5-minute steps");
      }
      if (!allDay && startTime && endTime && startTime >= endTime) {
        throw toClientError("event time range is invalid");
      }

      const eventTypes = Array.isArray(householdState.eventTypes) ? householdState.eventTypes : [];
      const resolvedEventTypeId = resolveEventTypeId({
        eventTypeId: input.eventTypeId,
        eventTypeHint: input.eventTypeHint,
        title,
        eventTypes,
      });
      if (resolvedEventTypeId === "__invalid__") {
        throw toClientError("eventTypeId is not part of this household");
      }

      const event = {
        id: cleanString(input.id) || randomUUID(),
        title,
        date,
        memberIds,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        eventTypeId: resolvedEventTypeId,
        repeatRule: cleanString(input.repeatRule) || null,
        location: cleanString(input.location) || null,
        notes: cleanString(input.notes) || null,
      };

      const eventType = event.eventTypeId ? eventTypes.find((candidate) => candidate.id === event.eventTypeId) ?? null : null;
      const previewCard = {
        ...toEventOutput(event),
        eventType: eventType
          ? {
              id: eventType.id,
              name: eventType.name,
              icon: eventType.icon ?? null,
              color: eventType.color ?? null,
            }
          : null,
        memberNames: event.memberIds.map((id) => memberById.get(id)?.firstName).filter(Boolean),
      };

      if (!confirmAdd) {
        return {
          ok: false,
          confirmationRequired: true,
          reason: "confirm_before_add",
          previewCard,
          availableMembers: toAvailableMembers(members),
          availableEventTypes: eventTypes.map((eventType) => ({
            id: eventType.id,
            name: eventType.name,
            icon: eventType.icon ?? null,
            color: eventType.color ?? null,
            sortOrder: eventType.sortOrder,
          })),
          message:
            "Preview the event card with the user before saving. If approved, call add_event again with the same event payload and confirmAdd=true.",
        };
      }

      const existingEvents = Array.isArray(householdState.events) ? householdState.events : [];
      const updatedEvents = [...existingEvents, event];
      await db.replaceEvents(householdId, updatedEvents);
      householdState.events = updatedEvents;

      return {
        ok: true,
        event: previewCard,
        availableMembers: toAvailableMembers(members),
        message: `Event ${event.title} has been added.`,
      };
    },
  };
};
