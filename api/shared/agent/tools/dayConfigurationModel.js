const DAY_CONFIGURATION_CATEGORIES = ["school_off", "bank_holiday", "bridge_day"];

const DAY_CONFIGURATION_MODEL_DESCRIPTION = [
  "Day configuration table schema:",
  "- id: string (UUID)",
  "- category: one of school_off | bank_holiday | bridge_day",
  "- startDate: string (YYYY-MM-DD)",
  "- endDate: string (YYYY-MM-DD, same day or after startDate)",
  "- label: string | null (optional short marker)",
].join("\n");

module.exports = {
  DAY_CONFIGURATION_CATEGORIES,
  DAY_CONFIGURATION_MODEL_DESCRIPTION,
};
