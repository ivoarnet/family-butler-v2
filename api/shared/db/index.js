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
  getBringConnectionMetadata: (...args) => getProvider().getBringConnectionMetadata(...args),
  getBringConnection: (...args) => getProvider().getBringConnection(...args),
  listBringConnections: (...args) => getProvider().listBringConnections(...args),
  saveBringConnection: (...args) => getProvider().saveBringConnection(...args),
  disconnectBringConnection: (...args) => getProvider().disconnectBringConnection(...args),
  getGroceries: (...args) => getProvider().getGroceries(...args),
  mutateGroceries: (...args) => getProvider().mutateGroceries(...args),
  acquireGrocerySync: (...args) => getProvider().acquireGrocerySync(...args),
  renewGrocerySync: (...args) => getProvider().renewGrocerySync(...args),
  finishGrocerySync: (...args) => getProvider().finishGrocerySync(...args),
  releaseGrocerySync: (...args) => getProvider().releaseGrocerySync(...args),
  getChildcareHousehold: (...args) => getProvider().getChildcareHousehold(...args),
  getChildcare: (...args) => getProvider().getChildcare(...args),
  createChildcareProvider: (...args) => getProvider().createChildcareProvider(...args),
  updateChildcareProvider: (...args) => getProvider().updateChildcareProvider(...args),
  createChildcareArrangement: (...args) => getProvider().createChildcareArrangement(...args),
  updateChildcareArrangement: (...args) => getProvider().updateChildcareArrangement(...args),
  saveChildcareOverride: (...args) => getProvider().saveChildcareOverride(...args),
  listHouseholds: (...args) => getProvider().listHouseholds(...args),
  createHousehold: (...args) => getProvider().createHousehold(...args),
  getMemberHouseholdId: (...args) => getProvider().getMemberHouseholdId(...args),
  getContactHouseholdId: (...args) => getProvider().getContactHouseholdId(...args),
  getEventTypeHouseholdId: (...args) => getProvider().getEventTypeHouseholdId(...args),
  getEventHouseholdId: (...args) => getProvider().getEventHouseholdId(...args),
  getDayConfigurationHouseholdId: (...args) => getProvider().getDayConfigurationHouseholdId(...args),
  ensureHousehold: (...args) => getProvider().ensureHousehold(...args),
  getHouseholdWithRelations: (...args) => getProvider().getHouseholdWithRelations(...args),
  reserveAgentExecution: (...args) => getProvider().reserveAgentExecution(...args),
  finishAgentExecution: (...args) => getProvider().finishAgentExecution(...args),
  mutateHouseholdEntity: (...args) => getProvider().mutateHouseholdEntity(...args),
  mutateHouseholdEntities: (...args) => getProvider().mutateHouseholdEntities(...args),
  replaceMembers: (...args) => getProvider().replaceMembers(...args),
  replaceContacts: (...args) => getProvider().replaceContacts(...args),
  replaceEventTypes: (...args) => getProvider().replaceEventTypes(...args),
  replaceEvents: (...args) => getProvider().replaceEvents(...args),
  replaceDayConfigurations: (...args) => getProvider().replaceDayConfigurations(...args),
  checkConnection: (...args) => getProvider().checkConnection(...args),
  getParentingTimeHousehold: (...args) => getProvider().getParentingTimeHousehold(...args),
  getParentingTime: (...args) => getProvider().getParentingTime(...args),
  getParentingParties: (...args) => getProvider().getParentingParties(...args),
  getParentingCalendarSettings: (...args) => getProvider().getParentingCalendarSettings(...args),
  saveParentingCalendarSettings: (...args) => getProvider().saveParentingCalendarSettings(...args),
  createParentingParty: (...args) => getProvider().createParentingParty(...args),
  updateParentingParty: (...args) => getProvider().updateParentingParty(...args),
  saveParentingPlan: (...args) => getProvider().saveParentingPlan(...args),
  createParentingChange: (...args) => getProvider().createParentingChange(...args),
  updateParentingChange: (...args) => getProvider().updateParentingChange(...args),
  deleteParentingChange: (...args) => getProvider().deleteParentingChange(...args),
};
