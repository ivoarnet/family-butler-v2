import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { ModuleNavigation } from "../features/app/components/ModuleNavigation";
import type { Task } from "../features/tasks/types";
import type { FamilyMember } from "../types/family";
import { TasksPage } from "./TasksPage";

const members: FamilyMember[] = [
  { id: "alex", firstName: "Alex", avatarColor: "#3b82f6", visibleInCalendar: true, order: 0 },
  { id: "sam", firstName: "Sam", avatarColor: "#f97316", visibleInCalendar: true, order: 1 },
];
const initialTasks: Task[] = [
  { id: "laundry", householdId: "demo", title: "Fold laundry", memberId: "alex", coins: 5, status: "todo",
    sortOrder: 0, dueDate: "2026-11-02", repeatRule: "weekly", seriesId: "series-laundry", completedAt: null, revision: 0 },
  { id: "plants", householdId: "demo", title: "Water plants", memberId: "sam", coins: 2, status: "todo",
    sortOrder: 1, dueDate: null, repeatRule: "none", seriesId: null, completedAt: null, revision: 0 },
  { id: "table", householdId: "demo", title: "Set the table", memberId: "sam", coins: 3, status: "in_progress",
    sortOrder: 0, dueDate: "2026-11-01", repeatRule: "daily", seriesId: "series-table", completedAt: null, revision: 0 },
];
type MockOptions = { failSave?: boolean; conflict?: boolean; failRefresh?: boolean; delayed?: boolean; delayedMutation?: boolean; dark?: boolean };
const writes = fn();

function installMock(options: MockOptions = {}) {
  writes.mockClear();
  const original = window.fetch;
  let tasks = structuredClone(initialTasks);
  let failSave = options.failSave;
  let conflict = options.conflict;
  let failRefresh = false;
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!/^\/api\/households\/(demo|other)\/tasks(?:\/move)?$/.test(url.pathname)) return original(input, init);
    expect(new Headers(init?.headers).get("x-supabase-auth-token")).toMatch(/^storybook-task(?:-refreshed)?-session$/);
    expect(new Headers(init?.headers).get("Authorization")).toBe(["Bearer", new Headers(init?.headers).get("x-supabase-auth-token")].join(" "));
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (options.delayed && url.pathname.includes("/demo/")) await new Promise((resolve) => setTimeout(resolve, 350));
      if (failRefresh) { failRefresh = false; return response({ error: "Refresh unavailable" }, 503); }
      return response({ tasks: url.pathname.includes("/other/") ? [] : tasks });
    }
    const body = JSON.parse(String(init?.body));
    writes({ path: url.pathname, method, body });
    if (options.delayedMutation) await new Promise((resolve) => setTimeout(resolve, 350));
    if (failSave) { failSave = false; return response({ error: "Task service unavailable. Please retry." }, 503); }
    const task = tasks.find((item) => item.id === body.id);
    if (conflict && task) { conflict = false; task.revision++; return response({ error: "Revision conflict" }, 409); }
    if (method !== "POST" || url.pathname.endsWith("/move")) {
      expect(body.revision).toBe(task?.revision);
    }
    if (url.pathname.endsWith("/move")) {
      expect(Object.keys(body).sort()).toEqual(["beforeId", "id", "revision", "status"]);
      const destination = tasks.filter((item) => item.status === body.status && item.id !== body.id).sort((a, b) => a.sortOrder - b.sortOrder);
      const index = body.beforeId ? destination.findIndex((item) => item.id === body.beforeId) : destination.length;
      expect(index).toBeGreaterThanOrEqual(0);
      const previousStatus = task!.status;
      task!.status = body.status;
      task!.revision++;
      destination.splice(index, 0, task!);
      destination.forEach((item, order) => { item.sortOrder = order; });
      if (body.status === "done" && previousStatus !== "done") {
        task!.completedAt = "2026-11-01T12:00:00Z";
        if (task!.repeatRule !== "none") tasks.push({ ...task!, id: `${task!.id}-next`, status: "todo",
          dueDate: task!.repeatRule === "daily" ? "2026-11-02" : "2026-11-09", sortOrder: 10, completedAt: null, revision: 0 });
      }
    } else if (method === "POST") {
      expect(Object.keys(body).sort()).toEqual(["coins", "dueDate", "id", "memberId", "repeatRule", "title"]);
      expect(body.id).toMatch(/^[\da-f-]{36}$/);
      if (!task) tasks.push({ ...body, householdId: "demo", status: "todo", sortOrder: 20, seriesId: null, completedAt: null, revision: 0 });
    } else if (method === "PUT") {
      expect(Object.keys(body).sort()).toEqual(["coins", "dueDate", "id", "memberId", "repeatRule", "revision", "title"]);
      Object.assign(task!, body, { revision: task!.revision + 1 });
    } else if (method === "DELETE") {
      expect(Object.keys(body).sort()).toEqual(["id", "revision"]);
      tasks = tasks.filter((item) => item.id !== body.id);
    }
    if (options.failRefresh) { options.failRefresh = false; failRefresh = true; }
    return response({ ok: true, id: body.id });
  };
  return () => { window.fetch = original; };
}

function TaskStory({ noMembers = false, switchSession = false, boardWidth }: { noMembers?: boolean; switchSession?: boolean; boardWidth?: number }) {
  const [householdId, setHouseholdId] = useState("demo");
  const [token, setToken] = useState("storybook-task-session");
  return <div className="app-shell" style={boardWidth ? { width: boardWidth, maxWidth: "100%" } : undefined}>
    {switchSession && <>
      <button onClick={() => setHouseholdId("other")}>Switch household</button>
      <button onClick={() => setToken("storybook-task-refreshed-session")}>Refresh session</button>
    </>}
    <TasksPage householdId={householdId} householdName="The Riverstone household" accessToken={token} members={noMembers ? [] : members}
      currentUserLabel="Alex Riverstone" currentUserEmail="alex@example.com" currentUserInitials="AR" currentUserAvatarUrl={null}
      onOpenAccountSection={fn()} onSignOut={async () => undefined}
      moduleNavigation={<ModuleNavigation activeId="tasks" onNavigate={fn()} />} />
  </div>;
}
const meta: Meta<typeof TaskStory> = {
  title: "Tasks/Household board",
  component: TaskStory,
  parameters: { layout: "fullscreen" },
  beforeEach: ({ parameters }) => {
    const options = parameters.taskMock as MockOptions | undefined;
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", options?.dark ? "dark" : "light");
    const restore = installMock(options ? { ...options } : {});
    return () => { restore(); if (previous === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", previous); };
  },
};
export default meta;
type Story = StoryObj<typeof TaskStory>;
const ready = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("article", { name: "Fold laundry" });
  await waitFor(() => expect(canvas.getByRole("button", { name: "Add task" })).toBeEnabled());
  return canvas;
};
const editor = async (canvasElement: HTMLElement, name = "Add task") =>
  within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name }));
const order = (canvasElement: HTMLElement, status: string) => [...canvasElement.querySelectorAll(`[data-task-column="${status}"] [data-task-card]`)]
  .map((element) => element.getAttribute("data-task-card"));

export const TasksBoard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(canvas.getByRole("region", { name: "Done" })).toHaveTextContent("No tasks");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("5 coins");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("Alex");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("Repeats weekly");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("Due 02.11.2026");
    await userEvent.click(canvas.getByRole("button", { name: "Alex Riverstone · Open account menu" }));
    await expect(canvas.getByRole("menu", { name: "Account menu" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
  },
};
export const TasksDarkBoard: Story = { ...TasksBoard, parameters: { taskMock: { dark: true } } };
const assertBoardLayout = async (canvasElement: HTMLElement) => {
  await ready(canvasElement);
  const root = canvasElement.ownerDocument.documentElement;
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  const liveRegion = canvasElement.querySelector<HTMLElement>('[role="status"][aria-live="polite"]')!;
  await expect(liveRegion.getBoundingClientRect().width).toBe(1);
  await expect(liveRegion.getBoundingClientRect().height).toBe(1);
  const board = canvasElement.querySelector<HTMLElement>('[aria-label="Task board"]')!;
  await expect(board.scrollWidth).toBeGreaterThan(board.clientWidth);
  await expect(board.getBoundingClientRect().right).toBeLessThanOrEqual(root.clientWidth);
};
export const TasksPhoneWidthLayout: Story = {
  args: { boardWidth: 390 },
  play: async ({ canvasElement }) => assertBoardLayout(canvasElement),
};
export const TasksTabletWidthLayout: Story = {
  args: { boardWidth: 768 },
  play: async ({ canvasElement }) => assertBoardLayout(canvasElement),
};
export const TasksCreateEditDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add task" }));
    let dialog = await editor(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent("Title is required");
    await expect(writes).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByRole("textbox", { name: "Title" }), { target: { value: "a".repeat(161) } });
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent("160 characters or fewer");
    await userEvent.clear(dialog.getByRole("textbox", { name: "Title" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Walk the dog");
    await userEvent.clear(dialog.getByRole("spinbutton", { name: "Coins" }));
    await userEvent.type(dialog.getByRole("spinbutton", { name: "Coins" }), "-1");
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent("non-negative whole number");
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Coins" }), { target: { value: "1000001" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent("up to 1,000,000");
    await userEvent.clear(dialog.getByRole("spinbutton", { name: "Coins" }));
    await userEvent.type(dialog.getByRole("spinbutton", { name: "Coins" }), "4");
    await userEvent.click(dialog.getByRole("combobox", { name: "Repeat" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("option", { name: "Daily" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(dialog.getByRole("alert")).toHaveTextContent("require a due date");
    const dueDate = within(dialog.getByRole("group", { name: "Due date" }));
    await userEvent.click(dueDate.getByRole("spinbutton", { name: "Day" }));
    await userEvent.keyboard("03");
    await userEvent.click(dueDate.getByRole("spinbutton", { name: "Month" }));
    await userEvent.keyboard("11");
    await userEvent.click(dueDate.getByRole("spinbutton", { name: "Year" }));
    await userEvent.keyboard("2026");
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await canvas.findByRole("article", { name: "Walk the dog" })).toHaveTextContent("4 coins");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit Walk the dog" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Edit Walk the dog" }));
    dialog = await editor(canvasElement, "Edit task");
    await userEvent.clear(dialog.getByRole("textbox", { name: "Title" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Walk with Sam");
    await userEvent.click(dialog.getByRole("combobox", { name: "Assignee" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("option", { name: "Sam" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await canvas.findByRole("article", { name: "Walk with Sam" })).toHaveTextContent("Sam");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Delete Walk with Sam" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Delete Walk with Sam" }));
    dialog = await editor(canvasElement, "Delete task?");
    await userEvent.click(dialog.getByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(canvas.queryByRole("article", { name: "Walk with Sam" })).toBeNull());
  },
};
export const TasksNoMembers: Story = {
  args: { noMembers: true },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add task" }));
    const dialog = await editor(canvasElement);
    await expect(dialog.getByRole("button", { name: "Save task" })).toBeDisabled();
    await waitFor(() => expect(dialog.getByText("No household members available.")).toBeVisible());
    await expect(writes).not.toHaveBeenCalled();
  },
};
export const TasksSaveFailureRetry: Story = {
  parameters: { taskMock: { failSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Edit Fold laundry" }));
    const dialog = await editor(canvasElement, "Edit task");
    await userEvent.clear(dialog.getByRole("textbox", { name: "Title" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Laundry sorted");
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Task service unavailable");
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Laundry sorted");
    await expect(canvasElement.querySelector('[data-task-card="laundry"]')).toHaveTextContent("Fold laundry");
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await canvas.findByRole("article", { name: "Laundry sorted" })).toBeVisible();
  },
};
export const TasksConflictReviewRetry: Story = {
  parameters: { taskMock: { conflict: true } },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Edit Fold laundry" }));
    const dialog = await editor(canvasElement, "Edit task");
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("review your changes");
    await expect(dialog.getByRole("alert")).toHaveTextContent("Revision conflict");
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save task" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("dialog", { name: "Edit task" })).toBeNull());
    await expect(writes.mock.calls[1][0].body.revision).toBe(1);
  },
};
export const TasksSavedRefreshFailure: Story = {
  parameters: { taskMock: { failRefresh: true } },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add task" }));
    const dialog = await editor(canvasElement);
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "New task");
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Changes saved");
    await expect(dialog.getByRole("button", { name: "Save task" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Reload board" }));
    await expect(await canvas.findByRole("article", { name: "New task" })).toBeVisible();
    await expect(writes).toHaveBeenCalledTimes(1);
  },
};
export const TasksKeyboardMoveReorderCancel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    canvas.getByRole("button", { name: "Move Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowUp}{Enter}");
    await waitFor(() => expect(order(canvasElement, "todo")).toEqual(["plants", "laundry"]));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Move Water plants" })).toBeEnabled());
    canvas.getByRole("button", { name: "Move Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{Escape}");
    await expect(order(canvasElement, "done")).toEqual([]);
    await expect(writes).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Enter}{ArrowRight}{ArrowRight}{Enter}");
    await waitFor(() => expect(order(canvasElement, "done")).toEqual(["plants"]));
    await expect(within(canvas.getByRole("region", { name: "Done" })).getByRole("article", { name: "Water plants" })).toBeVisible();
  },
};
export const TasksPointerMoveReorderTouchCancel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    // Synthetic Storybook pointers have no native capture; actual hardware pointers use capture.
    const original = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    try {
      const handle = canvas.getByRole("button", { name: "Move Water plants" });
      const laundry = canvas.getByRole("article", { name: "Fold laundry" }).getBoundingClientRect();
      fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, button: 0, clientX: laundry.left + 20, clientY: laundry.top + 20 });
      fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientX: laundry.left + 20, clientY: laundry.top + 2 });
      await expect(canvas.getByRole("img", { name: "Drop in To do, position 1" })).toBeVisible();
      fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientX: laundry.left + 20, clientY: laundry.top + 2 });
      await waitFor(() => expect(order(canvasElement, "todo")).toEqual(["plants", "laundry"]));
      await waitFor(() => expect(handle).toBeEnabled());
      const done = canvas.getByRole("region", { name: "Done" }).getBoundingClientRect();
      fireEvent.pointerDown(handle, { pointerId: 2, isPrimary: true, pointerType: "touch", button: 0, clientX: laundry.left + 20, clientY: laundry.top + 20 });
      fireEvent.pointerMove(handle, { pointerId: 2, isPrimary: true, pointerType: "touch", clientX: done.left + 50, clientY: done.top + 100 });
      fireEvent.pointerCancel(handle, { pointerId: 2, pointerType: "touch" });
      await expect(writes).toHaveBeenCalledTimes(1);
      await expect(order(canvasElement, "done")).toEqual([]);
      fireEvent.pointerDown(handle, { pointerId: 3, isPrimary: true, pointerType: "touch", button: 0, clientX: laundry.left + 20, clientY: laundry.top + 20 });
      fireEvent.pointerMove(handle, { pointerId: 3, isPrimary: true, pointerType: "touch", clientX: done.left + 50, clientY: done.top + 100 });
      fireEvent.pointerUp(handle, { pointerId: 3, isPrimary: true, pointerType: "touch", clientX: done.left + 50, clientY: done.top + 100 });
      await waitFor(() => expect(order(canvasElement, "done")).toEqual(["plants"]));
      await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).toBeNull();
    } finally { HTMLElement.prototype.setPointerCapture = original; }
  },
};
export const TasksRecurringCompletion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    canvas.getByRole("button", { name: "Move Set the table" }).focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await waitFor(() => expect(order(canvasElement, "done")).toEqual(["table"]));
    await expect(order(canvasElement, "todo")).toContain("table-next");
    await expect(canvas.getAllByRole("article", { name: "Set the table" })).toHaveLength(2);
    const done = within(canvas.getByRole("region", { name: "Done" }));
    await waitFor(() => expect(done.getByRole("button", { name: "Edit Set the table" })).toBeEnabled());
    await userEvent.click(done.getByRole("button", { name: "Edit Set the table" }));
    const dialog = await editor(canvasElement, "Edit task");
    await expect(dialog.getByRole("combobox", { name: "Repeat" })).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => expect(dialog.getByText("Repeat cannot be changed after completion; edit the next open occurrence instead.")).toBeVisible());
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};
export const TasksPointerOutsideNoOpAndKeyboardInterference: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const original = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    try {
      const handle = canvas.getByRole("button", { name: "Move Water plants" });
      const rect = handle.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      fireEvent.pointerDown(handle, { pointerId: 4, isPrimary: true, pointerType: "touch", button: 0, clientX: x, clientY: y });
      fireEvent.pointerUp(handle, { pointerId: 4, isPrimary: true, pointerType: "touch", clientX: x, clientY: y });
      await expect(writes).not.toHaveBeenCalled();
      const done = canvas.getByRole("region", { name: "Done" }).getBoundingClientRect();
      fireEvent.pointerDown(handle, { pointerId: 5, isPrimary: true, button: 0, clientX: x, clientY: y });
      fireEvent.pointerMove(handle, { pointerId: 5, isPrimary: true, clientX: done.left + 50, clientY: done.top + 100 });
      fireEvent.keyDown(canvas.getByRole("button", { name: "Move Fold laundry" }), { key: "Enter" });
      fireEvent.keyDown(handle, { key: "Enter" });
      await expect(writes).not.toHaveBeenCalled();
      await expect(canvas.getByRole("img", { name: "Drop in Done, position 1" })).toBeVisible();
      fireEvent.pointerUp(handle, { pointerId: 5, isPrimary: true, clientX: done.left + 50, clientY: done.bottom + 40 });
      await expect(canvas.queryByRole("img", { name: "Drop in Done, position 1" })).toBeNull();
      await expect(writes).not.toHaveBeenCalled();
      fireEvent.pointerDown(handle, { pointerId: 6, isPrimary: true, button: 0, clientX: x, clientY: y });
      fireEvent.pointerMove(handle, { pointerId: 6, isPrimary: true, clientX: done.left + 50, clientY: done.top + 100 });
      fireEvent.pointerMove(handle, { pointerId: 6, isPrimary: true, clientX: done.right + 80, clientY: done.top + 100 });
      await expect(canvas.queryByRole("img", { name: "Drop in Done, position 1" })).toBeNull();
      fireEvent.pointerUp(handle, { pointerId: 6, isPrimary: true, clientX: done.right + 80, clientY: done.top + 100 });
      await expect(writes).not.toHaveBeenCalled();
      await expect(order(canvasElement, "todo")).toEqual(["laundry", "plants"]);
    } finally { HTMLElement.prototype.setPointerCapture = original; }
  },
};
export const TasksMoveFailureRetry: Story = {
  parameters: { taskMock: { failSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    canvas.getByRole("button", { name: "Move Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Task service unavailable");
    await expect(order(canvasElement, "todo")).toEqual(["laundry", "plants"]);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Move Water plants" })).toBeEnabled());
    await expect(canvas.getByRole("button", { name: "Move Water plants" })).toHaveFocus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await waitFor(() => expect(order(canvasElement, "in_progress")).toEqual(["table", "plants"]));
  },
};
export const TasksBusyLockAndSessionCancellation: Story = {
  args: { switchSession: true },
  parameters: { taskMock: { delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    canvas.getByRole("button", { name: "Move Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await expect(canvas.getByRole("button", { name: "Add task" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Edit Fold laundry" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add task" })).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 450));
    await expect(canvas.queryByRole("article")).toBeNull();
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(writes).toHaveBeenCalledTimes(1);
  },
};
export const TasksSessionIsolation: Story = {
  args: { switchSession: true },
  parameters: { taskMock: { delayed: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add task" })).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 450));
    await expect(canvas.queryByRole("article")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Add task" }));
    const dialog = await editor(canvasElement);
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Unsaved old session");
    fireEvent.click(canvas.getByRole("button", { name: "Refresh session", hidden: true }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("dialog", { name: "Add task" })).toBeNull());
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add task" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Add task" }));
    await expect((await editor(canvasElement)).getByRole("textbox", { name: "Title" })).toHaveValue("");
  },
};
