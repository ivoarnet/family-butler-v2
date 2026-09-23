const { randomUUID } = require("crypto");
const db = require("../shared/db");

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

const normalizeHouseholdData = ({ household, members, contacts }) => ({
  householdId: household.id,
  householdName: household.name,
  familyMembers: members
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(normalizeMember),
  contacts: contacts.map(normalizeContact),
});

const normalizeHouseholdSummary = (household) => ({
  id: household.id,
  name: household.name,
});

const getHouseholdOrThrow = async (householdId) => {
  const household = await db.getHouseholdWithRelations(householdId);
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

const parseIncomingMembers = (members, allowedMemberIds) => {
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
      if (requestedId && !allowedMemberIds.has(requestedId)) {
        throw new Error("member id is not authorized for this household");
      }

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

const parseIncomingContacts = (contacts, allowedContactIds) => {
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
      if (requestedId && !allowedContactIds.has(requestedId)) {
        throw new Error("contact id is not authorized for this household");
      }

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

module.exports = async function households(context, req) {
  const httpRequest = req ?? context.req;
  const householdId = httpRequest?.params?.householdId ?? context.bindingData?.householdId;

  try {
    if (!httpRequest) {
      throw new Error("request context is missing");
    }

    const method = typeof httpRequest.method === "string" ? httpRequest.method.toUpperCase() : "";

    if (method === "GET") {
      if (!householdId) {
        const households = await db.listHouseholds();
        context.res = {
          status: 200,
          body: {
            households: households.map(normalizeHouseholdSummary),
          },
        };
        return;
      }

      const household = await getHouseholdOrThrow(householdId);

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

      const existingHouseholds = await db.listHouseholds();
      const duplicate = existingHouseholds.some((household) => household.name.trim().toLowerCase() === householdName.toLowerCase());
      if (duplicate) {
        context.res = {
          status: 409,
          body: { error: "A household with this name already exists." },
        };
        return;
      }

      const createdHousehold = await db.createHousehold(householdName, DEFAULT_HOLIDAY_REGION);
      const created = await getHouseholdOrThrow(createdHousehold.id);

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

      const existingHousehold = await getHouseholdOrThrow(householdId);
      const requestedName = cleanOptionalText(httpRequest.body?.householdName);
      const householdName = requestedName || existingHousehold.household.name || DEFAULT_HOUSEHOLD_NAME;
      const existingMemberIds = new Set(existingHousehold.members.map((member) => member.id));
      const existingContactIds = new Set(existingHousehold.contacts.map((contact) => contact.id));
      const members = parseIncomingMembers(httpRequest.body?.familyMembers, existingMemberIds);
      const contacts = parseIncomingContacts(httpRequest.body?.contacts, existingContactIds);

      await db.ensureHousehold(householdId, householdName, DEFAULT_HOLIDAY_REGION);
      await db.replaceMembers(householdId, members);
      await db.replaceContacts(householdId, contacts);

      const household = await getHouseholdOrThrow(householdId);

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
