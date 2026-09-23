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
  createHousehold: (...args) => getProvider().createHousehold(...args),
  deleteHousehold: (...args) => getProvider().deleteHousehold(...args),
  getHouseholdOwner: (...args) => getProvider().getHouseholdOwner(...args),
  assignHouseholdOwner: (...args) => getProvider().assignHouseholdOwner(...args),
  listOwnedHouseholds: (...args) => getProvider().listOwnedHouseholds(...args),
  listLinkedHouseholds: (...args) => getProvider().listLinkedHouseholds(...args),
  listLinkedHouseholdMembers: (...args) => getProvider().listLinkedHouseholdMembers(...args),
  getUserProfile: (...args) => getProvider().getUserProfile(...args),
  setUserDefaultHousehold: (...args) => getProvider().setUserDefaultHousehold(...args),
  getHouseholdWithRelations: (...args) => getProvider().getHouseholdWithRelations(...args),
  replaceMembers: (...args) => getProvider().replaceMembers(...args),
  replaceContacts: (...args) => getProvider().replaceContacts(...args),
  getAuthUser: (...args) => getProvider().getAuthUser(...args),
  listTasks: (...args) => getProvider().listTasks(...args),
  createTask: (...args) => getProvider().createTask(...args),
  checkConnection: (...args) => getProvider().checkConnection(...args),
};
