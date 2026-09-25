const { CONTACT_MODEL_DESCRIPTION } = require("./contactModel");

module.exports = function createGetContactsTool({ householdState }) {
  return {
    definition: {
      name: "get_contacts",
      description: [
        "Read contact rows from the current household.",
        "Use this for general contact questions, including birthdays and contact lookups.",
        CONTACT_MODEL_DESCRIPTION,
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    async execute() {
      const contacts = Array.isArray(householdState.contacts) ? householdState.contacts : [];
      return {
        ok: true,
        count: contacts.length,
        contacts: contacts.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName ?? null,
          birthDay: Number.isInteger(contact.birthDay) ? contact.birthDay : null,
          birthMonth: Number.isInteger(contact.birthMonth) ? contact.birthMonth : null,
          birthYear: Number.isInteger(contact.birthYear) ? contact.birthYear : null,
          email: contact.email ?? null,
          mobilePhone: contact.mobilePhone ?? null,
        })),
      };
    },
  };
};
