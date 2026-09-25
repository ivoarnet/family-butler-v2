const CONTACT_MODEL_DESCRIPTION = [
  "Contact table schema:",
  "- id: string (UUID)",
  "- firstName: string (required)",
  "- lastName: string | null",
  "- birthDay: number | null (1-31)",
  "- birthMonth: number | null (1-12)",
  "- birthYear: number | null (1900-2100)",
  "- email: string | null",
  "- mobilePhone: string | null",
].join("\n");

module.exports = {
  CONTACT_MODEL_DESCRIPTION,
};
