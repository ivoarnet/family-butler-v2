const createSupabaseProvider = require("./providers/supabase");

let provider;

const getProvider = () => {
  if (provider) {
    return provider;
  }

  const configuredProvider = (process.env.DB_PROVIDER || "supabase").trim().toLowerCase();

  if (configuredProvider !== "supabase") {
    throw new Error(`Unsupported DB_PROVIDER: ${configuredProvider}`);
  }

  provider = createSupabaseProvider();
  return provider;
};

module.exports = {
  listHouseholds: (...args) => getProvider().listHouseholds(...args),
  createHousehold: (...args) => getProvider().createHousehold(...args),
  getMemberHouseholdId: (...args) => getProvider().getMemberHouseholdId(...args),
  getContactHouseholdId: (...args) => getProvider().getContactHouseholdId(...args),
  getEventTypeHouseholdId: (...args) => getProvider().getEventTypeHouseholdId(...args),
  ensureHousehold: (...args) => getProvider().ensureHousehold(...args),
  getHouseholdWithRelations: (...args) => getProvider().getHouseholdWithRelations(...args),
  replaceMembers: (...args) => getProvider().replaceMembers(...args),
  replaceContacts: (...args) => getProvider().replaceContacts(...args),
  replaceEventTypes: (...args) => getProvider().replaceEventTypes(...args),
  replaceEvents: (...args) => getProvider().replaceEvents(...args),
  listTasks: (...args) => getProvider().listTasks(...args),
  createTask: (...args) => getProvider().createTask(...args),
  checkConnection: (...args) => getProvider().checkConnection(...args),
};
