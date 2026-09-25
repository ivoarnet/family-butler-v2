const { randomUUID } = require("crypto");
const { CONTACT_MODEL_DESCRIPTION } = require("./contactModel");

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const normalizeName = (value) => cleanString(value).toLowerCase();

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
        "If a similar contact already exists (same birthday and similar name), ask for explicit confirmation before adding by setting confirmDuplicate=true.",
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
          confirmDuplicate: { type: "boolean" },
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
      const confirmDuplicate = args?.confirmDuplicate === true;
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
      const firstNameNormalized = normalizeName(newContact.firstName);
      const lastNameNormalized = normalizeName(newContact.lastName);
      const similarContacts = existingContacts.filter((contact) => {
        if (!contact || typeof contact !== "object") {
          return false;
        }
        if (!Number.isInteger(newContact.birthDay) || !Number.isInteger(newContact.birthMonth)) {
          return false;
        }
        if (contact.birthDay !== newContact.birthDay || contact.birthMonth !== newContact.birthMonth) {
          return false;
        }

        const contactFirstName = normalizeName(contact.firstName);
        const contactLastName = normalizeName(contact.lastName);
        const isFirstNameMatch = contactFirstName && contactFirstName === firstNameNormalized;
        const isLastNameMatch = lastNameNormalized && contactLastName && contactLastName === lastNameNormalized;
        const isFullNameMatch = isFirstNameMatch && (lastNameNormalized ? isLastNameMatch : true);
        return isFullNameMatch || isFirstNameMatch || isLastNameMatch;
      });

      if (similarContacts.length > 0 && !confirmDuplicate) {
        return {
          ok: false,
          confirmationRequired: true,
          reason: "similar_contact_exists",
          message:
            "A similar contact already exists with the same birthday. Ask the user to confirm before adding, then call add_contact again with confirmDuplicate=true.",
          similarContacts: similarContacts.map((contact) => ({
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName ?? null,
            birthDay: Number.isInteger(contact.birthDay) ? contact.birthDay : null,
            birthMonth: Number.isInteger(contact.birthMonth) ? contact.birthMonth : null,
            birthYear: Number.isInteger(contact.birthYear) ? contact.birthYear : null,
          })),
        };
      }

      await db.replaceContacts(householdId, [...existingContacts, newContact]);
      householdState.contacts = [...existingContacts, newContact];

      return {
        ok: true,
        contact: newContact,
        duplicateBypassed: similarContacts.length > 0 && confirmDuplicate,
        message:
          similarContacts.length > 0 && confirmDuplicate
            ? `Contact ${newContact.firstName} has been added after duplicate confirmation.`
            : `Contact ${newContact.firstName} has been added.`,
      };
    },
  };
};
