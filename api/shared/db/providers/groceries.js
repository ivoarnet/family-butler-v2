module.exports = function createGroceriesProvider(request) {
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
    getGroceries: (householdId) => command(householdId, "read"),
    mutateGroceries: (householdId, action, data) => command(householdId, action, data),
    acquireGrocerySync: (householdId, listId) => command(householdId, "acquire", { id: listId }),
    renewGrocerySync: (householdId, lease) => command(householdId, "renew", lease),
    finishGrocerySync: (householdId, lease, items) => command(householdId, "finish", { ...lease, items }),
    releaseGrocerySync: (householdId, lease) => command(householdId, "release", lease),
  };
};
