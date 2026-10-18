import type { GroceryList } from "./types";

export const syncLabel = (list: GroceryList, configured: boolean) => {
  if (!list.remoteId) return "Local list";
  if (!configured || list.syncStatus === "unavailable") return "Bring unavailable";
  if (list.syncStatus === "pending") return "Sync pending";
  if (list.syncStatus === "error" || list.syncStatus === "failed") return "Sync failed";
  return list.syncStatus === "synced" ? "Synced with Bring" : "Linked to Bring";
};
