const { DAY_CONFIGURATION_MODEL_DESCRIPTION } = require("./dayConfigurationModel");

module.exports = function createGetDayConfigurationsTool({ householdState }) {
  return {
    definition: {
      name: "get_day_configurations",
      description: [
        "Read special day configurations from the current household.",
        "Use this before adding new entries and whenever users ask about school off days, bank holidays, or bridge days.",
        DAY_CONFIGURATION_MODEL_DESCRIPTION,
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    async execute() {
      const dayConfigurations = Array.isArray(householdState.dayConfigurations) ? householdState.dayConfigurations : [];
      return {
        ok: true,
        count: dayConfigurations.length,
        dayConfigurations: dayConfigurations.map((dayConfiguration) => ({
          id: dayConfiguration.id,
          category: dayConfiguration.category,
          startDate: dayConfiguration.startDate,
          endDate: dayConfiguration.endDate,
          label: dayConfiguration.label ?? null,
        })),
      };
    },
  };
};
