const { randomUUID } = require("crypto");

const TABLES = {
  parties: "parenting_time_parties",
  plans: "parenting_time_plans",
  changes: "parenting_time_changes",
};

const mapParty = (row) => ({ id: row.id, householdId: row.household_id, name: row.name });
const mapPlan = (row) => ({
  id: row.id,
  householdId: row.household_id,
  defaultPartyId: row.default_party_id,
  effectiveFrom: row.effective_from,
  timeZone: row.time_zone,
  recurrenceMode: row.recurrence_mode,
  rules: row.rules,
  active: row.active,
});
const mapChange = (row) => ({
  id: row.id,
  householdId: row.household_id,
  partyId: row.party_id,
  startAt: row.start_at,
  endAt: row.end_at,
  label: row.label,
});

module.exports = function createParentingTimeProvider(request) {
  const list = async (table, householdId, map) => {
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const page = await request(table, {
        params: { select: "*", household_id: `eq.${householdId}`, order: "id.asc", limit: pageSize, offset },
      });
      rows.push(...page.map(map));
      if (page.length < pageSize) return rows;
    }
  };
  const save = async (table, householdId, id, data, map, conflict = "id") => {
    const rows = await request(table, {
      method: "POST",
      params: { on_conflict: conflict },
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: { id: id ?? randomUUID(), household_id: householdId, ...data },
    });
    if (!rows?.[0]) throw new Error("Failed to persist parenting time");
    return map(rows[0]);
  };
  const update = async (table, householdId, id, data, map) => {
    const rows = await request(table, {
      method: "PATCH",
      params: { household_id: `eq.${householdId}`, id: `eq.${id}` },
      headers: { Prefer: "return=representation" },
      body: data,
    });
    if (!rows?.[0]) {
      const error = new Error("parenting-time record not found");
      error.status = 404;
      throw error;
    }
    return map(rows[0]);
  };

  return {
    async getParentingTimeHousehold(householdId, userId) {
      const rows = await request("households", {
        params: { select: "id", id: `eq.${householdId}`, created_by_user_id: `eq.${userId}` },
      });
      return rows?.[0] ?? null;
    },
    async getParentingTime(householdId) {
      const [parties, plans, changes] = await Promise.all([
        list(TABLES.parties, householdId, mapParty),
        list(TABLES.plans, householdId, mapPlan),
        list(TABLES.changes, householdId, mapChange),
      ]);
      return { parties, plan: plans[0] ?? null, changes };
    },
    createParentingParty: (householdId, data) => save(TABLES.parties, householdId, null, data, mapParty),
    saveParentingPlan: async (householdId, data) => {
      const existing = await request(TABLES.plans, {
        params: { select: "id", household_id: `eq.${householdId}`, limit: 1 },
      });
      const body = {
        default_party_id: data.defaultPartyId,
        effective_from: data.effectiveFrom,
        time_zone: data.timeZone,
        recurrence_mode: data.recurrenceMode,
        rules: data.rules,
        active: data.active,
      };
      return save(TABLES.plans, householdId, existing?.[0]?.id, body, mapPlan, "household_id");
    },
    createParentingChange: (householdId, data) => save(TABLES.changes, householdId, data.id, {
      plan_id: data.planId, party_id: data.partyId, start_at: data.startAt, end_at: data.endAt, label: data.label,
    }, mapChange),
    updateParentingChange: (householdId, id, data) => update(TABLES.changes, householdId, id, {
      plan_id: data.planId, party_id: data.partyId, start_at: data.startAt, end_at: data.endAt, label: data.label,
    }, mapChange),
  };
};
