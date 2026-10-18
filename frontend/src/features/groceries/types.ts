export interface GroceryItem {
  id: string;
  name: string;
  specification: string;
  checked: boolean;
}

export interface GroceryList {
  id: string;
  name: string;
  remoteId: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  items: GroceryItem[];
}

export interface GroceryData {
  lists: GroceryList[];
  bringConfigured: boolean;
}

export interface BringList {
  id: string;
  name: string;
}
