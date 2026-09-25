const { randomUUID } = require("crypto");
const { CONTACT_MODEL_DESCRIPTION } = require("./contactModel");

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const toIntOrNull = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

module.exports = function createAddContactTool({ db, householdId, householdState, toClientError }) {
  return {
    definition: {
      name: "add_contact",
      description: [
        "Add a new contact entry to the current household contact list.",
        "Use this when the user asks to create/add/save a contact.",
        CONTACT_MODEL_DESCRIPTION,
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          firstName: { type: "string" },
          lastName: { type: ["string", "null"] },
          birthDay: { type: ["integer", "null"], minimum: 1, maximum: 31 },
          birthMonth: { type: ["integer", "null"], minimum: 1, maximum: 12 },
          birthYear: { type: ["integer", "null"], minimum: 1900, maximum: 2100 },
          email: { type: ["string", "null"] },
          mobilePhone: { type: ["string", "null"] },
        },
        required: ["firstName"],
      },
    },
    async execute(args) {
      const firstName = cleanString(args?.firstName);
      if (!firstName) {
        throw toClientError("firstName is required for add_contact");
      }

      const birthDay = toIntOrNull(args?.birthDay);
      const birthMonth = toIntOrNull(args?.birthMonth);
      const birthYear = toIntOrNull(args?.birthYear);
      if (birthDay !== null && (birthDay < 1 || birthDay > 31)) {
        throw toClientError("birthDay must be between 1 and 31");
      }
      if (birthMonth !== null && (birthMonth < 1 || birthMonth > 12)) {
        throw toClientError("birthMonth must be between 1 and 12");
      }
      if (birthYear !== null && (birthYear < 1900 || birthYear > 2100)) {
        throw toClientError("birthYear must be between 1900 and 2100");
      }

      const newContact = {
        id: randomUUID(),
        firstName,
        lastName: cleanString(args?.lastName) || null,
        birthDay,
        birthMonth,
        birthYear,
        email: cleanString(args?.email) || null,
        mobilePhone: cleanString(args?.mobilePhone) || null,
      };

      const existingContacts = Array.isArray(householdState.contacts) ? householdState.contacts : [];
      await db.replaceContacts(householdId, [...existingContacts, newContact]);
      householdState.contacts = [...existingContacts, newContact];

      return {
        ok: true,
        contact: newContact,
        message: `Contact ${newContact.firstName} has been added.`,
      };
    },
  };
};
