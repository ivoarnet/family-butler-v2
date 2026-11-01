const mapTask = (row) => ({
  id: row.id,
  householdId: row.household_id,
  title: row.title,
  memberId: row.member_id,
  coins: row.coins,
  status: row.status,
  sortOrder: row.sort_order,
  dueDate: row.due_date,
  repeatRule: row.repeat_rule,
  seriesId: row.series_id,
  completedAt: row.completed_at,
  revision: row.revision,
});

module.exports = function createTasksProvider(request) {
  const command = async (householdId, userId, action, data) => {
    const result = await request("rpc/mutate_household_task", {
      method: "POST",
      body: { p_household: householdId, p_user: userId, p_action: action, p_data: data },
    });
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("unavailable");
    if (result.error) throw Object.assign(new Error("unavailable"), {
      status: [400, 404, 409].includes(result.status) ? result.status : 500,
    });
    return result;
  };
  return {
    async getTasksHousehold(householdId, userId) {
      const rows = await request("households", {
        params: { select: "id", id: `eq.${householdId}`, created_by_user_id: `eq.${userId}`, limit: 1 },
      });
      if (!Array.isArray(rows)) throw new Error("unavailable");
      return rows[0] ?? null;
    },
    async getTasks(householdId, userId, filters = {}) {
      const result = await command(householdId, userId, "read", filters);
      if (!Array.isArray(result.tasks)) throw new Error("unavailable");
      return result.tasks.map(mapTask);
    },
    async mutateTasks(householdId, userId, action, data) {
      const result = await command(householdId, userId, action, data);
      if (result.ok !== true || typeof result.id !== "string") throw new Error("unavailable");
      return { ok: true, id: result.id };
    },
  };
};
