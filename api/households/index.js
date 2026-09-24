const { randomUUID } = require("crypto");
const db = require("../shared/db");
const { getAuthenticatedUserId } = require("../shared/auth");

const DEFAULT_HOUSEHOLD_NAME = "Family Butler";
const DEFAULT_HOLIDAY_REGION = process.env.DEFAULT_HOLIDAY_REGION || "CH";

const normalizeMember = (member) => ({
  id: member.id,
  firstName: member.firstName,
  role: member.role ?? undefined,
  avatarColor: member.avatarColor,
  visibleInCalendar: member.visibleInCalendar,
  order: member.sortOrder,
});

const normalizeContact = (contact) => ({
  id: contact.id,
  firstName: contact.firstName,
  lastName: contact.lastName ?? undefined,
  birthDay: contact.birthDay ?? undefined,
  birthMonth: contact.birthMonth ?? undefined,
  birthYear: contact.birthYear ?? undefined,
  email: contact.email ?? undefined,
  mobilePhone: contact.mobilePhone ?? undefined,
});

const normalizeEventType = (eventType) => ({
  id: eventType.id,
  name: eventType.name,
  icon: eventType.icon ?? undefined,
  sortOrder: eventType.sortOrder,
});

const normalizeEvent = (event) => ({
  id: event.id,
  title: event.title,
  date: event.date,
  memberIds: event.memberIds,
  allDay: event.allDay,
  startTime: event.startTime ?? undefined,
  endTime: event.endTime ?? undefined,
  eventTypeId: event.eventTypeId ?? undefined,
  repeatRule: event.repeatRule ?? undefined,
  location: event.location ?? undefined,
  notes: event.notes ?? undefined,
});

const normalizeDayConfiguration = (dayConfiguration) => ({
  id: dayConfiguration.id,
  category: dayConfiguration.category,
  startDate: dayConfiguration.startDate,
  endDate: dayConfiguration.endDate,
  label: dayConfiguration.label ?? undefined,
});

const normalizeHouseholdData = ({ household, members, contacts, eventTypes = [], events = [], dayConfigurations = [] }) => ({
  householdId: household.id,
  householdName: household.name,
  familyMembers: members
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(normalizeMember),
  contacts: contacts.map(normalizeContact),
  eventTypes: eventTypes.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(normalizeEventType),
  events: events.map(normalizeEvent),
  dayConfigurations: dayConfigurations
    .slice()
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))
    .map(normalizeDayConfiguration),
});

const normalizeHouseholdSummary = (household) => ({
  id: household.id,
  name: household.name,
});

const getHouseholdOrThrow = async (householdId, userId) => {
  const household = await db.getHouseholdWithRelations(householdId, userId);
  if (!household) {
    throw new Error("household not found");
  }
  return household;
};

const cleanOptionalText = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const cleanOptionalInt = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeTime24Hour = (value) => {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) {
    return null;
  }
  const match = cleaned.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
};

const isFiveMinuteStepTime = (value) => {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return false;
  }
  return Number.parseInt(match[2], 10) % 5 === 0;
};

const parseIncomingMembers = (members) => {
  if (!Array.isArray(members)) {
    return [];
  }

  return members
    .filter((member) => member && typeof member === "object")
    .map((member, index) => {
      const firstName = cleanOptionalText(member.firstName);
      if (!firstName) {
        throw new Error("member firstName is required");
      }

      const requestedId = typeof member.id === "string" && member.id ? member.id : null;
      return {
        id: requestedId || randomUUID(),
        firstName,
        role: cleanOptionalText(member.role),
        avatarColor: cleanOptionalText(member.avatarColor) || "#3b82f6",
        visibleInCalendar: member.visibleInCalendar !== false,
        sortOrder: index,
      };
    });
};

const parseIncomingContacts = (contacts) => {
  if (!Array.isArray(contacts)) {
    return [];
  }

  return contacts
    .filter((contact) => contact && typeof contact === "object")
    .map((contact) => {
      const firstName = cleanOptionalText(contact.firstName);
      if (!firstName) {
        throw new Error("contact firstName is required");
      }

      const requestedId = typeof contact.id === "string" && contact.id ? contact.id : null;
      return {
        id: requestedId || randomUUID(),
        firstName,
        lastName: cleanOptionalText(contact.lastName),
        birthDay: cleanOptionalInt(contact.birthDay),
        birthMonth: cleanOptionalInt(contact.birthMonth),
        birthYear: cleanOptionalInt(contact.birthYear),
        email: cleanOptionalText(contact.email),
        mobilePhone: cleanOptionalText(contact.mobilePhone),
      };
    });
};

const parseIncomingEventTypes = (eventTypes) => {
  if (!Array.isArray(eventTypes)) {
    return [];
  }

  return eventTypes
    .filter((eventType) => eventType && typeof eventType === "object")
    .map((eventType, index) => {
      const name = cleanOptionalText(eventType.name);
      if (!name) {
        throw new Error("event type name is required");
      }

      const requestedId = typeof eventType.id === "string" && eventType.id ? eventType.id : null;
      return {
        id: requestedId || randomUUID(),
        name,
        icon: cleanOptionalText(eventType.icon),
        sortOrder: index,
      };
    });
};

const parseIncomingEvents = (events) => {
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .filter((event) => event && typeof event === "object")
    .map((event) => {
      const title = cleanOptionalText(event.title);
      if (!title) {
        throw new Error("event title is required");
      }

      const date = cleanOptionalText(event.date);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("event date is required");
      }

      const allDay = event.allDay !== false;
      const startTime = normalizeTime24Hour(event.startTime);
      const endTime = normalizeTime24Hour(event.endTime);
      if (!allDay && (!startTime || !endTime)) {
        throw new Error("event startTime and endTime are required in 24-hour HH:MM format for non all-day events");
      }
      if (!allDay && startTime && endTime && (!isFiveMinuteStepTime(startTime) || !isFiveMinuteStepTime(endTime))) {
        throw new Error("event startTime and endTime must use 5-minute steps");
      }
      if (!allDay && startTime && endTime && startTime >= endTime) {
        throw new Error("event time range is invalid");
      }

      const requestedId = typeof event.id === "string" && event.id ? event.id : null;
      const memberIds = Array.isArray(event.memberIds)
        ? [...new Set(event.memberIds.filter((memberId) => typeof memberId === "string" && memberId))]
        : [];
      if (memberIds.length === 0) {
        throw new Error("event memberIds are required");
      }

      return {
        id: requestedId || randomUUID(),
        title,
        date,
        memberIds,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        eventTypeId: cleanOptionalText(event.eventTypeId),
        repeatRule: cleanOptionalText(event.repeatRule),
        location: cleanOptionalText(event.location),
        notes: cleanOptionalText(event.notes),
      };
    });
};

const DAY_CONFIGURATION_CATEGORIES = new Set(["school_off", "bank_holiday", "bridge_day"]);

const parseIncomingDayConfigurations = (dayConfigurations) => {
  if (!Array.isArray(dayConfigurations)) {
    return [];
  }

  return dayConfigurations
    .filter((dayConfiguration) => dayConfiguration && typeof dayConfiguration === "object")
    .map((dayConfiguration) => {
      const category = cleanOptionalText(dayConfiguration.category);
      if (!category || !DAY_CONFIGURATION_CATEGORIES.has(category)) {
        throw new Error("day configuration category is invalid");
      }

      const startDate = cleanOptionalText(dayConfiguration.startDate);
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new Error("day configuration startDate is required");
      }

      const endDate = cleanOptionalText(dayConfiguration.endDate);
      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error("day configuration endDate is required");
      }

      if (endDate < startDate) {
        throw new Error("day configuration endDate must be on or after startDate");
      }

      const requestedId = typeof dayConfiguration.id === "string" && dayConfiguration.id ? dayConfiguration.id : null;
      return {
        id: requestedId || randomUUID(),
        category,
        startDate,
        endDate,
        label: cleanOptionalText(dayConfiguration.label),
      };
    });
};

const assertMemberIdsAuthorized = async (householdId, existingMemberIds, requestedMembers) => {
  const idsToValidate = [...new Set(requestedMembers.map((member) => member.id).filter((memberId) => !existingMemberIds.has(memberId)))];
  const ownershipChecks = await Promise.all(idsToValidate.map((memberId) => db.getMemberHouseholdId(memberId)));

  ownershipChecks.forEach((ownerHouseholdId, index) => {
    if (ownerHouseholdId && ownerHouseholdId !== householdId) {
      throw new Error(`member id is not authorized for this household: ${idsToValidate[index]}`);
    }
  });
};

const assertContactIdsAuthorized = async (householdId, existingContactIds, requestedContacts) => {
  const idsToValidate = [...new Set(requestedContacts.map((contact) => contact.id).filter((contactId) => !existingContactIds.has(contactId)))];
  const ownershipChecks = await Promise.all(idsToValidate.map((contactId) => db.getContactHouseholdId(contactId)));

  ownershipChecks.forEach((ownerHouseholdId, index) => {
    if (ownerHouseholdId && ownerHouseholdId !== householdId) {
      throw new Error(`contact id is not authorized for this household: ${idsToValidate[index]}`);
    }
  });
};

const assertEventTypeIdsAuthorized = async (householdId, existingEventTypeIds, requestedEventTypes) => {
  const idsToValidate = [...new Set(requestedEventTypes.map((eventType) => eventType.id).filter((eventTypeId) => !existingEventTypeIds.has(eventTypeId)))];
  const ownershipChecks = await Promise.all(idsToValidate.map((eventTypeId) => db.getEventTypeHouseholdId(eventTypeId)));

  ownershipChecks.forEach((ownerHouseholdId, index) => {
    if (ownerHouseholdId && ownerHouseholdId !== householdId) {
      throw new Error(`event type id is not authorized for this household: ${idsToValidate[index]}`);
    }
  });
};

const assertDayConfigurationIdsAuthorized = async (householdId, existingDayConfigurationIds, requestedDayConfigurations) => {
  const idsToValidate = [
    ...new Set(
      requestedDayConfigurations
        .map((dayConfiguration) => dayConfiguration.id)
        .filter((dayConfigurationId) => !existingDayConfigurationIds.has(dayConfigurationId))
    ),
  ];
  const ownershipChecks = await Promise.all(idsToValidate.map((dayConfigurationId) => db.getDayConfigurationHouseholdId(dayConfigurationId)));

  ownershipChecks.forEach((ownerHouseholdId, index) => {
    if (ownerHouseholdId && ownerHouseholdId !== householdId) {
      throw new Error(`day configuration id is not authorized for this household: ${idsToValidate[index]}`);
    }
  });
};

module.exports = async function households(context, req) {
  const httpRequest = req ?? context.req;
  const householdId = httpRequest?.params?.householdId ?? context.bindingData?.householdId;

  try {
    if (!httpRequest) {
      throw new Error("request context is missing");
    }

    const authenticatedUserId = await getAuthenticatedUserId(httpRequest.headers);
    if (!authenticatedUserId) {
      context.res = {
        status: 401,
        body: { error: "authentication required" },
      };
      return;
    }

    const method = typeof httpRequest.method === "string" ? httpRequest.method.toUpperCase() : "";

    if (method === "GET") {
      if (!householdId) {
        const households = await db.listHouseholds(authenticatedUserId);
        context.res = {
          status: 200,
          body: {
            households: households.map(normalizeHouseholdSummary),
          },
        };
        return;
      }

      const household = await getHouseholdOrThrow(householdId, authenticatedUserId);

      context.res = {
        status: 200,
        body: normalizeHouseholdData(household),
      };
      return;
    }

    if (method === "POST") {
      if (householdId) {
        context.res = {
          status: 400,
          body: { error: "householdId must not be provided when creating a household" },
        };
        return;
      }

      const householdName = cleanOptionalText(httpRequest.body?.householdName);
      if (!householdName) {
        context.res = {
          status: 400,
          body: { error: "household name is required" },
        };
        return;
      }

      const existingHouseholds = await db.listHouseholds(authenticatedUserId);
      const duplicate = existingHouseholds.some((household) => household.name.trim().toLowerCase() === householdName.toLowerCase());
      if (duplicate) {
        context.res = {
          status: 409,
          body: { error: "A household with this name already exists." },
        };
        return;
      }

      const createdHousehold = await db.createHousehold(householdName, DEFAULT_HOLIDAY_REGION, authenticatedUserId);
      const created = await getHouseholdOrThrow(createdHousehold.id, authenticatedUserId);

      context.res = {
        status: 201,
        body: normalizeHouseholdData(created),
      };
      return;
    }

    if (method === "PUT") {
      if (!householdId) {
        context.res = {
          status: 400,
          body: { error: "householdId is required" },
        };
        return;
      }

      const existingHousehold = await getHouseholdOrThrow(householdId, authenticatedUserId);
      const requestedName = cleanOptionalText(httpRequest.body?.householdName);
      const householdName = requestedName || existingHousehold.household.name || DEFAULT_HOUSEHOLD_NAME;
      const existingMemberIds = new Set(existingHousehold.members.map((member) => member.id));
      const existingContactIds = new Set(existingHousehold.contacts.map((contact) => contact.id));
      const existingEventTypeIds = new Set((existingHousehold.eventTypes ?? []).map((eventType) => eventType.id));
      const existingDayConfigurationIds = new Set((existingHousehold.dayConfigurations ?? []).map((dayConfiguration) => dayConfiguration.id));
      const members = parseIncomingMembers(httpRequest.body?.familyMembers);
      const contacts = parseIncomingContacts(httpRequest.body?.contacts);
      const eventTypes = parseIncomingEventTypes(httpRequest.body?.eventTypes);
      const events = parseIncomingEvents(httpRequest.body?.events);
      const dayConfigurations = parseIncomingDayConfigurations(httpRequest.body?.dayConfigurations);
      await assertMemberIdsAuthorized(householdId, existingMemberIds, members);
      await assertContactIdsAuthorized(householdId, existingContactIds, contacts);
      await assertEventTypeIdsAuthorized(householdId, existingEventTypeIds, eventTypes);
      await assertDayConfigurationIdsAuthorized(householdId, existingDayConfigurationIds, dayConfigurations);

      const requestedMemberIds = new Set(members.map((member) => member.id));
      const requestedEventTypeIds = new Set(eventTypes.map((eventType) => eventType.id));
      events.forEach((event) => {
        event.memberIds.forEach((memberId) => {
          if (!requestedMemberIds.has(memberId)) {
            throw new Error(`event member id is not authorized for this household: ${memberId}`);
          }
        });
        if (event.eventTypeId && !requestedEventTypeIds.has(event.eventTypeId)) {
          throw new Error(`event type id is not part of this household: ${event.eventTypeId}`);
        }
      });

      await db.ensureHousehold(householdId, householdName, DEFAULT_HOLIDAY_REGION, authenticatedUserId);
      await db.replaceMembers(householdId, members);
      await db.replaceContacts(householdId, contacts);
      await db.replaceEventTypes(householdId, eventTypes);
      await db.replaceEvents(householdId, events);
      await db.replaceDayConfigurations(householdId, dayConfigurations);

      const household = await getHouseholdOrThrow(householdId, authenticatedUserId);

      context.res = {
        status: 200,
        body: normalizeHouseholdData(household),
      };
      return;
    }

    context.res = {
      status: 405,
      body: { error: "method not allowed" },
    };
  } catch (error) {
    context.log.error("households handler failed", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("required")
      || message.includes("invalid")
      || message.includes("must be on or after")
      ? 400
      : message.includes("already exists")
      ? 409
      : message.includes("not authorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 500;
    context.res = {
      status,
      body: { error: message },
    };
  }
};
