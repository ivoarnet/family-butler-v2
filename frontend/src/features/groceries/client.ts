import type { BringList, GroceryData, GroceryItem } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function createGroceryClient(householdId: string, accessToken: string, signal: AbortSignal) {
  const base = `${API_BASE_URL}/api/households/${encodeURIComponent(householdId)}/groceries`;
  const request = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method,
      signal,
      headers: {
        Authorization: ["Bearer", accessToken].join(" "),
        "x-supabase-auth-token": accessToken,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let message = `Grocery request failed (${response.status}). Please try again.`;
      try {
        const error = await response.json() as { error?: string; message?: string };
        if (typeof error.error === "string") message = error.error;
        else if (typeof error.message === "string") message = error.message;
      } catch {
        // Some unavailable services return an empty or HTML response.
      }
      throw new Error(message);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };

  return {
    read: () => request<GroceryData>(""),
    createList: (name: string) => request<{ id?: string; list?: { id: string } } | undefined>("/lists", "POST", { name }),
    updateList: (id: string, fields: { name?: string; remoteId?: string | null }) =>
      request("/lists", "PUT", { id, ...fields }),
    addItem: (listId: string, fields: Pick<GroceryItem, "name" | "specification">) =>
      request("/items", "POST", { listId, ...fields }),
    updateItem: (listId: string, id: string, fields: Partial<Pick<GroceryItem, "name" | "specification" | "checked">>) =>
      request("/items", "PUT", { listId, id, ...fields }),
    removeItem: (listId: string, id: string) => request("/items", "DELETE", { listId, id }),
    bringLists: () => request<{ lists: BringList[] }>("/bring-lists"),
    sync: (listId: string) => request("/sync", "POST", { listId }),
  };
}
