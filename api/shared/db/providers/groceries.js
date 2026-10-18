module.exports = function createGroceriesProvider(request) {
  const connectionCommand = async (householdId, enabled, envelope, revision) => {
    const result = await request("rpc/bring_connection_command", {
      method: "POST",
      body: { p_household: householdId, p_enabled: enabled, p_envelope: envelope, p_revision: revision },
    });
    if (!result || typeof result !== "object") throw new Error("unavailable");
    if (result.error) {
      const error = new Error("unavailable");
      error.status = result.status === 409 ? 409 : 500;
      throw error;
    }
    return result;
  };
  const connectionRows = async (params) => {
    const rows = await request("bring_connections", { params });
    if (!Array.isArray(rows)) throw new Error("unavailable");
    return rows;
  };
  const command = async (householdId, action, data = {}) => {
    const result = await request("rpc/grocery_command", {
      method: "POST",
      body: { p_household: householdId, p_action: action, p_data: data },
    });
    if (!result || typeof result !== "object") throw new Error("Grocery storage unavailable");
    if (result.error) {
      const error = new Error(result.error);
      error.status = result.status || 409;
      throw error;
    }
    return result;
  };
  return {
    getBringConnectionMetadata: async (householdId) => (await connectionRows({
      household_id: `eq.${householdId}`, select: "enabled,revision", limit: "1",
    }))[0] ?? null,
    getBringConnection: async (householdId) => (await connectionRows({
      household_id: `eq.${householdId}`, select: "enabled,revision,version,ciphertext,iv,tag", limit: "1",
    }))[0] ?? null,
    listBringConnections: (after, limit = 100) => connectionRows({
      select: "household_id,enabled", order: "household_id.asc",
      limit: String(Math.min(100, Math.max(1, limit))),
      ...(after ? { household_id: `gt.${after}` } : {}),
    }),
    saveBringConnection: (householdId, envelope, revision) => connectionCommand(householdId, true, envelope, revision),
    disconnectBringConnection: (householdId, revision) => connectionCommand(householdId, false, null, revision),
    getGroceries: (householdId) => command(householdId, "read"),
    mutateGroceries: (householdId, action, data) => command(householdId, action, data),
    acquireGrocerySync: (householdId, listId, connectionRevision) => command(householdId, "acquire", {
      id: listId, ...(connectionRevision === undefined ? {} : { connectionRevision }),
    }),
    renewGrocerySync: (householdId, lease) => command(householdId, "renew", lease),
    finishGrocerySync: (householdId, lease, items) => command(householdId, "finish", { ...lease, items }),
    releaseGrocerySync: (householdId, lease) => command(householdId, "release", lease),
  };
};
