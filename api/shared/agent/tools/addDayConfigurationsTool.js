const { randomUUID } = require("crypto");
const { DAY_CONFIGURATION_CATEGORIES, DAY_CONFIGURATION_MODEL_DESCRIPTION } = require("./dayConfigurationModel");

const DAY_CONFIGURATION_CATEGORY_SET = new Set(DAY_CONFIGURATION_CATEGORIES);

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toDuplicateKey = (dayConfiguration) => [dayConfiguration.category, dayConfiguration.startDate, dayConfiguration.endDate].join("|");

module.exports = function createAddDayConfigurationsTool({ db, householdId, householdState, toClientError }) {
  return {
    definition: {
      name: "add_day_configurations",
      description: [
        "Add one or more special day configurations to the current household.",
        "Use this for manually requested entries and for entries interpreted from attached PDFs.",
        "This tool detects duplicates by category + date range and skips them so the same configuration is not added twice.",
        "Before writing, first call with confirmAdd=false (or omitted) to let the user review pending records, then call again with confirmAdd=true after user approval.",
        DAY_CONFIGURATION_MODEL_DESCRIPTION,
      ].join("\n"),
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          confirmAdd: { type: "boolean" },
          configurations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                category: { type: "string", enum: DAY_CONFIGURATION_CATEGORIES },
                startDate: { type: "string" },
                endDate: { type: "string" },
                label: { type: ["string", "null"] },
              },
              required: ["category", "startDate", "endDate"],
            },
          },
        },
        required: ["configurations"],
      },
    },
    async execute(args) {
      const inputConfigurations = Array.isArray(args?.configurations) ? args.configurations : [];
      const confirmAdd = args?.confirmAdd === true;
      if (inputConfigurations.length === 0) {
        throw toClientError("configurations must contain at least one item");
      }

      const existingDayConfigurations = Array.isArray(householdState.dayConfigurations) ? householdState.dayConfigurations : [];
      const existingKeys = new Set(existingDayConfigurations.map((dayConfiguration) => toDuplicateKey(dayConfiguration)));
      const incomingKeys = new Set();
      const skippedDuplicates = [];
      const additions = [];

      for (const item of inputConfigurations) {
        const category = cleanString(item?.category);
        if (!DAY_CONFIGURATION_CATEGORY_SET.has(category)) {
          throw toClientError("configuration category is invalid");
        }

        const startDate = cleanString(item?.startDate);
        if (!isIsoDate(startDate)) {
          throw toClientError("configuration startDate must use YYYY-MM-DD");
        }

        const endDate = cleanString(item?.endDate);
        if (!isIsoDate(endDate)) {
          throw toClientError("configuration endDate must use YYYY-MM-DD");
        }

        if (endDate < startDate) {
          throw toClientError("configuration endDate must be on or after startDate");
        }

        const candidate = {
          category,
          startDate,
          endDate,
          label: cleanString(item?.label) || null,
        };
        const key = toDuplicateKey(candidate);

        if (existingKeys.has(key) || incomingKeys.has(key)) {
          skippedDuplicates.push(candidate);
          continue;
        }

        incomingKeys.add(key);
        additions.push({
          id: randomUUID(),
          ...candidate,
        });
      }

      if (!confirmAdd) {
        return {
          ok: false,
          confirmationRequired: true,
          reason: "confirm_before_add",
          pendingAdditions: additions,
          skippedDuplicates,
          message:
            additions.length > 0
              ? `Review ${additions.length} day configuration${additions.length === 1 ? "" : "s"} before saving. If approved, call add_day_configurations again with the same configurations and confirmAdd=true.${skippedDuplicates.length > 0 ? ` ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? "" : "s"} will be skipped.` : ""}`
              : "No new day configurations to save because all provided entries are duplicates.",
        };
      }

      if (additions.length > 0) {
        const updated = [...existingDayConfigurations, ...additions];
        await db.replaceDayConfigurations(householdId, updated);
        householdState.dayConfigurations = updated;
      }

      return {
        ok: true,
        addedCount: additions.length,
        skippedDuplicateCount: skippedDuplicates.length,
        added: additions,
        skippedDuplicates,
        message:
          additions.length > 0
            ? `Added ${additions.length} day configuration${additions.length === 1 ? "" : "s"}${skippedDuplicates.length > 0 ? ` and skipped ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? "" : "s"}.` : "."}`
            : "No new day configurations were added because all provided entries were duplicates.",
      };
    },
  };
};
