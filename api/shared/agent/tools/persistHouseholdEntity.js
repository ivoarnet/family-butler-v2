module.exports = async function persistHouseholdEntity({ db, householdId, householdState, entityType, operation, entityId, entity }) {
  try {
    const revision = await db.mutateHouseholdEntity(
      householdId,
      Number.isSafeInteger(householdState.revision) ? householdState.revision : 0,
      entityType,
      operation,
      entityId,
      entity
    );
    householdState.revision = revision;
    return revision;
  } catch (error) {
    if (error?.status === 409 || error?.message?.includes("stale household revision")) {
      const conflict = new Error("Household changed while this request was in progress. Refresh and try again.");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
};
