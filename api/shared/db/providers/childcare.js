const { randomUUID } = require("crypto");

const MODELS = {
  providers: {
    table: "childcare_providers",
    fields: { name: "name", type: "type" },
  },
  arrangements: {
    table: "childcare_arrangements",
    fields: {
      providerId: "provider_id", childIds: "child_ids", weekdays: "weekdays",
      startDate: "start_date", endDate: "end_date", allDay: "all_day",
      startTime: "start_time", endTime: "end_time",
    },
  },
  overrides: {
    table: "childcare_overrides",
    fields: {
      arrangementId: "arrangement_id", originalDate: "original_date", action: "action",
      movedDate: "moved_date", providerId: "provider_id", allDay: "all_day",
      startTime: "start_time", endTime: "end_time",
    },
  },
};

const mapRow = (model, row) => ({
  id: row.id,
  householdId: row.household_id,
  ...Object.fromEntries(Object.entries(model.fields).map(([key, column]) => [
    key, key.endsWith("Time") && row[column] ? row[column].slice(0, 5) : row[column],
  ])),
});

module.exports = function createChildcareProvider(request) {
  const list = async (model, householdId) => {
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const page = await request(model.table, {
        params: { select: "*", household_id: `eq.${householdId}`, order: "id.asc", limit: pageSize, offset },
      });
      rows.push(...page.map((row) => mapRow(model, row)));
      if (page.length < pageSize) return rows;
    }
  };
  const save = async (model, householdId, data, upsert = false) => {
    const body = Object.fromEntries(Object.entries(model.fields).map(([key, column]) => [column, data[key]]));
    const rows = await request(model.table, {
      method: "POST",
      params: upsert ? { on_conflict: "household_id,arrangement_id,original_date" } : undefined,
      headers: { Prefer: `return=representation${upsert ? ",resolution=merge-duplicates" : ""}` },
      body: { ...(!upsert ? { id: randomUUID() } : {}), household_id: householdId, ...body },
    });
    if (!rows?.[0]) throw new Error("Failed to persist childcare");
    return mapRow(model, rows[0]);
  };
  return {
    async getChildcareHousehold(householdId, userId) {
      const rows = await request("households", {
        params: { select: "id,household_members(id)", id: `eq.${householdId}`, created_by_user_id: `eq.${userId}` },
      });
      return rows?.[0] ? { id: rows[0].id, memberIds: rows[0].household_members.map((member) => member.id) } : null;
    },
    async getChildcare(householdId) {
      const [providers, arrangements, overrides] = await Promise.all(
        Object.values(MODELS).map((model) => list(model, householdId))
      );
      return { providers, arrangements, overrides };
    },
    createChildcareProvider: (householdId, data) => save(MODELS.providers, householdId, data),
    createChildcareArrangement: (householdId, data) => save(MODELS.arrangements, householdId, data),
    saveChildcareOverride: (householdId, data) => save(MODELS.overrides, householdId, data, true),
  };
};
