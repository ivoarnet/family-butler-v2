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
const longTitle = "A very long task title ".repeat(7).trim();
type MockOptions = { failSave?: boolean; conflict?: boolean; failRefresh?: boolean; delayed?: boolean; delayedMutation?: boolean; dark?: boolean; longTitle?: boolean; manyTasks?: boolean };
const writes = fn();

function installMock(options: MockOptions = {}) {
  writes.mockClear();
  const original = window.fetch;
  let tasks = structuredClone(initialTasks);
  if (options.longTitle) { tasks[0].title = longTitle; tasks[0].coins = 1000000; }
  if (options.manyTasks) tasks.push(...Array.from({ length: 24 }, (_, index) => ({
    ...initialTasks[1], id: `extra-${index}`, title: `Extra task ${index + 1}`, sortOrder: index + 2,
  })));
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
      return response({
        tasks: url.pathname.includes("/other/") ? [] : tasks,
        leaderboard: {
          week: [
            { memberId: "alex", firstName: "Alex", avatarColor: "#3b82f6", coins: 7 },
            { memberId: "sam", firstName: "Sam", avatarColor: "#f97316", coins: 5 },
            { memberId: "jordan", firstName: "Jordan", avatarColor: "#ec4899", coins: 3 },
          ],
          month: [
            { memberId: "sam", firstName: "Sam", avatarColor: "#f97316", coins: 12 },
            { memberId: "alex", firstName: "Alex", avatarColor: "#3b82f6", coins: 9 },
            { memberId: "jordan", firstName: "Jordan", avatarColor: "#ec4899", coins: 6 },
          ],
        },
      });
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
      expect(Object.keys(body).sort()).toEqual(["coins", "dueDate", "id", "memberId", "repeatRule", "revision", "status", "title"]);
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

function TaskStory({ noMembers = false, switchSession = false, boardWidth, avatarPhoto = false }: { noMembers?: boolean; switchSession?: boolean; boardWidth?: number; avatarPhoto?: boolean }) {
  const [householdId, setHouseholdId] = useState("demo");
  const [token, setToken] = useState("storybook-task-session");
  return <div className="app-shell" style={boardWidth ? { width: boardWidth, maxWidth: "100%" } : undefined}>
    {switchSession && <>
      <button onClick={() => setHouseholdId("other")}>Switch household</button>
      <button onClick={() => setToken("storybook-task-refreshed-session")}>Refresh session</button>
    </>}
    <TasksPage householdId={householdId} householdName="The Riverstone household" accessToken={token}
      members={noMembers ? [] : avatarPhoto ? members.map((member) => ({ ...member, avatarPhotoUrl: "/family-coin.svg" })) : members}
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
const assertRewardHeader = async (card: HTMLElement) => {
  const reward = card.querySelector<HTMLElement>('[role="img"][aria-label$="coins"]')!;
  const title = card.querySelector("h3")!.getBoundingClientRect();
  const coins = reward.getBoundingClientRect();
  const bounds = card.getBoundingClientRect();
  await expect(coins.left).toBeGreaterThanOrEqual(title.right);
  await expect(Math.abs(coins.top - title.top)).toBeLessThan(3);
  await expect(bounds.right - coins.right).toBeLessThan(30);
  await expect(card.querySelector('[data-testid="DragIndicatorIcon"]')).toBeNull();
};
const assertViewportHeight = async (canvasElement: HTMLElement) => {
  const page = canvasElement.querySelector<HTMLElement>(".tasks-page")!;
  const main = page.querySelector<HTMLElement>(".settings-main")!;
  const board = main.querySelector<HTMLElement>('[aria-label="Task board"]')!;
  const footer = main.querySelector<HTMLElement>('[aria-label="Task leaderboards"]')!;
  const view = canvasElement.ownerDocument.defaultView!;
  const bottomPadding = parseFloat(view.getComputedStyle(main).paddingBottom) + parseFloat(view.getComputedStyle(board).paddingBottom);
  await expect(page.getBoundingClientRect().height).toBeGreaterThanOrEqual(view.innerHeight);
  const bottoms = [...board.querySelectorAll<HTMLElement>("[data-task-column]")].map((lane) => lane.getBoundingClientRect().bottom + view.scrollY);
  for (const bottom of bottoms) {
    await expect(bottom).toBeGreaterThanOrEqual(footer.getBoundingClientRect().top + view.scrollY - bottomPadding - 1);
    await expect(Math.abs(bottom - bottoms[0])).toBeLessThan(1);
  }
};

export const TasksBoard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await assertViewportHeight(canvasElement);
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(canvas.getByRole("region", { name: "Done" })).toHaveTextContent("No tasks");
    const reward = within(canvas.getByRole("article", { name: "Fold laundry" })).getByRole("img", { name: "5 coins" });
    await expect(reward).toHaveTextContent("5");
    await expect(reward).not.toHaveTextContent("coins");
    const coin = reward.querySelector("img")!;
    await expect(coin).toHaveAttribute("src", `${import.meta.env.BASE_URL}family-coin.svg`);
    await expect(coin).toHaveAttribute("alt", "");
    await waitFor(() => expect(coin.naturalWidth).toBeGreaterThan(0));
    await assertRewardHeader(canvas.getByRole("article", { name: "Fold laundry" }));
    await expect(canvas.queryByRole("button", { name: /^Move / })).toBeNull();
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveAttribute("aria-roledescription", "draggable task");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("Alex");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("Repeats weekly");
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveTextContent("Due 02.11.2026");
    await userEvent.click(canvas.getByRole("button", { name: "Alex Riverstone · Open account menu" }));
    await expect(canvas.getByRole("menu", { name: "Account menu" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
  },
};
export const TaskCoinLeaderboards: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const region = canvas.getByRole("region", { name: "Task leaderboards" });
    const week = within(region).getByRole("region", { name: "This week top 3 leader" });
    const month = within(region).getByRole("region", { name: "This month top 3 leader" });
    await expect(within(week).getByText("Alex")).toBeVisible();
    await expect(within(week).getByRole("img", { name: "7 coins earned" })).toBeVisible();
    await expect(within(week).getByText("Sam")).toBeVisible();
    await expect(within(week).getByText("Jordan")).toBeVisible();
    await expect(within(week).getByLabelText("Rank 3")).toBeVisible();
    await expect(within(month).getByText("Sam")).toBeVisible();
    await expect(within(month).getByRole("img", { name: "12 coins earned" })).toBeVisible();
    await expect(within(month).getByText("Alex")).toBeVisible();
    await expect(within(month).getByText("Jordan")).toBeVisible();
    await expect(within(month).getByLabelText("Rank 3")).toBeVisible();
  },
};
export const TasksDarkBoard: Story = { ...TasksBoard, parameters: { taskMock: { dark: true } } };
const assertBoardLayout = async (canvasElement: HTMLElement) => {
  await ready(canvasElement);
  await assertViewportHeight(canvasElement);
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
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const root = canvasElement.ownerDocument.documentElement;
    const board = canvasElement.querySelector<HTMLElement>('[aria-label="Task board"]')!;
    const lanes = [...board.querySelectorAll<HTMLElement>("[data-task-column]")];
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(board.scrollWidth).toBeLessThanOrEqual(board.clientWidth + 1);
    await expect(lanes.map((lane) => getComputedStyle(lane).order)).toEqual(["1", "0", "2"]);
    for (const lane of lanes) {
      await expect(lane.getBoundingClientRect().width).toBeLessThanOrEqual(board.getBoundingClientRect().width + 1);
    }
    const card = canvas.getByRole("article", { name: "Fold laundry" });
    await expect(card.querySelector("[data-task-status-badge]")).toHaveTextContent("To do");
    await expect(getComputedStyle(card.querySelector("[data-task-status-badge]")!).display).toBe("inline-flex");
  },
};
export const TasksTabletWidthLayout: Story = {
  args: { boardWidth: 768 },
  play: async ({ canvasElement }) => assertBoardLayout(canvasElement),
};
export const TasksLongBoardLayout: Story = {
  parameters: { taskMock: { manyTasks: true } },
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await assertViewportHeight(canvasElement);
    const view = canvasElement.ownerDocument.defaultView!;
    const page = canvasElement.querySelector<HTMLElement>(".tasks-page")!;
    const main = page.querySelector<HTMLElement>(".settings-main")!;
    const board = main.querySelector<HTMLElement>('[aria-label="Task board"]')!;
    await expect(page.getBoundingClientRect().height).toBeGreaterThan(view.innerHeight);
    await expect(main.getBoundingClientRect().height).toBeGreaterThan(view.innerHeight);
    await expect(board.scrollHeight).toBeLessThanOrEqual(board.clientHeight + 1);
    for (const lane of board.querySelectorAll<HTMLElement>("[data-task-column]")) {
      await expect(lane.scrollHeight).toBeLessThanOrEqual(lane.clientHeight + 1);
      for (const card of lane.querySelectorAll<HTMLElement>("[data-task-card]")) {
        await expect(card.getBoundingClientRect().bottom).toBeLessThanOrEqual(lane.getBoundingClientRect().bottom - parseFloat(view.getComputedStyle(lane).paddingBottom));
      }
    }
    const last = within(canvasElement).getByRole("article", { name: "Extra task 24" });
    last.scrollIntoView({ block: "end" });
    await waitFor(() => expect(view.scrollY).toBeGreaterThan(0));
    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(view.innerHeight);
    view.scrollTo(0, 0);
  },
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
    await expect(within(await canvas.findByRole("article", { name: "Walk the dog" })).getByRole("img", { name: "4 coins" })).toHaveTextContent("4");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit Walk the dog" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Edit Walk the dog" }));
    dialog = await editor(canvasElement, "Edit task");
    await userEvent.clear(dialog.getByRole("textbox", { name: "Title" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Title" }), "Walk with Sam");
    await userEvent.click(dialog.getByRole("combobox", { name: "Assignee" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("option", { name: "Sam" }));
    await userEvent.click(dialog.getByRole("combobox", { name: "Status" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("option", { name: "In progress" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save task" }));
    await expect(await canvas.findByRole("article", { name: "Walk with Sam" })).toHaveTextContent("Sam");
    await expect(within(canvas.getByRole("region", { name: "In progress" })).getByRole("article", { name: "Walk with Sam" })).toBeVisible();
    await expect(writes.mock.calls[writes.mock.calls.length - 1][0].body.status).toBe("in_progress");
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
    canvas.getByRole("article", { name: "Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowUp}{Enter}");
    await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
    await waitFor(() => expect(order(canvasElement, "todo")).toEqual(["plants", "laundry"]));
    await waitFor(() => expect(canvas.getByRole("article", { name: "Water plants" })).toHaveAttribute("aria-disabled", "false"));
    await expect(canvas.getByRole("article", { name: "Water plants" })).toHaveFocus();
    canvas.getByRole("article", { name: "Water plants" }).focus();
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
      const handle = canvas.getByRole("article", { name: "Water plants" });
      const source = handle.getBoundingClientRect();
      const laundry = canvas.getByRole("article", { name: "Fold laundry" }).getBoundingClientRect();
      fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, button: 0, clientX: source.left + source.width / 2, clientY: source.top + source.height / 2 });
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
      fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientX: laundry.left + 20, clientY: laundry.top + 20 });
      const preview = canvasElement.ownerDocument.querySelector<HTMLElement>("[data-task-drag-preview]")!;
      await expect(canvasElement.ownerDocument.querySelectorAll("[data-task-drag-preview]")).toHaveLength(1);
      await expect(preview).toBeVisible();
      await expect(preview).toHaveTextContent("Water plants");
      await expect(preview).toHaveTextContent("Sam");
      const previewCoin = preview.querySelector<HTMLImageElement>("img[src$='family-coin.svg']")!;
      await expect(previewCoin).not.toBeNull();
      await waitFor(() => expect(previewCoin.naturalWidth).toBeGreaterThan(0));
      await expect(preview).toHaveAttribute("aria-hidden", "true");
      await expect(getComputedStyle(preview).pointerEvents).toBe("none");
      await expect(canvas.getAllByRole("article", { name: "Water plants" })).toHaveLength(1);
      const startY = preview.getBoundingClientRect().top;
      fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientX: laundry.left + 20, clientY: laundry.top + 2 });
      await waitFor(() => expect(Math.round(preview.getBoundingClientRect().top - startY)).toBe(-18));
      await expect(canvas.getByRole("img", { name: "Drop in To do, position 1" })).toBeVisible();
      fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientX: laundry.left + 20, clientY: laundry.top + 2 });
      await waitFor(() => expect(order(canvasElement, "todo")).toEqual(["plants", "laundry"]));
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
      await waitFor(() => expect(handle).toHaveAttribute("aria-disabled", "false"));
      const done = canvas.getByRole("region", { name: "Done" }).getBoundingClientRect();
      const moved = handle.getBoundingClientRect();
      const start = { clientX: moved.left + moved.width / 2, clientY: moved.top + moved.height / 2 };
      fireEvent.pointerDown(handle, { pointerId: 2, isPrimary: true, pointerType: "touch", button: 0, ...start });
      fireEvent.pointerMove(handle, { pointerId: 2, isPrimary: true, pointerType: "touch", clientX: done.left + 50, clientY: done.top + 100 });
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeVisible();
      await expect(canvas.getByRole("region", { name: "Done" })).toHaveAttribute("data-drop-active", "true");
      fireEvent.pointerCancel(handle, { pointerId: 2, pointerType: "touch" });
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
      await expect(canvas.getByRole("region", { name: "Done" })).not.toHaveAttribute("data-drop-active");
      await expect(writes).toHaveBeenCalledTimes(1);
      await expect(order(canvasElement, "done")).toEqual([]);
      fireEvent.pointerDown(handle, { pointerId: 3, isPrimary: true, pointerType: "touch", button: 0, ...start });
      fireEvent.pointerMove(handle, { pointerId: 3, isPrimary: true, pointerType: "touch", clientX: done.left + 50, clientY: done.top + 100 });
      fireEvent.pointerUp(handle, { pointerId: 3, isPrimary: true, pointerType: "touch", clientX: done.left + 50, clientY: done.top + 100 });
      await waitFor(() => expect(order(canvasElement, "done")).toEqual(["plants"]));
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
      await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).toBeNull();
    } finally { HTMLElement.prototype.setPointerCapture = original; }
  },
};
export const TasksRecurringCompletion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    canvas.getByRole("article", { name: "Set the table" }).focus();
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
      const handle = canvas.getByRole("article", { name: "Water plants" });
      const rect = handle.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      fireEvent.pointerDown(handle, { pointerId: 4, isPrimary: true, pointerType: "touch", button: 0, clientX: x, clientY: y });
      fireEvent.pointerUp(handle, { pointerId: 4, isPrimary: true, pointerType: "touch", clientX: x, clientY: y });
      await expect(writes).not.toHaveBeenCalled();
      const done = canvas.getByRole("region", { name: "Done" }).getBoundingClientRect();
      fireEvent.pointerDown(handle, { pointerId: 5, isPrimary: true, button: 0, clientX: x, clientY: y });
      fireEvent.pointerMove(handle, { pointerId: 5, isPrimary: true, clientX: done.left + 50, clientY: done.top + 100 });
      fireEvent.keyDown(canvas.getByRole("article", { name: "Fold laundry" }), { key: "Enter" });
      fireEvent.keyDown(handle, { key: "Enter" });
      await expect(writes).not.toHaveBeenCalled();
      await expect(canvas.getByRole("img", { name: "Drop in Done, position 1" })).toBeVisible();
      fireEvent.pointerUp(handle, { pointerId: 5, isPrimary: true, clientX: done.left + 50, clientY: done.bottom + 40 });
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
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
    canvas.getByRole("article", { name: "Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Task service unavailable");
    await expect(order(canvasElement, "todo")).toEqual(["laundry", "plants"]);
    await waitFor(() => expect(canvas.getByRole("article", { name: "Water plants" })).toHaveAttribute("aria-disabled", "false"));
    await expect(canvas.getByRole("article", { name: "Water plants" })).toHaveFocus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await waitFor(() => expect(order(canvasElement, "in_progress")).toEqual(["table", "plants"]));
  },
};
export const TasksBusyLockAndSessionCancellation: Story = {
  args: { switchSession: true },
  parameters: { taskMock: { delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    canvas.getByRole("article", { name: "Water plants" }).focus();
    await userEvent.keyboard("{Enter}{ArrowRight}{Enter}");
    await expect(canvas.getByRole("button", { name: "Add task" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Edit Fold laundry" })).toBeDisabled();
    await expect(canvas.getByRole("article", { name: "Fold laundry" })).toHaveAttribute("aria-disabled", "true");
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

export const TasksWholeCardDragAreas: Story = {
  args: { avatarPhoto: true },
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const card = canvas.getByRole("article", { name: "Fold laundry" });
    const avatar = await within(card).findByRole("img", { name: "Alex" });
    await waitFor(() => expect((avatar as HTMLImageElement).naturalWidth).toBeGreaterThan(0));
    await expect(avatar).toHaveAttribute("draggable", "false");
    const original = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    try {
      const areas = [
        card.querySelector("h3")!,
        avatar,
        within(card).getByRole("img", { name: "5 coins" }).querySelector("img")!,
        within(card).getByText(/Due 02.11.2026/),
      ];
      for (const [index, area] of areas.entries()) {
        const bounds = area.getBoundingClientRect();
        const start = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
        const pointer = { pointerId: 20 + index, isPrimary: true, button: 0 };
        fireEvent.pointerDown(area, { ...pointer, ...start });
        await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
        fireEvent.pointerMove(card, { ...pointer, clientX: start.clientX + 5, clientY: start.clientY });
        await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
        fireEvent.pointerMove(card, { ...pointer, clientX: start.clientX + 10, clientY: start.clientY });
        const preview = canvasElement.ownerDocument.querySelector<HTMLElement>("[data-task-drag-preview]")!;
        await expect(canvasElement.ownerDocument.querySelectorAll("[data-task-drag-preview]")).toHaveLength(1);
        await expect(preview).toBeVisible();
        await expect(preview).toHaveTextContent("Fold laundry");
        await expect(preview.querySelector('[data-testid="DragIndicatorIcon"]')).toBeNull();
        fireEvent.pointerCancel(card, pointer);
        await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
      }
      await expect(writes).not.toHaveBeenCalled();
      await expect(card.querySelector("img")).toHaveAttribute("draggable", "false");
      await expect(fireEvent.dragStart(card.querySelector("img")!)).toBe(false);
      await expect(fireEvent.dragStart(avatar)).toBe(false);
    } finally { HTMLElement.prototype.setPointerCapture = original; }
  },
};

export const TasksBottomHalfTapNoOp: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const card = canvas.getByRole("article", { name: "Fold laundry" });
    const bounds = card.getBoundingClientRect();
    const original = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    try {
      for (const [index, pointerType] of ["mouse", "touch"].entries()) {
        const pointer = { pointerId: 30 + index, pointerType, isPrimary: true, button: 0, clientX: bounds.left + 20, clientY: bounds.bottom - 10 };
        fireEvent.pointerDown(card, pointer);
        fireEvent.pointerMove(card, { ...pointer, clientY: pointer.clientY - 2 });
        fireEvent.pointerUp(card, pointer);
        await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
        await expect(canvasElement.querySelector("[data-insertion-marker]")).toBeNull();
      }
      fireEvent.pointerDown(card, { pointerId: 32, isPrimary: true, button: 0, clientX: bounds.left + 20, clientY: bounds.bottom - 10 });
      fireEvent.pointerCancel(card, { pointerId: 32 });
      await expect(writes).not.toHaveBeenCalled();
      await expect(order(canvasElement, "todo")).toEqual(["laundry", "plants"]);
    } finally { HTMLElement.prototype.setPointerCapture = original; }
  },
};

export const TasksActionsDoNotDrag: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    const close = async (name: string) => {
      await userEvent.click((await editor(canvasElement, name)).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(canvas.getByRole("button", { name: "Edit Fold laundry" })).toBeVisible());
    };
    for (const [action, dialogName] of [["Edit", "Edit task"], ["Delete", "Delete task?"]]) {
      const button = canvas.getByRole("button", { name: `${action} Fold laundry` });
      const bounds = button.getBoundingClientRect();
      const pointer = { pointerId: 40, isPrimary: true, button: 0, clientX: bounds.left + 10, clientY: bounds.top + 10 };
      fireEvent.pointerDown(button, pointer);
      fireEvent.pointerMove(button, { ...pointer, clientX: pointer.clientX + 20 });
      fireEvent.pointerUp(button, pointer);
      await expect(canvasElement.ownerDocument.querySelector("[data-task-drag-preview]")).toBeNull();
      await userEvent.click(button);
      await close(dialogName);
      button.focus();
      await userEvent.keyboard("{Enter}");
      await close(dialogName);
      button.focus();
      await userEvent.keyboard(" ");
      await close(dialogName);
      await expect(canvasElement.querySelector("[data-insertion-marker]")).toBeNull();
    }
    await expect(writes).not.toHaveBeenCalled();
  },
};

export const TasksLongTitleRewardHeader: Story = {
  args: { boardWidth: 390 },
  parameters: { taskMock: { longTitle: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await canvas.findByRole("article", { name: longTitle });
    await waitFor(() => expect(card).toHaveAttribute("aria-disabled", "false"));
    await assertRewardHeader(card);
    const original = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    try {
      const rect = card.getBoundingClientRect();
      const pointer = { pointerId: 50, isPrimary: true, button: 0, clientX: rect.left + 30, clientY: rect.top + 30 };
      fireEvent.pointerDown(card.querySelector("h3")!, pointer);
      fireEvent.pointerMove(card, { ...pointer, clientX: pointer.clientX + 10 });
      const preview = canvasElement.ownerDocument.querySelector<HTMLElement>("[data-task-drag-preview]")!;
      // Rotation is cosmetic; inspect the shared header's unrotated layout.
      preview.style.transform = "none";
      await assertRewardHeader(preview);
      fireEvent.pointerCancel(card, pointer);
      await expect(writes).not.toHaveBeenCalled();
    } finally { HTMLElement.prototype.setPointerCapture = original; }
  },
};
