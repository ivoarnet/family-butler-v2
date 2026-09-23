const { randomUUID } = require("crypto");
const db = require("../shared/db");
const { APP_ROLES, authenticateRequest, createHttpError } = require("../shared/auth");
const {
  DEFAULT_HOUSEHOLD_NAME,
  DEFAULT_HOLIDAY_REGION,
  assertUserCanManageHousehold,
  assertUserCanReadHousehold,
} = require("../shared/user-households");

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

const getHouseholdOrThrow = async (householdId) => {
  const household = await db.getHouseholdWithRelations(householdId);
  if (!household) {
    throw createHttpError(404, "household not found");
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

      return {
        id: typeof member.id === "string" && member.id ? member.id : randomUUID(),
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

      return {
        id: typeof contact.id === "string" && contact.id ? contact.id : randomUUID(),
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
  if (!householdId) {
    context.res = {
      status: 400,
      body: { error: "householdId is required" },
    };
    return;
  }

  try {
    if (!httpRequest) {
      throw new Error("request context is missing");
    }

    const currentUser = await authenticateRequest(httpRequest);
    const method = typeof httpRequest.method === "string" ? httpRequest.method.toUpperCase() : "";

    if (method === "GET") {
      await assertUserCanReadHousehold(currentUser, householdId);
      const household = await getHouseholdOrThrow(householdId);

      context.res = {
        status: 200,
        body: normalizeHouseholdData(household),
      };
      return;
    }

    if (method === "PUT") {
      if (currentUser.role === APP_ROLES.demouser) {
        throw createHttpError(403, "Forbidden");
      }

      const requestedName = cleanOptionalText(httpRequest.body?.householdName);
      const householdName = requestedName || DEFAULT_HOUSEHOLD_NAME;
      const members = parseIncomingMembers(httpRequest.body?.familyMembers);
      const contacts = parseIncomingContacts(httpRequest.body?.contacts);
      const existingHousehold = await db.getHouseholdWithRelations(householdId);
      if (existingHousehold) {
        await assertUserCanManageHousehold(currentUser, householdId);
        await db.ensureHousehold(householdId, householdName, DEFAULT_HOLIDAY_REGION);
      } else {
        await db.createHousehold(householdId, householdName, DEFAULT_HOLIDAY_REGION);
        await db.assignHouseholdOwner(householdId, currentUser.id);
      }
      await db.replaceMembers(householdId, members);
      await db.replaceContacts(householdId, contacts);

      const household = await getHouseholdOrThrow(householdId);

      context.res = {
        status: 200,
        body: normalizeHouseholdData(household),
      };
      return;
    }

    if (method === "DELETE") {
      if (currentUser.role === APP_ROLES.demouser) {
        throw createHttpError(403, "Forbidden");
      }

      await assertUserCanManageHousehold(currentUser, householdId);
      await db.deleteHousehold(householdId);
      context.res = {
        status: 204,
        body: null,
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
    const status =
      typeof error?.status === "number"
        ? error.status
        : message.includes("required")
          ? 400
          : 500;
    context.res = {
      status,
      body: { error: message },
    };
  }
};
