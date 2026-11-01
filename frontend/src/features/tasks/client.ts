import type { Task, TaskFields, TaskStatus, TaskUpdateFields } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class TaskRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function createTaskClient(householdId: string, accessToken: string, signal: AbortSignal) {
  const base = `${API_BASE_URL}/api/households/${encodeURIComponent(householdId)}/tasks`;
  const request = async <T>(path = "", method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method, signal,
      headers: {
        Authorization: ["Bearer", accessToken].join(" "),
        "x-supabase-auth-token": accessToken,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let message = `Task request failed (${response.status}). Please try again.`;
      try {
        const payload = await response.json();
        if (typeof payload.error === "string") message = payload.error;
        else if (typeof payload.message === "string") message = payload.message;
      } catch { /* Unavailable services may return HTML instead of JSON. */ }
      throw new TaskRequestError(message, response.status);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
  return {
    read: () => request<{ tasks: Task[] }>(),
    create: (id: string, fields: TaskFields) => request<{ ok: true; id: string }>("", "POST", { id, ...fields }),
    edit: (task: Task, fields: TaskUpdateFields) => request("", "PUT", { id: task.id, revision: task.revision, ...fields }),
    remove: (task: Task) => request("", "DELETE", { id: task.id, revision: task.revision }),
    move: (task: Task, status: TaskStatus, beforeId: string | null) =>
      request<{ ok: true; id: string }>("/move", "POST", { id: task.id, revision: task.revision, status, beforeId }),
  };
}
