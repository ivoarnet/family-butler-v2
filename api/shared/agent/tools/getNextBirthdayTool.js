const { CONTACT_MODEL_DESCRIPTION } = require("./contactModel");

const isValidDateParts = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateOnly = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const getNextBirthdayForContact = (contact, today) => {
  if (!Number.isInteger(contact?.birthDay) || !Number.isInteger(contact?.birthMonth)) {
    return null;
  }

  const day = contact.birthDay;
  const month = contact.birthMonth;
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const currentYear = today.getFullYear();
  if (!isValidDateParts(currentYear, month, day)) {
    return null;
  }

  let occurrence = new Date(currentYear, month - 1, day);
  if (occurrence < today) {
    const nextYear = currentYear + 1;
    if (!isValidDateParts(nextYear, month, day)) {
      return null;
    }
    occurrence = new Date(nextYear, month - 1, day);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round((occurrence.getTime() - today.getTime()) / msPerDay);
  return {
    contact,
    occurrence,
    daysUntil,
  };
};

module.exports = function createGetNextBirthdayTool({ householdState }) {
  return {
    definition: {
      name: "get_next_birthday",
      description: [
        "Find the next upcoming birthday from contacts in the current household.",
        "Use this when the user asks things like 'who's birthday is next'.",
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
      const today = toDateOnly(new Date());

      const candidates = contacts
        .map((contact) => getNextBirthdayForContact(contact, today))
        .filter((entry) => Boolean(entry))
        .sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime() || a.contact.firstName.localeCompare(b.contact.firstName));

      const next = candidates[0];
      if (!next) {
        return {
          ok: true,
          message: "No contacts with a valid birthday were found.",
          nextBirthday: null,
        };
      }

      return {
        ok: true,
        nextBirthday: {
          contactId: next.contact.id,
          firstName: next.contact.firstName,
          lastName: next.contact.lastName ?? null,
          date: toIsoDate(next.occurrence),
          daysUntil: next.daysUntil,
        },
        message: `Next birthday is ${next.contact.firstName}${next.contact.lastName ? ` ${next.contact.lastName}` : ""} on ${toIsoDate(next.occurrence)}.`,
      };
    },
  };
};
