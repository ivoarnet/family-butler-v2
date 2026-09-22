const { randomUUID } = require("crypto");
const prisma = require("../shared/prisma");

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

const normalizeHouseholdData = (household) => ({
  householdId: household.id,
  householdName: household.name,
  familyMembers: household.members
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(normalizeMember),
  contacts: household.contacts.map(normalizeContact),
});

const ensureHousehold = async (tx, householdId, householdName) => {
  await tx.household.upsert({
    where: { id: householdId },
    create: {
      id: householdId,
      name: householdName,
      holidayRegion: DEFAULT_HOLIDAY_REGION,
    },
    update: {
      name: householdName,
    },
  });
};

const getHousehold = async (tx, householdId) =>
  tx.household.findUnique({
    where: { id: householdId },
    include: {
      members: true,
      contacts: true,
    },
  });

const getHouseholdOrThrow = async (tx, householdId) => {
  const household = await getHousehold(tx, householdId);
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

const syncMembers = async (tx, householdId, members) => {
  const incomingIds = members.map((member) => member.id);

  if (incomingIds.length > 0) {
    await tx.householdMember.deleteMany({
      where: {
        householdId,
        id: { notIn: incomingIds },
      },
    });
  } else {
    await tx.householdMember.deleteMany({
      where: { householdId },
    });
  }

  await Promise.all(
    members.map((member) =>
      tx.householdMember.upsert({
        where: { id: member.id },
        create: {
          id: member.id,
          householdId,
          firstName: member.firstName,
          role: member.role,
          avatarColor: member.avatarColor,
          visibleInCalendar: member.visibleInCalendar,
          sortOrder: member.sortOrder,
        },
        update: {
          firstName: member.firstName,
          role: member.role,
          avatarColor: member.avatarColor,
          visibleInCalendar: member.visibleInCalendar,
          sortOrder: member.sortOrder,
          householdId,
        },
      })
    )
  );
};

const syncContacts = async (tx, householdId, contacts) => {
  const incomingIds = contacts.map((contact) => contact.id);

  if (incomingIds.length > 0) {
    await tx.contact.deleteMany({
      where: {
        householdId,
        id: { notIn: incomingIds },
      },
    });
  } else {
    await tx.contact.deleteMany({
      where: { householdId },
    });
  }

  await Promise.all(
    contacts.map((contact) =>
      tx.contact.upsert({
        where: { id: contact.id },
        create: {
          id: contact.id,
          householdId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          birthDay: contact.birthDay,
          birthMonth: contact.birthMonth,
          birthYear: contact.birthYear,
          email: contact.email,
          mobilePhone: contact.mobilePhone,
        },
        update: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          birthDay: contact.birthDay,
          birthMonth: contact.birthMonth,
          birthYear: contact.birthYear,
          email: contact.email,
          mobilePhone: contact.mobilePhone,
          householdId,
        },
      })
    )
  );
};

module.exports = async function households(context, req) {
  const householdId = req.params?.householdId ?? context.bindingData?.householdId;
  if (!householdId) {
    context.res = {
      status: 400,
      body: { error: "householdId is required" },
    };
    return;
  }

  try {
    if (req.method === "GET") {
      const householdData = await prisma.$transaction(async (tx) => {
        await ensureHousehold(tx, householdId, DEFAULT_HOUSEHOLD_NAME);
        const household = await getHouseholdOrThrow(tx, householdId);
        return normalizeHouseholdData(household);
      });

      context.res = {
        status: 200,
        body: householdData,
      };
      return;
    }

    if (req.method === "PUT") {
      const requestedName = cleanOptionalText(req.body?.householdName);
      const householdName = requestedName || DEFAULT_HOUSEHOLD_NAME;
      const members = parseIncomingMembers(req.body?.familyMembers);
      const contacts = parseIncomingContacts(req.body?.contacts);

      const householdData = await prisma.$transaction(async (tx) => {
        await ensureHousehold(tx, householdId, householdName);
        await syncMembers(tx, householdId, members);
        await syncContacts(tx, householdId, contacts);

        const household = await getHouseholdOrThrow(tx, householdId);
        return normalizeHouseholdData(household);
      });

      context.res = {
        status: 200,
        body: householdData,
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
    const status = message.includes("required") ? 400 : 500;
    context.res = {
      status,
      body: { error: message },
    };
  }
};
