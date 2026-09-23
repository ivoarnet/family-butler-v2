const { randomUUID } = require("crypto");
const db = require("./db");
const { APP_ROLES, createHttpError } = require("./auth");

const DEFAULT_HOUSEHOLD_NAME = "Family Butler";
const DEFAULT_HOLIDAY_REGION = process.env.DEFAULT_HOLIDAY_REGION || "CH";
const DEMO_HOUSEHOLD_ID = process.env.DEMO_HOUSEHOLD_ID || "00000000-0000-0000-0000-000000000001";

const cleanNamePrefix = (value) => value.replace(/[^a-zA-Z0-9]+/g, " ").trim();

const getDefaultHouseholdName = (email) => {
  if (typeof email !== "string" || !email.includes("@")) {
    return DEFAULT_HOUSEHOLD_NAME;
  }

  const prefix = cleanNamePrefix(email.split("@")[0] || "");
  if (!prefix) {
    return DEFAULT_HOUSEHOLD_NAME;
  }

  return `${prefix} Household`;
};

const getDefaultOwnerMemberName = (email) => {
  if (typeof email !== "string" || !email.includes("@")) {
    return "Owner";
  }
  const prefix = cleanNamePrefix(email.split("@")[0] || "");
  return prefix || "Owner";
};

const mergeAccessibleHouseholds = (owned, linked) => {
  const map = new Map();

  for (const household of owned) {
    if (!household?.id) {
      continue;
    }
    map.set(household.id, {
      id: household.id,
      name: household.name,
      canManage: true,
      source: "owned",
    });
  }

  for (const household of linked) {
    if (!household?.id) {
      continue;
    }
    if (map.has(household.id)) {
      continue;
    }
    map.set(household.id, {
      id: household.id,
      name: household.name,
      canManage: false,
      source: "member-link",
    });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const ensureAdminHouseholdContext = async (user) => {
  let [ownedHouseholds, linkedHouseholds] = await Promise.all([
    db.listOwnedHouseholds(user.id),
    db.listLinkedHouseholds(user.id),
  ]);

  if (ownedHouseholds.length === 0 && linkedHouseholds.length === 0) {
    const householdId = randomUUID();
    const householdName = getDefaultHouseholdName(user.email);
    await db.createHousehold(householdId, householdName, DEFAULT_HOLIDAY_REGION);
    await db.createHouseholdOwnerMember({
      householdId,
      userId: user.id,
      firstName: getDefaultOwnerMemberName(user.email),
    });
    ownedHouseholds = await db.listOwnedHouseholds(user.id);
    linkedHouseholds = await db.listLinkedHouseholds(user.id);
  }

  const [profile, linkedMembers] = await Promise.all([
    db.getUserProfile(user.id),
    db.listLinkedHouseholdMembers(user.id),
  ]);
  const households = mergeAccessibleHouseholds(ownedHouseholds, linkedHouseholds);
  const householdIds = new Set(households.map((household) => household.id));

  let defaultHouseholdId = profile?.defaultHouseholdId ?? null;
  if (!defaultHouseholdId || !householdIds.has(defaultHouseholdId)) {
    const preferred = households.find((household) => household.canManage) ?? households[0] ?? null;
    defaultHouseholdId = preferred?.id ?? null;
    if (defaultHouseholdId) {
      await db.setUserDefaultHousehold(user.id, defaultHouseholdId);
    }
  }

  return {
    defaultHouseholdId,
    households,
    linkedMembers,
  };
};

const getUserHouseholdContext = async (user) => {
  if (user.role === APP_ROLES.demouser) {
    return {
      defaultHouseholdId: DEMO_HOUSEHOLD_ID,
      households: [
        {
          id: DEMO_HOUSEHOLD_ID,
          name: DEFAULT_HOUSEHOLD_NAME,
          canManage: false,
          source: "demo",
        },
      ],
      linkedMembers: [],
    };
  }

  return ensureAdminHouseholdContext(user);
};

const assertUserCanReadHousehold = async (user, householdId) => {
  if (!householdId) {
    throw createHttpError(400, "householdId is required");
  }

  const context = await getUserHouseholdContext(user);
  const allowed = context.households.some((household) => household.id === householdId);
  if (!allowed) {
    throw createHttpError(403, "Forbidden");
  }
};

const assertUserCanManageHousehold = async (user, householdId) => {
  if (user.role === APP_ROLES.demouser) {
    throw createHttpError(403, "Forbidden");
  }

  const owned = await db.listOwnedHouseholds(user.id);
  const canManage = owned.some((household) => household.id === householdId);
  if (!canManage) {
    throw createHttpError(403, "Forbidden");
  }
};

module.exports = {
  DEFAULT_HOUSEHOLD_NAME,
  DEFAULT_HOLIDAY_REGION,
  DEMO_HOUSEHOLD_ID,
  getUserHouseholdContext,
  assertUserCanReadHousehold,
  assertUserCanManageHousehold,
};
