import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useMemo, useState } from "react";
import { ParentingTimeSettings, type ParentingTimeRequest } from "./ParentingTimeSettings";
import { afterLocalShareDay, localShareDate } from "../../../shared/ui/ShareLinkDialog";
import type { ShareLink } from "../../../shared/sharing/shareLinks";

const householdId = "00000000-0000-0000-0000-000000000001";
const fatherId = "00000000-0000-0000-0000-000000000002";
const motherId = "00000000-0000-0000-0000-000000000003";
const members = [
  { id: fatherId, firstName: "Dad" },
  { id: motherId, firstName: "Mum" },
  { id: "00000000-0000-0000-0000-000000000007", firstName: "Elsa", isChild: true },
];
const calls = fn();

function ParentingTimeStory({ withPlan = false, failChangeSave = false, withChanges = false }: {
  withPlan?: boolean;
  failChangeSave?: boolean;
  withChanges?: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const request = useMemo(() => {
    let links: ShareLink[] = [];
    const data: {
      parties: Array<{ id: string; name: string; memberId: string | null; active: boolean }>;
      plan: Record<string, unknown> | null;
      changes: Array<{ id: string; partyId: string; startAt: string; endAt: string; label: string; category: string }>;
    } = {
      parties: [
        { id: fatherId, name: "Dad", memberId: fatherId, active: true },
        { id: motherId, name: "Mum", memberId: null, active: true },
      ],
      plan: withPlan ? {
        id: "00000000-0000-0000-0000-000000000006",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        timeZone: "Europe/Zurich",
        recurrenceMode: "alternating",
        rules: [],
        handovers: [],
        active: true,
      } : null,
      changes: withChanges ? [
        { id: "future-handover", partyId: motherId, startAt: new Date(Date.now() + 3 * 86400000).toISOString(),
          endAt: new Date(Date.now() + 4 * 86400000).toISOString(), label: "Handover adjusted from schedule preview", category: "adjusted_handover" },
        { id: "past", partyId: fatherId, startAt: new Date(Date.now() - 3 * 86400000).toISOString(),
          endAt: new Date(Date.now() - 2 * 86400000).toISOString(), label: "Past change", category: "diverse" },
        { id: "future-other", partyId: fatherId, startAt: new Date(Date.now() + 2 * 86400000).toISOString(),
          endAt: new Date(Date.now() + 2.5 * 86400000).toISOString(), label: "Family agreement", category: "holiday" },
        { id: "ongoing", partyId: motherId, startAt: new Date(Date.now() - 86400000).toISOString(),
          endAt: new Date(Date.now() + 86400000).toISOString(), label: "Holiday", category: "holiday" },
      ] : [],
    };
    return (async (path, init = {}) => {
      calls(path, init);
      const url = new URL(path, "http://storybook.local");
      if (url.pathname.endsWith("/share-links")) {
        const payload = init.body ? JSON.parse(String(init.body)) : {};
        if (init.method === "POST") {
          const link = { ...payload, id: `shared-${links.length}`, createdAt: new Date().toISOString() } as ShareLink;
          links.push(link);
          return { link: structuredClone(link), token: "s".repeat(43) };
        }
        if (init.method === "PATCH") {
          const link = links.find((item) => item.id === url.searchParams.get("id"))!;
          Object.assign(link, payload);
          return { link: structuredClone(link) };
        }
        if (init.method === "DELETE") { links = links.filter((link) => link.id !== url.searchParams.get("id")); return; }
        return { links: structuredClone(links) };
      }
      const resource = url.pathname.split("/parenting-time")[1].replace(/^\//, "");
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      if (!resource) return structuredClone(data);
      if (resource === "preview" || resource === "resolve") {
        const rangeStart = resource === "resolve" ? Date.parse(url.searchParams.get("startAt")!) : Date.parse(String(body.startAt));
        const handover = rangeStart + 24 * 60 * 60 * 1000;
        return { intervals: [
          { startAt: new Date(rangeStart).toISOString(), endAt: new Date(handover).toISOString(),
            partyId: fatherId, partyName: "Dad", source: { type: "plan", planId: "story-plan" } },
          { startAt: new Date(handover).toISOString(), endAt: new Date(handover + 48 * 60 * 60 * 1000).toISOString(),
            partyId: motherId, partyName: "Mum", source: { type: "plan", planId: "story-plan" } },
        ] };
      }
      if (resource === "plan" && init.method === "PUT") {
        data.plan = { ...body, id: "00000000-0000-0000-0000-000000000004" };
        return data.plan;
      }
      if (resource === "changes" && init.method === "POST") {
        if (failChangeSave) throw new Error("Could not save new time.");
        data.changes.push({ ...body, id: "00000000-0000-0000-0000-000000000008" } as typeof data.changes[number]);
        return data.changes[data.changes.length - 1];
      }
      if (resource === "changes" && init.method === "PUT") {
        const change = data.changes.find(({ id }) => id === body.id)!;
        Object.assign(change, body);
        return change;
      }
      if (resource === "parties" && init.method === "POST") {
        const party = { ...body, id: "00000000-0000-0000-0000-000000000005" };
        data.parties.push(party as typeof data.parties[number]);
        return party;
      }
      if (resource === "parties" && init.method === "PUT") {
        const party = data.parties.find(({ id }) => id === body.id)!;
        Object.assign(party, body);
        return party;
      }
      return structuredClone(data);
    }) as ParentingTimeRequest;
  }, [failChangeSave, withChanges, withPlan]);
  return <div className="app-shell" style={{ padding: 24 }}>
    <button type="button" onClick={() => setRefresh((current) => current + 1)}>Reload saved settings</button>
    <section className="settings-section">
      <ParentingTimeSettings key={refresh} householdId={householdId}
        members={members} request={request} />
    </section>
  </div>;
}

const meta: Meta<typeof ParentingTimeStory> = {
  title: "Settings/Parenting Time",
  component: ParentingTimeStory,
  parameters: { layout: "fullscreen" },
  beforeEach: () => { calls.mockClear(); },
};
export default meta;
type Story = StoryObj<typeof ParentingTimeStory>;
const chooseHandoverTime = async (canvasElement: HTMLElement, minutesLater = 30) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", {
    name: "Select handover time from Dad to Mum",
  }));
  const initialResolve = [...calls.mock.calls].reverse().find(([path]) => String(path).includes("/resolve?"));
  const firstRangeStart = Date.parse(new URL(String(initialResolve?.[0]), "http://storybook.local").searchParams.get("startAt")!);
  const handoverAt = firstRangeStart + 24 * 60 * 60 * 1000;
  const selectedTime = new Date(handoverAt + minutesLater * 60 * 1000);
  selectedTime.setMinutes(Math.ceil(selectedTime.getMinutes() / 5) * 5, 0, 0);
  const adjustedAt = selectedTime.getTime();
  const picker = canvas.getByRole("group", { name: /New handover time · Dad to Mum/ });
  expect(picker).not.toHaveTextContent(/AM|PM/i);
  const segments = [
    ["Day", String(selectedTime.getDate()).padStart(2, "0")],
    ["Month", String(selectedTime.getMonth() + 1).padStart(2, "0")],
    ["Year", String(selectedTime.getFullYear())],
    ["Hours", String(selectedTime.getHours()).padStart(2, "0")],
    ["Minutes", String(selectedTime.getMinutes()).padStart(2, "0")],
  ];
  for (const [name, value] of segments) {
    const segment = within(picker).getByRole("spinbutton", { name });
    await userEvent.click(segment);
    await userEvent.keyboard(value);
  }
  return { canvas, firstRangeStart, handoverAt, adjustedAt };
};

export const HouseholdPlan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Dad" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Edit parenting party Dad" }));
    const partyDialog = page.getByRole("dialog", { name: "Edit parenting party" });
    await expect(partyDialog).toBeInTheDocument();
    await userEvent.click(within(partyDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Create schedule" })).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Create schedule" }));
    const planDialog = within(page.getByRole("dialog", { name: "Create recurring schedule" }));
    const scheduleInfo = planDialog.getByRole("button", { name: "Schedule scope and legal information" });
    await expect(scheduleInfo).toBeVisible();
    await userEvent.hover(scheduleInfo);
    await expect(await page.findByRole("tooltip")).toHaveTextContent(/not legal advice or proof of custody/);
    await userEvent.unhover(scheduleInfo);
    await userEvent.click(planDialog.getAllByRole("combobox", { name: "From → To" })[0]);
    await expect(page.getByRole("option", { name: "Dad → Mum" })).toBeInTheDocument();
    await expect(page.getByRole("option", { name: "Mum → Dad" })).toBeInTheDocument();
    await expect(page.queryByRole("option", { name: "Dad → Dad" })).not.toBeInTheDocument();
    await expect(page.queryByRole("option", { name: "Mum → Mum" })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("option", { name: "Mum → Dad" }));
    await userEvent.click(planDialog.getByRole("button", { name: "Add handover" }));
    await expect(planDialog.getAllByRole("button", { name: /Remove handover/ })).toHaveLength(5);
    await userEvent.click(planDialog.getAllByRole("button", { name: /Remove handover/ })[4]);
    await userEvent.click(planDialog.getByRole("button", { name: "Preview next 14 days" }));
    await waitFor(() => expect(canvas.getByRole("table", { name: "Parenting-time preview" })).toBeInTheDocument());
    await expect(page.queryByRole("dialog", { name: "Create recurring schedule" })).not.toBeInTheDocument();
    const previewCall = calls.mock.calls.find(([path, init]) => String(path).endsWith("/preview") && init?.method === "POST");
    expect(previewCall).toBeDefined();
    const payload = JSON.parse(String(previewCall?.[1]?.body));
    expect(payload.plan.recurrenceMode).toBe("alternating");
    expect(payload.plan.handovers).toHaveLength(4);
    expect(payload.plan.handovers.map((handover: { weekday: number; time: string; fromPartyId: string;
      toPartyId: string; weekParity: string | null }) =>
      [handover.weekday, handover.time, handover.fromPartyId, handover.toPartyId, handover.weekParity])).toEqual([
      [1, "19:30", motherId, fatherId, null],
      [4, "19:30", motherId, fatherId, null],
      [5, "17:00", fatherId, motherId, "even"],
      [7, "19:30", motherId, fatherId, "even"],
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Create schedule" }));
    const reopenedPlanDialog = within(page.getByRole("dialog", { name: "Create recurring schedule" }));
    await userEvent.click(reopenedPlanDialog.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) =>
      String(path).endsWith("/plan") && init?.method === "PUT")).toBe(true));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add change" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Add change" }));
    const changeDialog = page.getByRole("dialog", { name: "Add change for this period" });
    await expect(changeDialog).toBeInTheDocument();
    await userEvent.click(within(changeDialog).getByRole("button", { name: "Cancel" }));
  },
};

export const ChangeDateTimePicker: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add change" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Add change" }));
    const changeDialog = within(page.getByRole("dialog", { name: "Add change for this period" }));
    await expect(changeDialog.getByRole("textbox", { name: "From" })).toBeInTheDocument();
    await expect(changeDialog.getByRole("textbox", { name: "Until" })).toBeInTheDocument();
    await userEvent.click(changeDialog.getByRole("button", { name: "pick date" }));
    await waitFor(() => expect(page.getByRole("grid")).toBeInTheDocument());
    expect(page.getAllByRole("columnheader").slice(0, 7).map((header) => header.getAttribute("aria-label")))
      .toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    await userEvent.click(page.getByRole("button", { name: "pick time" }));
    await expect(page.getByRole("option", { name: "13 hours" })).toBeInTheDocument();
  },
};

export const UpcomingChanges: Story = {
  args: { withPlan: true, withChanges: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const table = await canvas.findByRole("table", { name: "Parenting-time changes" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("Holiday");
    expect(rows[2]).toHaveTextContent("Family agreement");
    expect(rows[3]).toHaveTextContent("Handover adjusted from schedule preview");
    expect(within(table).queryByText("Past change")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("combobox", { name: "Filter by category" }));
    await userEvent.click(page.getByRole("option", { name: "Holiday" }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("button", { name: "Edit change Family agreement" })).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Filter by category" }));
    await userEvent.click(page.getByRole("option", { name: "All categories" }));
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    await userEvent.click(within(table).getByRole("button", { name: "Edit change Family agreement" }));
    const dialog = within(page.getByRole("dialog", { name: "Edit change for this period" }));
    expect(dialog.getByRole("combobox", { name: "Category" })).toHaveTextContent("Holiday");
    expect(dialog.getByRole("textbox", { name: "Reason or agreement" })).toHaveValue("Family agreement");
    await userEvent.click(dialog.getByRole("combobox", { name: "Category" }));
    await userEvent.click(page.getByRole("option", { name: "Diverse" }));
    expect(dialog.getByRole("textbox", { name: "Reason or agreement" })).toHaveValue("Family agreement");
    await userEvent.click(dialog.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Edit change for this period" })).not.toBeInTheDocument());
    const updatedTable = await canvas.findByRole("table", { name: "Parenting-time changes" });
    expect(within(updatedTable).getByRole("button", { name: "Edit change Family agreement" }).closest("tr")).toHaveTextContent("Diverse");
    await userEvent.click(await canvas.findByRole("button", { name: "Add change" }));
    const addDialog = within(page.getByRole("dialog", { name: "Add change for this period" }));
    const reason = addDialog.getByRole("textbox", { name: "Reason or agreement" });
    expect(reason).toHaveValue("Gemäss Absprache");
    await userEvent.click(addDialog.getByRole("combobox", { name: "Category" }));
    await userEvent.click(page.getByRole("option", { name: "Holiday" }));
    expect(reason).toHaveValue("Gemäss Absprache");
    await userEvent.clear(reason);
    await userEvent.type(reason, "Custom holiday");
    await userEvent.click(addDialog.getByRole("combobox", { name: "Category" }));
    await userEvent.click(page.getByRole("option", { name: "Adjusted Handover" }));
    expect(reason).toHaveValue("Custom holiday");
    await userEvent.clear(reason);
    await userEvent.click(addDialog.getByRole("combobox", { name: "Category" }));
    await userEvent.click(page.getByRole("option", { name: "Diverse" }));
    expect(reason).toHaveValue("");
    expect(addDialog.getByRole("button", { name: "Save change" })).toBeDisabled();
  },
};

export const NoUpcomingChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No upcoming changes.")).toBeVisible();
    expect(canvas.queryByRole("combobox", { name: "Filter by category" })).not.toBeInTheDocument();
  },
};

export const UpcomingHandoverAdjustment: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("region", { name: "Upcoming parenting timeline" })).toBeInTheDocument();
    expect(canvasElement.querySelector(".parenting-timeline-segment span"))
      .not.toHaveTextContent(" – ");
    const initialResolve = calls.mock.calls.find(([path]) => String(path).includes("/resolve?"));
    const initialStart = Date.parse(new URL(String(initialResolve?.[0]), "http://storybook.local").searchParams.get("startAt")!);
    const periodNavigation = canvas.getByRole("group", { name: "Schedule period navigation" });
    expect(periodNavigation).toHaveClass("pill-group", "period-navigation");
    expect(canvas.getByRole("group", { name: "Schedule preview view" })).toHaveClass("pill-group", "view-switcher");
    expect(canvasElement.querySelector(".parenting-preview-content .period-navigation")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "List" }));
    expect(canvas.getByRole("table", { name: "Parenting-time preview" })).toBeInTheDocument();
    expect(canvas.queryByRole("region", { name: "Upcoming parenting timeline" })).toBeNull();
    const beforeEarlierClick = calls.mock.calls.filter(([path]) => String(path).includes("/resolve?")).length;
    await userEvent.click(canvas.getByRole("button", { name: "Show earlier schedule timeslices" }));
    await waitFor(() => expect(calls.mock.calls.filter(([path]) => String(path).includes("/resolve?")).length)
      .toBeGreaterThan(beforeEarlierClick));
    const earlierResolve = [...calls.mock.calls].reverse().find(([path]) => String(path).includes("/resolve?"));
    const earlierStart = new URL(String(earlierResolve?.[0]), "http://storybook.local").searchParams.get("startAt")!;
    const expectedEarlierStart = new Date(initialStart);
    expectedEarlierStart.setDate(expectedEarlierStart.getDate() - 14);
    expect(Date.parse(earlierStart)).toBe(expectedEarlierStart.getTime());
    const beforeCurrentClick = calls.mock.calls.filter(([path]) => String(path).includes("/resolve?")).length;
    await userEvent.click(canvas.getByRole("button", { name: "Show current schedule timeslices" }));
    await waitFor(() => expect(calls.mock.calls.filter(([path]) => String(path).includes("/resolve?")).length)
      .toBeGreaterThan(beforeCurrentClick));
    const currentResolve = [...calls.mock.calls].reverse().find(([path]) => String(path).includes("/resolve?"));
    const currentStart = new URL(String(currentResolve?.[0]), "http://storybook.local").searchParams.get("startAt")!;
    expect(Date.parse(currentStart)).toBe(initialStart);
    await userEvent.click(canvas.getByRole("button", { name: "Timeline" }));
    expect(canvas.getByRole("region", { name: "Upcoming parenting timeline" })).toBeInTheDocument();
    const { firstRangeStart, handoverAt, adjustedAt } = await chooseHandoverTime(canvasElement, 5);
    expect(adjustedAt - handoverAt).toBeGreaterThan(0);
    expect(adjustedAt - handoverAt).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(new Date(adjustedAt).getMinutes() % 5).toBe(0);
    await userEvent.click(canvas.getByRole("button", { name: "Save new time" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) =>
      String(path).endsWith("/changes") && init?.method === "POST")).toBe(true));
    const adjustment = calls.mock.calls.find(([path, init]) =>
      String(path).endsWith("/changes") && init?.method === "POST");
    expect(JSON.parse(String(adjustment?.[1]?.body))).toEqual({
      partyId: fatherId,
      startAt: new Date(handoverAt).toISOString(),
      endAt: new Date(adjustedAt).toISOString(),
      category: "adjusted_handover",
      label: "Handover adjusted from schedule preview",
    });
    const beforeLaterClick = calls.mock.calls.filter(([path]) => String(path).includes("/resolve?")).length;
    await userEvent.click(canvas.getByRole("button", { name: "Show later schedule timeslices" }));
    await waitFor(() => expect(calls.mock.calls.filter(([path]) => String(path).includes("/resolve?")).length)
      .toBeGreaterThan(beforeLaterClick));
    const laterResolve = [...calls.mock.calls].reverse().find(([path]) => String(path).includes("/resolve?"));
    const laterStart = new URL(String(laterResolve?.[0]), "http://storybook.local").searchParams.get("startAt")!;
    const expectedLaterStart = new Date(firstRangeStart);
    expectedLaterStart.setDate(expectedLaterStart.getDate() + 14);
    expect(Date.parse(laterStart)).toBe(expectedLaterStart.getTime());
    expect(canvasElement.querySelector(".parenting-timeline-segment span"))
      .toHaveTextContent(new Intl.DateTimeFormat(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(laterStart)));
  },
};

export const UpcomingHandoverNarrowScreen: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const view = canvasElement.ownerDocument.defaultView!;
    const originalWidth = view.innerWidth;
    const resizeTo = (width: number) => {
      Object.defineProperty(view, "innerWidth", { configurable: true, value: width });
      view.dispatchEvent(new Event("resize"));
    };
    try {
      resizeTo(1280);
      await waitFor(() => expect(canvas.getByRole("region", { name: "Upcoming parenting timeline" })).toBeInTheDocument());
      resizeTo(480);
      await waitFor(() => expect(canvas.getByRole("table", { name: "Parenting-time preview" })).toBeInTheDocument());
      expect(canvas.queryByRole("region", { name: "Upcoming parenting timeline" })).toBeNull();
      expect(canvasElement.querySelector(".parenting-preview-timeline-option")).not.toBeVisible();
      expect(canvas.getByRole("button", { name: "List" })).toBeVisible();
      resizeTo(1280);
      await waitFor(() => expect(canvas.getByRole("region", { name: "Upcoming parenting timeline" })).toBeInTheDocument());
      expect(canvas.getByRole("button", { name: "Timeline" })).toBeVisible();
    } finally {
      resizeTo(originalWidth);
    }
  },
};

export const UpcomingHandoverSaveFailure: Story = {
  args: { withPlan: true, failChangeSave: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", {
      name: "Select handover time from Dad to Mum",
    })).toBeEnabled());
    await chooseHandoverTime(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save new time" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Could not save new time.");
    expect(canvas.getByRole("button", { name: "Save new time" })).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: /New handover time · Dad to Mum/ })).toBeInTheDocument();
  },
};

export const UpcomingHandoverPickerDarkMode: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const root = canvasElement.ownerDocument.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    try {
      await waitFor(() => expect(canvas.getByRole("button", {
        name: "Select handover time from Dad to Mum",
      })).toBeEnabled());
      await userEvent.click(canvas.getByRole("button", {
        name: "Select handover time from Dad to Mum",
      }));
      const field = canvasElement.querySelector(".MuiPickersOutlinedInput-root");
      const outline = field?.querySelector(".MuiPickersOutlinedInput-notchedOutline");
      const icon = field?.querySelector(".MuiIconButton-root .MuiSvgIcon-root");
      expect(field).not.toBeNull();
      expect(outline).not.toBeNull();
      expect(icon).not.toBeNull();
      const expectedColor = canvasElement.ownerDocument.createElement("span");
      expectedColor.style.color = "var(--text-primary)";
      canvasElement.ownerDocument.body.append(expectedColor);
      const primaryColor = getComputedStyle(expectedColor).color;
      expectedColor.remove();
      expect(getComputedStyle(icon!).color).toBe(primaryColor);
      expect(getComputedStyle(icon!).color).not.toBe("rgb(0, 0, 0)");
      expect(getComputedStyle(outline!).borderTopColor).not.toBe("rgb(0, 0, 0)");
      await userEvent.click(canvas.getByRole("button", { name: /Choose date/ }));
      const page = within(canvasElement.ownerDocument.body);
      await waitFor(() => expect(page.getByRole("grid")).toBeInTheDocument());
      const calendar = canvasElement.ownerDocument.body.querySelector(".MuiDateCalendar-root");
      const selectedDay = calendar?.querySelector(".MuiPickerDay-root.Mui-selected");
      const availableDay = calendar?.querySelector(".MuiPickerDay-root:not(.Mui-selected):not(.Mui-disabled)");
      const dialog = canvasElement.ownerDocument.body.querySelector(".MuiDialog-paper");
      expect(selectedDay).not.toBeNull();
      expect(availableDay).not.toBeNull();
      expect(dialog).not.toBeNull();
      expect(getComputedStyle(selectedDay!).color).toBe("rgb(255, 255, 255)");
      expect(getComputedStyle(availableDay!).color).toBe(primaryColor);
      const opaqueSurface = canvasElement.ownerDocument.createElement("span");
      opaqueSurface.style.backgroundColor = "var(--bg)";
      canvasElement.ownerDocument.body.append(opaqueSurface);
      const backgroundColor = getComputedStyle(opaqueSurface).backgroundColor;
      opaqueSurface.remove();
      expect(getComputedStyle(dialog!).backgroundColor).toBe(backgroundColor);
      expect(getComputedStyle(dialog!).opacity).toBe("1");
    } finally {
      if (previousTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previousTheme);
    }
  },
};

export const PartyMemberLinking: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Mum" })).toBeEnabled());
    const partyInfo = canvas.getByRole("button", { name: "Parenting party information" });
    await expect(partyInfo).toBeVisible();
    await expect(partyInfo).toHaveAttribute("tabindex", "0");
    await expect(canvas.queryByText(/Child background hatching is enabled per child in Members/)).toBeNull();
    const document = canvasElement.ownerDocument;
    (document.activeElement as HTMLElement | null)?.blur();
    for (let index = 0; index < 8 && document.activeElement !== partyInfo; index += 1) {
      await userEvent.tab();
    }
    await expect(partyInfo).toHaveFocus();
    await userEvent.hover(partyInfo);
    await expect(await page.findByRole("tooltip")).toHaveTextContent(/Child background hatching is enabled per child in Members/);
    await userEvent.unhover(partyInfo);
    await expect(canvas.queryByRole("combobox", { name: "Household parenting party" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Save calendar display" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Edit parenting party Mum" }));
    const dialog = within(await page.findByRole("dialog", { name: "Edit parenting party" }));
    await expect(dialog.getByRole("combobox", { name: "Link to household member (optional)" })).toHaveTextContent("No linked member");
    await userEvent.click(dialog.getByRole("combobox", { name: "Link to household member (optional)" }));
    await userEvent.click(page.getByRole("option", { name: "Mum" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save party" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(canvas.getByRole("button", { name: "Reload saved settings" })).toBeEnabled());
    const save = calls.mock.calls.find(([path, init]) => String(path).endsWith("/parties") && init?.method === "PUT");
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({
      id: motherId, name: "Mum", memberId: motherId, active: true,
    });
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved settings" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Mum" })).toBeEnabled());
    const row = canvas.getByRole("button", { name: "Edit parenting party Mum" }).closest("tr")!;
    await expect(within(row).getAllByText("Mum")).toHaveLength(2);
    expect(calls.mock.calls.some(([path]) => String(path).endsWith("/calendar-settings"))).toBe(false);
    expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/plan") && init?.method === "PUT")).toBe(false);
  },
};

export const HouseholdPartyLinks: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Dad" })).toBeEnabled());
    const partyInfo = canvas.getByRole("button", { name: "Parenting party information" });
    await userEvent.hover(partyInfo);
    await expect(await page.findByRole("tooltip")).toHaveTextContent(/Unknown periods, stale member links, and archived parties remain unshaded/);
    const mumRow = canvas.getByRole("button", { name: "Edit parenting party Mum" }).closest("tr")!;
    await expect(within(mumRow).getByText("Not linked")).toBeVisible();
    expect(calls.mock.calls.some(([path]) => String(path).endsWith("/calendar-settings"))).toBe(false);
  },
};

export const ShareChangesCreate: Story = {
  args: { withPlan: true, withChanges: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const share = await canvas.findByRole("button", { name: "Share parenting changes" });
    await waitFor(() => expect(share).toBeEnabled());
    await expect(canvas.queryByRole("button", { name: "Shared links" })).toBeNull();
    await userEvent.click(share);
    const dialog = within(await page.findByRole("dialog", { name: "Share parenting changes" }));
    await expect(dialog.getByRole("textbox", { name: "Private note (optional)" })).toHaveValue("");
    await expect(dialog.getByRole("textbox", { name: "Private note (optional)" })).toHaveAttribute("maxlength", "1000");
    for (const category of ["Adjusted Handover", "Holiday", "Diverse"]) await expect(dialog.getByRole("checkbox", { name: category })).toBeChecked();
    await expect(dialog.getByText(/Live future changes/)).toHaveTextContent(/ongoing and past changes are excluded/);
    await waitFor(() => expect(dialog.getByText(/Dates use your local timezone/)).toBeVisible());
    for (const category of ["Adjusted Handover", "Holiday", "Diverse"]) await userEvent.click(dialog.getByRole("checkbox", { name: category }));
    await expect(dialog.getByRole("button", { name: "Create link" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("checkbox", { name: "Holiday" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Private note (optional)" }), "For grandparents");
    await userEvent.click(dialog.getByRole("button", { name: "Create link" }));
    await expect(await dialog.findByRole("textbox", { name: "New shared link" })).toHaveValue(`${window.location.origin}/shared#${"s".repeat(43)}`);
    const create = calls.mock.calls.find(([path, init]) => String(path).endsWith("/share-links") && init?.method === "POST");
    const body = JSON.parse(String(create?.[1]?.body));
    expect(body).toMatchObject({ resourceType: "parenting_changes", categories: ["holiday"], note: "For grandparents" });
    expect(body.expiresAt).toBe(afterLocalShareDay(localShareDate(new Date(Date.now() + 4 * 86400000).toISOString())));
    await waitFor(() => expect(dialog.getByText(/only a digest is stored/)).toBeVisible());
    const originalCopy = navigator.clipboard.writeText;
    const copy = fn(async () => undefined);
    navigator.clipboard.writeText = copy;
    try {
      await userEvent.click(dialog.getByRole("button", { name: "Copy link" }));
      await waitFor(() => expect(copy).toHaveBeenCalledWith(`${window.location.origin}/shared#${"s".repeat(43)}`));
      await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
    } finally { navigator.clipboard.writeText = originalCopy; }
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(canvas.queryByRole("button", { name: "Shared links" })).toBeNull();
    expect(calls.mock.calls.filter(([path]) => String(path).includes("/share-links"))).toHaveLength(1);
  },
};

export const ShareFilteredCategories: Story = {
  args: { withPlan: true, withChanges: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("combobox", { name: "Filter by category" }));
    await userEvent.click(page.getByRole("option", { name: "Holiday" }));
    await userEvent.click(canvas.getByRole("button", { name: "Share parenting changes" }));
    const dialog = within(await page.findByRole("dialog", { name: "Share parenting changes" }));
    await expect(dialog.getByRole("checkbox", { name: "Holiday" })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Diverse" })).not.toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Adjusted Handover" })).not.toBeChecked();
    await userEvent.click(dialog.getByRole("button", { name: "Create link" }));
    await dialog.findByRole("textbox", { name: "New shared link" });
    const create = calls.mock.calls.find(([path, init]) => String(path).endsWith("/share-links") && init?.method === "POST");
    const body = JSON.parse(String(create?.[1]?.body));
    expect(body.note).toBe("");
    expect(body.categories).toEqual(["holiday"]);
    expect(body.expiresAt).toBe(afterLocalShareDay(localShareDate(new Date(Date.now() + 2.5 * 86400000).toISOString())));
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Share parenting changes" }));
    const fresh = within(await page.findByRole("dialog", { name: "Share parenting changes" }));
    await expect(fresh.queryByRole("textbox", { name: "New shared link" })).toBeNull();
    await expect(fresh.getByRole("textbox", { name: "Private note (optional)" })).toHaveValue("");
  },
};

export const ShareChangesMobile: Story = {
  args: { withPlan: true, withChanges: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const share = await canvas.findByRole("button", { name: "Share parenting changes" });
    await waitFor(() => expect(share).toBeEnabled());
    await userEvent.click(share);
    await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Share parenting changes" });
  },
};
