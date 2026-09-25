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

const normalizeForMatch = (value) => cleanString(value).toLowerCase();

const resolveEventTypeId = ({ requestedEventTypeId, requestedEventTypeHint, availableEventTypes, fallbackEventTypeId }) => {
  const eventTypeId = cleanString(requestedEventTypeId);
  if (eventTypeId) {
    const match = availableEventTypes.find((eventType) => eventType.id === eventTypeId);
    return match ? match.id : "__invalid__";
  }

  const hint = normalizeForMatch(requestedEventTypeHint);
  if (hint) {
    const exact = availableEventTypes.find((eventType) => normalizeForMatch(eventType.name) === hint);
    if (exact) {
      return exact.id;
    }

    const partial = availableEventTypes.find((eventType) => normalizeForMatch(eventType.name).includes(hint) || hint.includes(normalizeForMatch(eventType.name)));
    if (partial) {
      return partial.id;
    }
  }

  return fallbackEventTypeId ?? null;
};

module.exports = function createUpdateEventDetailsTool({ db, householdId, householdState, toClientError }) {
  return {
    definition: {
      name: "update_event_details",
      description: [
        "Update additional information on an existing household event (for example location, notes, time, or event type).",
        "Find the event by eventId when possible; otherwise eventTitle (+ optional date) can be used.",
        "Before persisting, call with confirmUpdate=false (or omitted) to show a before/after preview, then call again with confirmUpdate=true after explicit confirmation.",
        "Always keep available event types in context when updating event type.",
        EVENT_MODEL_DESCRIPTION,
        toEventMembersContext(householdState.members),
        toEventTypesContext(householdState.eventTypes),
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          confirmUpdate: { type: "boolean" },
          eventId: { type: ["string", "null"] },
          eventTitle: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          updates: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: ["string", "null"] },
              date: { type: ["string", "null"] },
              memberIds: { type: ["array", "null"], items: { type: "string" } },
              allDay: { type: ["boolean", "null"] },
              startTime: { type: ["string", "null"] },
              endTime: { type: ["string", "null"] },
              eventTypeId: { type: ["string", "null"] },
              eventTypeHint: { type: ["string", "null"] },
              repeatRule: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
            },
          },
        },
        required: ["updates"],
      },
    },
    async execute(args) {
      const confirmUpdate = args?.confirmUpdate === true;
      const updates = args?.updates;
      if (!updates || typeof updates !== "object") {
        throw toClientError("updates is required");
      }

      const events = Array.isArray(householdState.events) ? householdState.events : [];
      const requestedEventId = cleanString(args?.eventId);
      const requestedTitle = normalizeForMatch(args?.eventTitle);
      const requestedDate = cleanString(args?.date);
      if (requestedDate && !isIsoDate(requestedDate)) {
        throw toClientError("date must use YYYY-MM-DD");
      }

      const matchingEvents = events.filter((event) => {
        if (requestedEventId) {
          return event.id === requestedEventId;
        }

        if (!requestedTitle) {
          return false;
        }

        const titleMatch = normalizeForMatch(event.title).includes(requestedTitle);
        if (!titleMatch) {
          return false;
        }

        return requestedDate ? event.date === requestedDate : true;
      });

      if (matchingEvents.length === 0) {
        return {
          ok: false,
          notFound: true,
          message: "No matching event found. Use get_events first to find the exact event id.",
        };
      }

      if (matchingEvents.length > 1) {
        return {
          ok: false,
          confirmationRequired: true,
          reason: "event_selection_required",
          message: "Multiple events match. Ask the user which one to update, then call update_event_details with eventId.",
          candidates: matchingEvents.map((event) => toEventOutput(event)),
          availableMembers: toAvailableMembers(householdState.members),
        };
      }

      const currentEvent = matchingEvents[0];
      const availableEventTypes = Array.isArray(householdState.eventTypes) ? householdState.eventTypes : [];
      const members = Array.isArray(householdState.members) ? householdState.members : [];
      const contacts = Array.isArray(householdState.contacts) ? householdState.contacts : [];
      const memberIdSet = new Set(members.map((member) => member.id));
      const contactIdSet = new Set(contacts.map((contact) => contact.id));

      const nextTitle = updates.title === undefined || updates.title === null ? currentEvent.title : cleanString(updates.title);
      if (!nextTitle) {
        throw toClientError("updated title cannot be empty");
      }

      const nextDate = updates.date === undefined || updates.date === null ? currentEvent.date : cleanString(updates.date);
      if (!nextDate || !isIsoDate(nextDate)) {
        throw toClientError("updated date must use YYYY-MM-DD");
      }

      const nextMemberIds =
        updates.memberIds === undefined || updates.memberIds === null
          ? currentEvent.memberIds
          : [...new Set(updates.memberIds.map((id) => cleanString(id)).filter(Boolean))];
      if (nextMemberIds.length === 0) {
        throw toClientError("event memberIds are required");
      }
      for (const memberId of nextMemberIds) {
        if (contactIdSet.has(memberId)) {
          throw toClientError(`event member id references a contact, not a household member: ${memberId}`);
        }
        if (!memberIdSet.has(memberId)) {
          throw toClientError(`event member id is not part of this household: ${memberId}`);
        }
      }

      const nextAllDay = updates.allDay === null || updates.allDay === undefined ? currentEvent.allDay !== false : updates.allDay !== false;
      const shouldKeepStartTime = updates.startTime === undefined || updates.startTime === null || cleanString(updates.startTime) === "";
      const shouldKeepEndTime = updates.endTime === undefined || updates.endTime === null || cleanString(updates.endTime) === "";
      const rawStartTime = shouldKeepStartTime ? currentEvent.startTime : updates.startTime;
      const rawEndTime = shouldKeepEndTime ? currentEvent.endTime : updates.endTime;
      const normalizedStartTime = normalizeTime24Hour(rawStartTime);
      const normalizedEndTime = normalizeTime24Hour(rawEndTime);

      if (!nextAllDay && (!normalizedStartTime || !normalizedEndTime)) {
        throw toClientError("event startTime and endTime are required for non all-day events");
      }
      if (!nextAllDay && normalizedStartTime && normalizedEndTime && (!isFiveMinuteStepTime(normalizedStartTime) || !isFiveMinuteStepTime(normalizedEndTime))) {
        throw toClientError("event startTime and endTime must use 5-minute steps");
      }
      if (!nextAllDay && normalizedStartTime && normalizedEndTime && normalizedStartTime >= normalizedEndTime) {
        throw toClientError("event time range is invalid");
      }

      const nextEventTypeId = resolveEventTypeId({
        requestedEventTypeId: updates.eventTypeId,
        requestedEventTypeHint: updates.eventTypeHint,
        availableEventTypes,
        fallbackEventTypeId: currentEvent.eventTypeId,
      });
      if (nextEventTypeId === "__invalid__") {
        throw toClientError("eventTypeId is not part of this household");
      }

      const updatedEvent = {
        ...currentEvent,
        title: nextTitle,
        date: nextDate,
        memberIds: nextMemberIds,
        allDay: nextAllDay,
        startTime: nextAllDay ? null : normalizedStartTime,
        endTime: nextAllDay ? null : normalizedEndTime,
        eventTypeId: nextEventTypeId,
        repeatRule: updates.repeatRule === undefined ? currentEvent.repeatRule ?? null : cleanString(updates.repeatRule) || null,
        location: updates.location === undefined ? currentEvent.location ?? null : cleanString(updates.location) || null,
        notes: updates.notes === undefined ? currentEvent.notes ?? null : cleanString(updates.notes) || null,
      };

      const before = toEventOutput(currentEvent);
      const after = toEventOutput(updatedEvent);

      if (!confirmUpdate) {
        return {
          ok: false,
          confirmationRequired: true,
          reason: "confirm_before_update",
          before,
          after,
          availableMembers: toAvailableMembers(members),
          message: "Review this event update with the user. If approved, call update_event_details again with confirmUpdate=true.",
        };
      }

      const updatedEvents = events.map((event) => (event.id === currentEvent.id ? updatedEvent : event));
      await db.replaceEvents(householdId, updatedEvents);
      householdState.events = updatedEvents;

      return {
        ok: true,
        event: after,
        availableMembers: toAvailableMembers(members),
        message: `Event ${updatedEvent.title} has been updated.`,
      };
    },
  };
};
