import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import {
  ChildcareSettings, type ChildcareArrangement, type ChildcareData, type ChildcareOccurrence,
  type ChildcareOverride, type ChildcareRequest,
} from "./ChildcareSettings";

const householdId = "00000000-0000-0000-0000-000000000001";
const providerId = "00000000-0000-0000-0000-000000000002";
const arrangementId = "00000000-0000-0000-0000-000000000003";
const members = [
  { id: "00000000-0000-0000-0000-000000000004", firstName: "Alex", avatarColor: "#3b82f6", visibleInCalendar: true, order: 0 },
  { id: "00000000-0000-0000-0000-000000000005", firstName: "Sam", avatarColor: "#8b5cf6", visibleInCalendar: true, order: 1 },
];
const date = (offset = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};
const calls = fn();

function resolve(data: ChildcareData, startDate: string, endDate: string): ChildcareOccurrence[] {
  const results: ChildcareOccurrence[] = [];
  for (const arrangement of data.arrangements) {
    // Include moved source dates outside the requested range in this demo response.
    const sourceDates = new Set(data.overrides.filter((item) => item.arrangementId === arrangement.id).map((item) => item.originalDate));
    for (let timestamp = Date.parse(startDate); timestamp <= Date.parse(endDate); timestamp += 86400000) {
      sourceDates.add(new Date(timestamp).toISOString().slice(0, 10));
    }
    for (const originalDate of sourceDates) {
      const override = data.overrides.find((item) => item.arrangementId === arrangement.id && item.originalDate === originalDate);
      const scheduled = originalDate >= arrangement.startDate && (!arrangement.endDate || originalDate <= arrangement.endDate)
        && arrangement.weekdays.includes(new Date(`${originalDate}T00:00:00Z`).getUTCDay() || 7);
      if (!scheduled && override?.action !== "add") continue;
      const effectiveDate = override?.action === "move" ? override.movedDate! : originalDate;
      if (override?.action === "cancel" || effectiveDate < startDate || effectiveDate > endDate) continue;
      results.push({
        id: `${arrangement.id}:${originalDate}`, arrangementId: arrangement.id!, originalDate, date: effectiveDate,
        providerId: override?.providerId ?? arrangement.providerId, childIds: arrangement.childIds,
        allDay: override?.allDay ?? arrangement.allDay,
        startTime: override?.allDay == null ? arrangement.startTime : override.startTime ?? null,
        endTime: override?.allDay == null ? arrangement.endTime : override.endTime ?? null,
        overrideAction: override?.action ?? null,
      });
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

function createMockRequest(empty: boolean, fail: boolean, weekdays = [1, 2, 3, 4, 5, 6, 7]): ChildcareRequest {
  const data: ChildcareData = {
    providers: [{ id: providerId, name: "Grandma Jo", type: "grandparent", active: true }],
    arrangements: empty ? [] : [{
      id: arrangementId, providerId, childIds: members.map((member) => member.id), weekdays,
      startDate: date(-30), endDate: null, allDay: false, startTime: "09:00", endTime: "16:00",
    }],
    overrides: empty ? [] : [
      { arrangementId, originalDate: date(1), action: "cancel" },
      { arrangementId, originalDate: date(2), action: "move", movedDate: date(3) },
      { arrangementId, originalDate: date(4), action: "replace", allDay: false, startTime: "10:00", endTime: "15:00" },
    ],
  };
  const validateSavedOverrides = (draft: ChildcareArrangement) => {
    const current = data.arrangements.find((item) => item.id === draft.id);
    if (draft.id && data.overrides.some((item) => item.arrangementId === draft.id && item.action !== "add"
      && !(item.action === "cancel" && current && !(item.originalDate >= current.startDate
        && (!current.endDate || item.originalDate <= current.endDate)
        && current.weekdays.includes(new Date(`${item.originalDate}T00:00:00Z`).getUTCDay() || 7))) &&
      (item.originalDate < draft.startDate || (draft.endDate && item.originalDate > draft.endDate) ||
        !draft.weekdays.includes(new Date(`${item.originalDate}T00:00:00Z`).getUTCDay() || 7)))) {
      throw new Error("schedule change would remove an occurrence with a one-off change; keep its weekday and effective dates");
    }
  };
  return async (path, init = {}) => {
    calls(path, init);
    if (fail) throw new Error("Could not load childcare. Check your connection.");
    const url = new URL(path, "http://storybook.local");
    const resource = url.pathname.split("/childcare")[1].replace(/^\//, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (init.method === "POST" && resource === "preview") {
      const draft = { ...body.arrangement, id: body.arrangement.id ?? "preview" } as ChildcareArrangement;
      validateSavedOverrides(draft);
      return { occurrences: resolve({ ...data, arrangements: [draft] }, body.startDate, body.endDate) };
    }
    if (init.method === "POST" && resource === "providers") {
      const provider = { ...body, id: crypto.randomUUID(), active: true };
      data.providers.push(provider); return provider;
    }
    if (init.method === "POST" && resource === "arrangements") {
      const arrangement = { ...body, id: crypto.randomUUID() };
      data.arrangements.push(arrangement); return arrangement;
    }
    if (init.method === "PUT" && ["providers", "arrangements"].includes(resource)) {
      if (resource === "arrangements") validateSavedOverrides(body);
      const records = resource === "providers" ? data.providers : data.arrangements;
      const record = records.find((item) => item.id === body.id)!;
      Object.assign(record, body); return record;
    }
    if (init.method === "PUT" && resource === "overrides") {
      data.overrides = data.overrides.filter((item) => item.arrangementId !== body.arrangementId || item.originalDate !== body.originalDate);
      data.overrides.push(body as ChildcareOverride); return body;
    }
    if (resource === "occurrences") {
      return { occurrences: resolve(data, url.searchParams.get("startDate")!, url.searchParams.get("endDate")!) };
    }
    return structuredClone(data);
  };
}

function ChildcareStory({ empty = false, fail = false, weekdays }: { empty?: boolean; fail?: boolean; weekdays?: number[] }) {
  const request = useMemo(() => createMockRequest(empty, fail, weekdays), [empty, fail, weekdays]);
  return <div className="app-shell" style={{ padding: 24 }}>
    <section className="settings-section">
      <ChildcareSettings householdId={householdId} members={members} request={request} />
    </section>
  </div>;
}
const meta: Meta<typeof ChildcareStory> = {
  title: "Settings/Childcare",
  component: ChildcareStory,
  parameters: { layout: "fullscreen" },
  beforeEach: () => { calls.mockClear(); },
};
export default meta;
type Story = StoryObj<typeof ChildcareStory>;

export const ProvidersAndCare: Story = {};
const providerScheduleData: ChildcareData = {
  providers: [
    { id: providerId, name: "Grandma Jo", type: "grandparent", active: false },
    { id: "daycare", name: "Sunny daycare", type: "daycare", active: true },
    { id: "empty-provider", name: "Unscheduled carer", type: "other", active: true },
  ],
  arrangements: [
    { id: arrangementId, providerId, childIds: members.map((member) => member.id), weekdays: [1, 2, 3, 4, 5, 6, 7],
      startDate: "2026-10-01", endDate: "2026-10-05", allDay: false, startTime: "09:00", endTime: "16:00" },
    { id: "outside-range", providerId: "daycare", childIds: members.map((member) => member.id), weekdays: [3],
      startDate: "2026-09-30", endDate: "2026-09-30", allDay: true, startTime: null, endTime: null },
    { id: "all-day", providerId, childIds: [members[0].id], weekdays: [5],
      startDate: "2026-10-09", endDate: "2026-10-09", allDay: true, startTime: null, endTime: null },
  ],
  overrides: [
    { arrangementId, originalDate: "2026-10-02", action: "cancel" },
    { arrangementId, originalDate: "2026-10-03", action: "replace", providerId: "daycare", allDay: true },
    { arrangementId, originalDate: "2026-10-04", action: "move", movedDate: "2026-10-07", providerId: "daycare" },
    { arrangementId, originalDate: "2026-10-08", action: "add", allDay: true },
    { arrangementId: "outside-range", originalDate: "2026-09-30", action: "move", movedDate: "2026-10-06", providerId },
  ],
};
const providerScheduleRequest: ChildcareRequest = async (path) => {
  const url = new URL(path, "http://storybook.local");
  return url.pathname.endsWith("/occurrences")
    ? { occurrences: resolve(providerScheduleData, url.searchParams.get("startDate")!, url.searchParams.get("endDate")!) }
    : structuredClone(providerScheduleData);
};
const chooseScheduleOption = async (canvasElement: HTMLElement, label: string, option: string) => {
  await userEvent.click(within(canvasElement).getByRole("combobox", { name: label }));
  await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("option", { name: option }));
};
const showOctoberSchedule = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await waitFor(() => expect(canvas.getByLabelText("Range start")).toBeEnabled());
  await fireEvent.change(canvas.getByLabelText("Range start"), { target: { value: "2026-10-01" } });
  await fireEvent.change(canvas.getByLabelText("Range end"), { target: { value: "2026-10-31" } });
  await userEvent.click(canvas.getByRole("button", { name: "Show care" }));
  await waitFor(() => expect(canvas.getByRole("button", { name: "Show care" })).toBeEnabled());
};
export const ProviderSchedule: Story = {
  render: () => <div className="app-shell" style={{ padding: 24 }}><section className="settings-section">
    <ChildcareSettings householdId={householdId} members={members} request={providerScheduleRequest} />
  </section></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await showOctoberSchedule(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "View schedule for Grandma Jo" }));
    const list = within(canvas.getByRole("table", { name: "Childcare occurrences" }));
    await expect(list.getAllByRole("row")).toHaveLength(6);
    for (const day of ["2026-10-01", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]) {
      await expect(list.getByText(day)).toBeInTheDocument();
    }
    for (const day of ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-07"]) {
      await expect(list.queryByText(day)).not.toBeInTheDocument();
    }
    await expect(list.getAllByText("Alex, Sam")).toHaveLength(4);
    await expect(list.getByText("Added day")).toBeInTheDocument();
    await expect(list.getAllByText("All day")).toHaveLength(3);
    await expect(list.getAllByText("09:00–16:00")).toHaveLength(2);
    await chooseScheduleOption(canvasElement, "Schedule view", "Calendar");
    const calendar = within(canvas.getByRole("table", { name: /Provider care calendar/ }));
    await expect(calendar.getAllByText("Grandma Jo")).toHaveLength(5);
    await expect(calendar.getAllByText("Alex, Sam")).toHaveLength(4);
    await expect(calendar.getAllByText("All day")).toHaveLength(3);
    await expect(calendar.getAllByText("09:00–16:00")).toHaveLength(2);
    await expect(within(calendar.getByRole("cell", { name: "2026-10-06" })).getByText("Originally 2026-09-30")).toBeInTheDocument();
    await expect(within(calendar.getByRole("cell", { name: "2026-10-02" })).queryByText("Grandma Jo")).not.toBeInTheDocument();
    await chooseScheduleOption(canvasElement, "Schedule provider", "Sunny daycare");
    await expect(calendar.getAllByText("Sunny daycare")).toHaveLength(2);
    await expect(within(calendar.getByRole("cell", { name: "2026-10-03" })).getByText("Changed · replace")).toBeInTheDocument();
    await expect(within(calendar.getByRole("cell", { name: "2026-10-07" })).getByText("Originally 2026-10-04")).toBeInTheDocument();
    await chooseScheduleOption(canvasElement, "Schedule provider", "Unscheduled carer");
    await expect(canvas.getByText("No care occurrences in this range.")).toBeInTheDocument();
    await chooseScheduleOption(canvasElement, "Schedule view", "List");
    await expect(canvas.queryByRole("table", { name: "Childcare occurrences" })).not.toBeInTheDocument();
    for (const label of ["This week", "This month", "Upcoming 30 days"]) {
      await expect(canvas.queryByRole("button", { name: label })).not.toBeInTheDocument();
      await expect(canvas.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    await expect(canvas.getByLabelText("Range start")).toHaveValue("2026-10-01");
    await expect(canvas.getByLabelText("Range end")).toHaveValue("2026-10-31");
    await fireEvent.change(canvas.getByLabelText("Range end"), { target: { value: "2020-01-01" } });
    await expect(canvas.getByRole("button", { name: "Show care" })).toBeDisabled();
    await showOctoberSchedule(canvasElement);
    await chooseScheduleOption(canvasElement, "Schedule provider", "Grandma Jo (Inactive)");
    await chooseScheduleOption(canvasElement, "Schedule view", "Calendar");
  },
};
export const ProviderScheduleRetry: Story = {
  render: () => {
    const request = useMemo(() => {
      let failed = false;
      return async (path: string) => {
        if (path.includes("endDate=2026-11-30") && !failed) {
          failed = true;
          throw new Error("Schedule connection lost.");
        }
        return providerScheduleRequest(path);
      };
    }, []);
    return <ChildcareSettings householdId={householdId} members={members} request={request} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await showOctoberSchedule(canvasElement);
    await expect(canvas.getByRole("table", { name: "Childcare occurrences" })).toBeInTheDocument();
    await fireEvent.change(canvas.getByLabelText("Range end"), { target: { value: "2026-11-30" } });
    await userEvent.click(canvas.getByRole("button", { name: "Show care" }));
    await canvas.findByText("Schedule connection lost.");
    await expect(canvas.queryByRole("table", { name: "Childcare occurrences" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await canvas.findByRole("table", { name: "Childcare occurrences" });
    await expect(canvas.getByText("Showing 2026-10-01 – 2026-11-30")).toBeInTheDocument();
    await expect(canvas.queryByText("Schedule connection lost.")).not.toBeInTheDocument();
  },
};
export const ProviderCalendarBoundaries: Story = {
  render: () => <ChildcareSettings householdId={householdId} members={members} request={providerScheduleRequest} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByLabelText("Range start")).toBeEnabled());
    await chooseScheduleOption(canvasElement, "Schedule view", "Calendar");
    for (const [start, end, months] of [
      ["2028-02-01", "2028-03-01", 2], ["9999-12-01", "9999-12-31", 1],
    ] as const) {
      await fireEvent.change(canvas.getByLabelText("Range start"), { target: { value: start } });
      await fireEvent.change(canvas.getByLabelText("Range end"), { target: { value: end } });
      await userEvent.click(canvas.getByRole("button", { name: "Show care" }));
      await waitFor(() => expect(canvas.getByRole("button", { name: "Show care" })).toBeEnabled());
      await expect(canvas.getAllByRole("table", { name: /Provider care calendar/ })).toHaveLength(months);
      await expect(canvas.getByRole("cell", { name: start === "2028-02-01" ? "2028-02-29" : end })).toBeInTheDocument();
    }
  },
};
export const SettingsGridStyling: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("table", { name: "Childcare occurrences" });
    for (const heading of ["Providers", "Weekly arrangements", "Resolved care"]) {
      const title = canvas.getByRole("heading", { name: heading, level: 2 });
      await expect(title.parentElement).toHaveClass("section-toolbar");
      await expect(title.closest("section")).toHaveClass("settings-card");
    }
    for (const [name, text] of [["Add provider", "+ Provider"], ["Add arrangement", "+ Arrangement"]]) {
      const add = canvas.getByRole("button", { name });
      await expect(add).toHaveClass("primary-pill", "no-wrap-button");
      await expect(add).toHaveTextContent(text);
      await expect(getComputedStyle(add).whiteSpace).toBe("nowrap");
    }
    await expect(canvas.getByRole("button", { name: "Show care" })).toHaveClass("primary-pill", "no-wrap-button");
    for (const name of ["Childcare providers", "Childcare arrangements", "Childcare occurrences"]) {
      const table = canvas.getByRole("table", { name });
      await expect(table).toHaveClass("settings-table");
      const actions = within(table).getByRole("columnheader", { name: "Actions" });
      await expect(actions).toHaveClass("actions-column");
      await expect(getComputedStyle(actions).textAlign).toBe("right");
      for (const button of within(table).getAllByRole("button")) {
        await expect(button).toHaveClass("icon-button", "compact-icon-button");
        await expect(button.textContent).toBe("");
        await expect(getComputedStyle(button).width).toBe("32px");
        await expect(button.parentElement).toHaveClass("icon-actions");
        await expect(getComputedStyle(button.parentElement!).justifyContent).toBe("flex-end");
        await expect(button.closest("td")).toHaveClass("actions-cell");
        await expect(getComputedStyle(button.closest("td")!).textAlign).toBe("right");
        await expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      }
    }
    for (const name of ["Edit provider Grandma Jo", "Edit arrangement for Grandma Jo", `Change care on ${date()} for Grandma Jo`]) {
      await expect(canvas.getByRole("button", { name }).querySelector("svg")).toHaveAttribute("data-testid", "EditOutlinedIcon");
    }
    await expect(canvas.getByRole("button", { name: "Deactivate" }).querySelector("svg")).toHaveAttribute("data-testid", "BlockIcon");
  },
};
export const LoadingError: Story = { args: { fail: true } };
export const LocalDateDefaults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("table", { name: "Childcare occurrences" });
    const end = new Date();
    const day = end.getDate();
    end.setDate(1);
    end.setMonth(end.getMonth() + 3);
    const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(day, lastDay) - 1);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    await expect(canvas.getByLabelText("Range start")).toHaveValue(date());
    await expect(canvas.getByLabelText("Range end")).toHaveValue(endDate);
    await expect(canvas.getByRole("combobox", { name: "Schedule view" })).toHaveTextContent("List");
    await expect(canvas.queryByRole("table", { name: /Provider care calendar/ })).not.toBeInTheDocument();
    await expect(calls.mock.calls.some(([path]) => String(path).includes(`/occurrences?startDate=${date()}&endDate=${endDate}`))).toBe(true);
  },
};
export const HistoricalCareReadOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reload = await canvas.findByRole("button", { name: "Show care" });
    await waitFor(() => expect(reload).toBeEnabled());
    await fireEvent.change(canvas.getByLabelText("Range start"), { target: { value: date(-7) } });
    await fireEvent.change(canvas.getByLabelText("Range end"), { target: { value: date(-1) } });
    await userEvent.click(reload);
    const care = within(await canvas.findByRole("table", { name: "Childcare occurrences" }));
    await expect(care.queryByRole("button", { name: /Change care/ })).not.toBeInTheDocument();
    await expect(care.getAllByText("History · read only").length).toBeGreaterThan(0);
    await expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT")).toBe(false);
  },
};
export const ProviderLifecycle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const add = await canvas.findByRole("button", { name: "Add provider" });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    const page = within(canvasElement.ownerDocument.body);
    let dialog = within(page.getByRole("dialog"));
    await fireEvent.change(dialog.getByLabelText(/Provider name/), { target: { value: "Sunny daycare" } });
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save provider" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Save provider" }));
    await canvas.findByRole("button", { name: "Edit provider Sunny daycare" });
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit provider Sunny daycare" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Edit provider Sunny daycare" }));
    dialog = within(page.getByRole("dialog"));
    await fireEvent.change(dialog.getByLabelText(/Provider name/), { target: { value: "Sunny care" } });
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save provider" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Save provider" }));
    const edit = await canvas.findByRole("button", { name: "Edit provider Sunny care" });
    const row = within(edit.closest("tr")!);
    await waitFor(() => expect(row.getByRole("button", { name: "Deactivate" })).toBeEnabled());
    await userEvent.click(row.getByRole("button", { name: "Deactivate" }));
    await row.findByText("Inactive");
    await expect(row.getByRole("button", { name: "Reactivate" })).toHaveClass("icon-button", "compact-icon-button");
    await expect(row.getByRole("button", { name: "Reactivate" }).querySelector("svg")).toHaveAttribute("data-testid", "CheckCircleOutlineOutlinedIcon");
    await waitFor(() => expect(row.getByRole("button", { name: "Reactivate" })).toBeEnabled());
    await userEvent.click(row.getByRole("button", { name: "Reactivate" }));
    await row.findByText("Active");
    const updates = calls.mock.calls.filter(([path, init]) => String(path).endsWith("/providers") && init.method === "PUT")
      .map(([, init]) => JSON.parse(init.body));
    await expect(updates.map((body) => body.active)).toEqual([true, false, true]);
    for (const body of updates) {
      await expect(body).toMatchObject({ id: expect.any(String), name: "Sunny care", type: "grandparent" });
    }
  },
};
export const PreviewAndSave: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const add = await canvas.findByRole("button", { name: "Add arrangement" });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeDisabled();
    for (const label of ["Alex", "Sam", "Monday", "Wednesday", "All-day care"]) {
      await userEvent.click(dialog.getByRole("checkbox", { name: label }));
    }
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    await dialog.findByRole("table", { name: "Childcare preview" });
    await expect(dialog.getAllByText("Alex, Sam").length).toBeGreaterThan(0);
    await userEvent.click(dialog.getByRole("checkbox", { name: "Friday" }));
    await expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Save arrangement" }));
    const arrangements = within(await canvas.findByRole("table", { name: "Childcare arrangements" }));
    await arrangements.findByText("Monday, Wednesday, Friday");
    await expect(arrangements.getByText("09:00–17:00")).toBeInTheDocument();
    const previewCall = calls.mock.calls.find(([path, init]) => String(path).endsWith("/preview") && init.method === "POST");
    await expect(JSON.parse(previewCall![1].body).arrangement.childIds).toEqual(members.map((member) => member.id));
  },
};
export const OneOffCancellation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const change = await canvas.findByRole("button", { name: `Change care on ${date()} for Grandma Jo` });
    await waitFor(() => expect(change).toBeEnabled());
    await userEvent.click(change);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(page.getByRole("dialog"));
    await userEvent.click(dialog.getByRole("combobox", { name: "One-off action" }));
    await userEvent.click(page.getByRole("option", { name: "Cancel care" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save one-off change" }));
    await canvas.findByText(`${date()} · Grandma Jo · Alex, Sam · Cancelled`);
    await expect(canvas.queryByRole("button", { name: `Change care on ${date()} for Grandma Jo` })).not.toBeInTheDocument();
    const overrideCall = calls.mock.calls.find(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT");
    await expect(JSON.parse(overrideCall![1].body)).toEqual({ arrangementId, originalDate: date(), action: "cancel" });
  },
};
export const AddAnExtraCareDay: Story = {
  args: { weekdays: [1] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const add = await canvas.findByRole("button", { name: "Add care day to arrangement for Grandma Jo" });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    const dateInput = dialog.getByLabelText("Added care date");
    const addedDate = dateInput.getAttribute("value") ?? (dateInput as HTMLInputElement).value;
    expect(new Date(`${addedDate}T00:00:00Z`).getUTCDay()).not.toBe(1);
    await expect(dialog.getByText("Using Grandma Jo for Alex, Sam · 09:00–16:00. The weekly arrangement stays unchanged.")).toBeInTheDocument();
    const scheduledDate = Array.from({ length: 8 }, (_, offset) => date(offset))
      .find((candidate) => new Date(`${candidate}T00:00:00Z`).getUTCDay() === 1)!;
    await fireEvent.change(dateInput, { target: { value: scheduledDate } });
    await expect(dialog.getByText("This date is already covered by the arrangement.")).toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Add childcare day" })).toBeDisabled();
    await fireEvent.change(dateInput, { target: { value: addedDate } });
    await expect(dialog.getByRole("button", { name: "Add childcare day" })).toBeEnabled();
    await userEvent.click(dialog.getByRole("button", { name: "Add childcare day" }));
    const care = within(await canvas.findByRole("table", { name: "Childcare occurrences" }));
    await care.findByText(addedDate);
    await expect(care.getByText("Added day")).toBeInTheDocument();
    const saved = calls.mock.calls.find(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT");
    await expect(JSON.parse(saved![1].body)).toEqual({
      arrangementId, originalDate: addedDate, action: "add",
    });
  },
};
export const FutureArrangementPreviewRange: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const add = await canvas.findByRole("button", { name: "Add arrangement" });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Alex" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Monday" }));
    await fireEvent.change(dialog.getByLabelText(/Effective start/), { target: { value: date(120) } });
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    await dialog.findByText("No care occurrences in this range.");
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeEnabled());
    await fireEvent.change(dialog.getByLabelText("Preview start"), { target: { value: date(120) } });
    await fireEvent.change(dialog.getByLabelText("Preview end"), { target: { value: date(147) } });
    await expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    await dialog.findByRole("table", { name: "Childcare preview" });
    const previews = calls.mock.calls.filter(([path]) => String(path).endsWith("/preview"));
    await expect(JSON.parse(previews[previews.length - 1][1].body)).toMatchObject({
      startDate: date(120), endDate: date(147), arrangement: { startDate: date(120) },
    });
    await userEvent.click(dialog.getByRole("button", { name: "Save arrangement" }));
    await canvas.findByRole("table", { name: "Childcare arrangements" });
  },
};
export const AllDayArrangementAndReload: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const add = await canvas.findByRole("button", { name: "Add arrangement" });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    for (const label of ["Alex", "Sam", "Tuesday", "Thursday"]) {
      await userEvent.click(dialog.getByRole("checkbox", { name: label }));
    }
    await expect(dialog.getByRole("checkbox", { name: "All-day care" })).toBeChecked();
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    await dialog.findByRole("table", { name: "Childcare preview" });
    await userEvent.click(dialog.getByRole("button", { name: "Save arrangement" }));
    const arrangements = within(await canvas.findByRole("table", { name: "Childcare arrangements" }));
    await arrangements.findByText("Tuesday, Thursday");
    await expect(arrangements.getByText("Alex, Sam")).toBeInTheDocument();
    await expect(arrangements.getByText("All day")).toBeInTheDocument();
    const reload = canvas.getByRole("button", { name: "Show care" });
    await waitFor(() => expect(reload).toBeEnabled());
    await userEvent.click(reload);
    const care = within(await canvas.findByRole("table", { name: "Childcare occurrences" }));
    await expect(care.getAllByText("All day").length).toBeGreaterThan(0);
    await expect(calls.mock.calls.filter(([path, init]) =>
      String(path).endsWith("/childcare") && !init.method).length).toBeGreaterThanOrEqual(3);
    const saved = calls.mock.calls.find(([path, init]) => String(path).endsWith("/arrangements") && init.method === "POST");
    await expect(JSON.parse(saved![1].body)).toMatchObject({
      allDay: true, startTime: null, endTime: null, childIds: members.map((member) => member.id), weekdays: [2, 4],
    });
  },
};
export const EditArrangementWithOverrides: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const edit = await canvas.findByRole("button", { name: "Edit arrangement for Grandma Jo" });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    const preview = within(await dialog.findByRole("table", { name: "Childcare preview" }));
    await expect(preview.getByText("Changed · move")).toBeInTheDocument();
    await expect(preview.getByText("Changed · replace")).toBeInTheDocument();
    await expect(preview.queryByText(date(1))).not.toBeInTheDocument();
    await expect(preview.getAllByText("Alex, Sam").length).toBeGreaterThan(0);
    await userEvent.click(dialog.getByRole("button", { name: "Save arrangement" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) =>
      String(path).endsWith("/arrangements") && init.method === "PUT" && JSON.parse(init.body).id === arrangementId)).toBe(true));
    const previewCall = calls.mock.calls.find(([path]) => String(path).endsWith("/preview"));
    await expect(JSON.parse(previewCall![1].body).arrangement.id).toBe(arrangementId);
  },
};
export const EditArrangementTimingAndParticipants: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const edit = await canvas.findByRole("button", { name: "Edit arrangement for Grandma Jo" });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await expect(dialog.getByRole("checkbox", { name: "All-day care" })).not.toBeChecked();
    await userEvent.click(dialog.getByRole("checkbox", { name: "All-day care" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Sam" }));
    await expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    const preview = within(await dialog.findByRole("table", { name: "Childcare preview" }));
    await expect(preview.getAllByText("Alex").length).toBeGreaterThan(0);
    await expect(preview.queryByText("Alex, Sam")).not.toBeInTheDocument();
    await expect(preview.getAllByText("All day").length).toBeGreaterThan(0);
    await userEvent.click(dialog.getByRole("button", { name: "Save arrangement" }));
    const arrangements = within(await canvas.findByRole("table", { name: "Childcare arrangements" }));
    await arrangements.findByText("Alex");
    await expect(arrangements.getByText("All day")).toBeInTheDocument();
    const update = calls.mock.calls.find(([path, init]) => String(path).endsWith("/arrangements") && init.method === "PUT");
    await expect(JSON.parse(update![1].body)).toMatchObject({
      id: arrangementId, providerId, childIds: [members[0].id], weekdays: [1, 2, 3, 4, 5, 6, 7],
      startDate: date(-30), endDate: null, allDay: true, startTime: null, endTime: null,
    });
    const previewRequest = calls.mock.calls.find(([path]) => String(path).endsWith("/preview"));
    await expect(JSON.parse(previewRequest![1].body).arrangement).toMatchObject({
      id: arrangementId, childIds: [members[0].id], allDay: true, startTime: null, endTime: null,
    });
  },
};
export const OneOffReplacement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const change = await canvas.findByRole("button", { name: `Change care on ${date()} for Grandma Jo` });
    await waitFor(() => expect(change).toBeEnabled());
    await userEvent.click(change);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await expect(dialog.getByText("Participants: Alex, Sam")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("checkbox", { name: "All-day care" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save one-off change" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) =>
      String(path).endsWith("/overrides") && init.method === "PUT")).toBe(true));
    const overrideCall = calls.mock.calls.find(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT");
    await expect(JSON.parse(overrideCall![1].body)).toEqual({
      arrangementId, originalDate: date(), action: "replace", providerId, allDay: true, startTime: null, endTime: null,
    });
  },
};
export const OneOffProviderAndTimingReplacement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const add = await canvas.findByRole("button", { name: "Add provider" });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    let dialog = within(page.getByRole("dialog"));
    await fireEvent.change(dialog.getByLabelText(/Provider name/), { target: { value: "School club" } });
    await waitFor(() => expect(dialog.getByRole("button", { name: "Save provider" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Save provider" }));
    await canvas.findByRole("button", { name: "Edit provider School club" });
    const change = canvas.getByRole("button", { name: `Change care on ${date()} for Grandma Jo` });
    await waitFor(() => expect(change).toBeEnabled());
    await userEvent.click(change);
    dialog = within(page.getByRole("dialog"));
    await userEvent.click(dialog.getByRole("combobox", { name: "Occurrence provider" }));
    const option = page.getByRole("option", { name: "School club" });
    const replacementId = option.getAttribute("data-value");
    await expect(replacementId).toEqual(expect.any(String));
    await userEvent.click(option);
    await fireEvent.change(dialog.getByLabelText(/Start time/), { target: { value: "10:00" } });
    await fireEvent.change(dialog.getByLabelText(/End time/), { target: { value: "17:30" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save one-off change" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT")).toBe(true));
    const saved = calls.mock.calls.find(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT");
    await expect(JSON.parse(saved![1].body)).toEqual({
      arrangementId, originalDate: date(), action: "replace", providerId: replacementId,
      allDay: false, startTime: "10:00", endTime: "17:30",
    });
    const care = within(await canvas.findByRole("table", { name: "Childcare occurrences" }));
    await care.findByText("School club");
    await expect(care.getByText("10:00–17:30")).toBeInTheDocument();
  },
};
export const PreserveSavedOverrides: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const edit = await canvas.findByRole("button", { name: "Edit arrangement for Grandma Jo" });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    const cancelledWeekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
      new Date(`${date(1)}T00:00:00Z`).getUTCDay()
    ];
    await userEvent.click(dialog.getByRole("checkbox", { name: cancelledWeekday }));
    await userEvent.click(dialog.getByRole("button", { name: "Preview care" }));
    const error = await dialog.findByRole("alert");
    await expect(error).toHaveTextContent("schedule change would remove an occurrence with a one-off change");
    await expect(dialog.getByRole("button", { name: "Save arrangement" })).toBeDisabled();
    await expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/arrangements") && init.method === "PUT")).toBe(false);
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};
export const MoveChangedOccurrence: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const change = await canvas.findAllByRole("button", { name: `Change care on ${date(3)} for Grandma Jo` });
    await waitFor(() => expect(change[0]).toBeEnabled());
    // The first row at this date is the moved occurrence, whose source date must remain unchanged.
    await userEvent.click(change[0]);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(page.getByRole("dialog"));
    await expect(dialog.getByText(`Original scheduled date: ${date(2)}. Weekly care remains unchanged.`)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("combobox", { name: "One-off action" }));
    await userEvent.click(page.getByRole("option", { name: "Move care date" }));
    const moved = dialog.getByLabelText(/Moved date/);
    await fireEvent.change(moved, { target: { value: date(5) } });
    await expect(moved).toHaveValue(date(5));
    await userEvent.click(dialog.getByRole("button", { name: "Save one-off change" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/overrides")
      && JSON.parse(init.body).originalDate === date(2) && JSON.parse(init.body).movedDate === date(5))).toBe(true));
  },
};
export const EditMovedCarePreservesDate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = await canvas.findAllByRole("button", { name: `Change care on ${date(3)} for Grandma Jo` });
    await waitFor(() => expect(buttons[0]).toBeEnabled());
    await userEvent.click(buttons[0]);
    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await expect(dialog.getByRole("combobox", { name: "One-off action" })).toHaveTextContent("Move care date");
    await expect(dialog.getByText(`Effective care date: ${date(3)}.`)).toBeInTheDocument();
    await expect(dialog.getByLabelText(/Moved date/)).toHaveValue(date(3));
    await userEvent.click(dialog.getByRole("checkbox", { name: "All-day care" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save one-off change" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT")).toBe(true));
    const saved = calls.mock.calls.find(([path, init]) => String(path).endsWith("/overrides") && init.method === "PUT");
    await expect(JSON.parse(saved![1].body)).toMatchObject({
      action: "move", originalDate: date(2), movedDate: date(3), allDay: true, startTime: null, endTime: null,
    });
  },
};
