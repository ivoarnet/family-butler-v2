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
  ensureHousehold: (...args) => getProvider().ensureHousehold(...args),
  getHouseholdWithRelations: (...args) => getProvider().getHouseholdWithRelations(...args),
  replaceMembers: (...args) => getProvider().replaceMembers(...args),
  replaceContacts: (...args) => getProvider().replaceContacts(...args),
  listTasks: (...args) => getProvider().listTasks(...args),
  createTask: (...args) => getProvider().createTask(...args),
  checkConnection: (...args) => getProvider().checkConnection(...args),
};
