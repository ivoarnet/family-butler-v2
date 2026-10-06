import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import type { HouseholdData } from "../features/app/types";
import type { ResolvedParentingInterval } from "../types/family";
import { DashboardPage } from "./DashboardPage";

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
const followingMidnight = new Date(`${tomorrowDate}T00:00`);
followingMidnight.setDate(followingMidnight.getDate() + 1);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
const momId = "00000000-0000-0000-0000-000000000001";
const dadId = "00000000-0000-0000-0000-000000000002";
const parentingIntervals: ResolvedParentingInterval[] = [
  { startAt: new Date(`${yesterdayDate}T00:00`).toISOString(), endAt: new Date(`${date}T00:00`).toISOString(),
    partyId: dadId, partyName: "Dad", source: { type: "plan", planId: "plan" } },
  { startAt: new Date(`${date}T00:00`).toISOString(), endAt: new Date(`${date}T12:00`).toISOString(),
    partyId: momId, partyName: "Mum", source: { type: "plan", planId: "plan" } },
  { startAt: new Date(`${date}T12:00`).toISOString(), endAt: new Date(`${date}T18:00`).toISOString(),
    partyId: dadId, partyName: "Dad", source: { type: "change", changeId: "swap", label: "Agreed swap" } },
  { startAt: new Date(`${date}T18:00`).toISOString(), endAt: new Date(`${tomorrowDate}T12:00`).toISOString(),
    partyId: momId, partyName: "Mum", source: { type: "plan", planId: "plan" } },
  { startAt: new Date(`${tomorrowDate}T12:00`).toISOString(),
    endAt: followingMidnight.toISOString(),
    partyId: momId, partyName: "Mum", source: { type: "change", changeId: "same-party", label: "Same-party adjustment" } },
];
const childcareOccurrences = [
  {
    id: "grandparents-care",
    originalDate: yesterdayDate,
    date,
    providerId: "grandparents",
    providerName: "Grandparents",
    childIds: ["alex", "sam"],
    allDay: true,
    startTime: null,
    endTime: null,
    overrideAction: "move" as const,
  },
  {
    id: "daycare-care",
    originalDate: tomorrowDate,
    date: tomorrowDate,
    providerId: "daycare",
    providerName: "Daycare",
    childIds: ["alex"],
    allDay: false,
    startTime: "15:00",
    endTime: "16:00",
    overrideAction: "replace" as const,
  },
];
const household: HouseholdData = {
  householdId: "demo",
  householdName: "Family Calendar",
  familyMembers: [
    { id: "alex", firstName: "Alex", avatarColor: "#3b82f6", visibleInCalendar: true, order: 0 },
    { id: "sam", firstName: "Sam", avatarColor: "#8b5cf6", visibleInCalendar: true, order: 1 },
    { id: "hidden", firstName: "Hidden", avatarColor: "#ef6c51", visibleInCalendar: false, order: 2 },
  ],
  contacts: [{ id: "birthday", firstName: "Taylor", birthDay: today.getDate(), birthMonth: today.getMonth() + 1 }],
  eventTypes: [],
  events: [
    { id: "shared", title: "Family picnic", date, allDay: true, memberIds: ["alex", "sam"] },
    { id: "alex-event", title: "Music lesson", date, allDay: false, startTime: "15:00", endTime: "16:00", memberIds: ["alex"] },
    { id: "overnight", title: "Overnight stay", date, endDate: tomorrowDate, allDay: false, startTime: "18:00", memberIds: ["alex"] },
    { id: "sam-event", title: "Football practice", date, allDay: false, startTime: "17:00", endTime: "18:00", memberIds: ["sam"] },
    { id: "unassigned", title: "Household reminder", date, allDay: true, memberIds: [] },
    { id: "hidden-event", title: "Hidden member event", date, allDay: true, memberIds: ["hidden"] },
    { id: "recurring", title: "Daily check-in", date: "2000-01-01", allDay: true, memberIds: ["alex"], repeatRule: "FREQ=DAILY" },
    { id: "long-title", title: "A-very-long-unbroken-event-title-that-must-not-overflow-the-calendar-at-narrow-widths", date, allDay: true, memberIds: ["alex", "sam"] },
  ],
  dayConfigurations: [{ id: "holiday", category: "school_off", startDate: date, endDate: date }],
};

function DashboardStory({ width, unknownResponsibility = false }: { width: number; unknownResponsibility?: boolean }) {
  const [householdData, setHouseholdData] = useState(household);
  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/childcare/occurrences?")) {
        return Response.json({ occurrences: childcareOccurrences });
      }
      if (url.includes("/parenting-time/resolve?")) {
        const range = new URL(url, window.location.origin).searchParams;
        return Response.json({ intervals: parentingIntervals.filter((interval) =>
          interval.startAt < range.get("endAt")! && interval.endAt > range.get("startAt")!) });
      }
      if (url.endsWith("/parenting-time/check")) {
        const body = JSON.parse(String(init?.body)) as { partyId: string; startAt: string; endAt: string };
        const overlaps = parentingIntervals.filter((interval) =>
          interval.partyId === body.partyId && interval.startAt < body.endAt && interval.endAt > body.startAt);
        return Response.json(unknownResponsibility
          ? { status: "cannot_determine", responsible: null, overlaps: [] }
          : { status: "determined", responsible: overlaps.length > 0, overlaps });
      }
      if (url.endsWith("/parenting-time")) {
        return Response.json({ parties: [
          { id: momId, name: "Mum", active: true }, { id: dadId, name: "Dad", active: true },
        ] });
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [unknownResponsibility]);
  return (
    <div style={{ maxWidth: width, margin: "auto" }}>
      <DashboardPage
        householdData={householdData}
        setHouseholdData={setHouseholdData}
        onOpenSettings={() => undefined}
        currentUserLabel="Demo user"
        currentUserEmail="demo@example.com"
        currentUserInitials="DU"
        currentUserAvatarUrl={null}
        accessToken="storybook-token"
        onAgentDataChanged={() => undefined}
        onSignOut={async () => undefined}
      />
    </div>
  );
}

const meta: Meta<typeof DashboardStory> = {
  title: "Dashboard/FamilyCalendar",
  component: DashboardStory,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof DashboardStory>;

export const Desktop: Story = {
  args: { width: 1440 },
  play: async ({ canvasElement }) => {
    const todayRow = canvasElement.querySelector(".today-row")!;
    const memberCells = todayRow.querySelectorAll(".member-event-cell");
    await waitFor(() => {
      expect(memberCells).toHaveLength(2);
      expect(todayRow.querySelector(".calendar-childcare-entry")).toBeNull();
      const specialsCell = todayRow.querySelector(".specials-cell")!;
      const firstChildcare = specialsCell.querySelector(".calendar-childcare-entry")!;
      expect(firstChildcare.textContent).toContain("Grandparents");
      expect(firstChildcare.textContent).toContain("For Alex, Sam");
      expect(firstChildcare.querySelector(".calendar-childcare-icon")).not.toBeNull();
      expect(getComputedStyle(firstChildcare.querySelector(".calendar-childcare-icon")!).color)
        .toBe(getComputedStyle(firstChildcare.querySelector("strong")!).color);
      expect(firstChildcare.getAttribute("title")).toContain("All day");
      expect(getComputedStyle(firstChildcare).borderBottomColor).toBe(getComputedStyle(todayRow).borderBottomColor);
      const birthdayEntry = specialsCell.querySelector(".calendar-birthday-entry")!;
      expect(birthdayEntry.textContent).toBe("Taylor");
      expect(birthdayEntry.querySelector(".calendar-special-icon[data-testid='CakeIcon']")).not.toBeNull();
      expect(getComputedStyle(birthdayEntry.querySelector(".calendar-special-icon")!).color)
        .toBe(getComputedStyle(birthdayEntry.querySelector("strong")!).color);
      expect(specialsCell.textContent.indexOf("Grandparents")).toBeLessThan(specialsCell.textContent.indexOf("Taylor"));
      expect(canvasElement.querySelector(".specials-column-header")?.textContent).toBe("Specials");
      expect(canvasElement.querySelector(".specials-column-header svg")).toBeNull();
      expect(todayRow.querySelector(".shared-events-column .calendar-childcare-entry")).toBeNull();
    });
  },
};
export const DayAndEvents: Story = {
  args: { width: 800 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alex = canvas.getByRole("button", { name: "Filter events for Alex" });
    const sam = canvas.getByRole("button", { name: "Filter events for Sam" });
    const period = canvas.getByRole("banner").querySelector("p")?.textContent;
    const events = () => canvas.getAllByRole("button", { name: "Open event Family picnic" });
    const isMobile = (canvasElement.querySelector(".dashboard-page")?.getBoundingClientRect().width ?? Infinity) <= 760;
    const previousPeriod = canvasElement.querySelector(
      `${isMobile ? ".calendar-period-navigation" : ".header-controls .period-navigation"} [title="Previous two-week period"]`,
    )!;
    const nextPeriod = canvasElement.querySelector(
      `${isMobile ? ".calendar-period-navigation" : ".header-controls .period-navigation"} [title="Next two-week period"]`,
    )!;

    await expect(previousPeriod).toBeVisible();
    await expect(nextPeriod).toBeVisible();
    if (isMobile) {
      await expect(canvas.queryByRole("group", { name: "View switcher" })).toBeNull();
      await expect(canvasElement.querySelector(".header-controls .period-navigation")!).not.toBeVisible();
      await expect(previousPeriod.closest(".calendar-member-filters")).not.toBeNull();
      const brandingTop = canvasElement.querySelector(".header-branding")!.getBoundingClientRect().top;
      const actionsTop = canvasElement.querySelector(".header-meta")!.getBoundingClientRect().top;
      await expect(Math.abs(actionsTop - brandingTop)).toBeLessThanOrEqual(4);
    }
    await expect(canvas.getByRole("button", { name: "Jump to current period" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Open settings" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Demo user · Open account menu" })).toBeVisible();
    await expect(alex.querySelector(".avatar")?.getBoundingClientRect().width).toBe(alex.getBoundingClientRect().width);
    await expect(alex.querySelector(".avatar")?.getBoundingClientRect().height).toBe(alex.getBoundingClientRect().height);
    await expect(events()).toHaveLength(1);
    await waitFor(() => {
      const sharedEvents = canvasElement.querySelector(".today-row .shared-events-column")!;
      const memberCells = canvasElement.querySelectorAll(".today-row .member-event-cell");
      const specialsCell = canvasElement.querySelector(".today-row .specials-cell")!;
      const entries = specialsCell.querySelectorAll(".calendar-childcare-entry");
      const entry = entries[0]!;
      const daycareEntry = Array.from(canvasElement.querySelectorAll(".specials-cell .calendar-childcare-entry"))
        .find((childcareEntry) => childcareEntry.textContent?.includes("Daycare"));
      expect(memberCells).toHaveLength(2);
      expect(canvasElement.querySelector(".today-row .calendar-childcare-entry")).toBe(entry);
      expect(specialsCell).toBeVisible();
      if (isMobile) {
        expect(getComputedStyle(specialsCell, "::before").content).toBe('"Specials"');
        const emptySpecialsCell = Array.from(canvasElement.querySelectorAll(".specials-cell"))
          .find((cell) => !cell.querySelector(".specials-entry"));
        expect(emptySpecialsCell).toBeDefined();
        expect(getComputedStyle(emptySpecialsCell!, "::before").content).toBe("none");
      }
      expect(Array.from(memberCells).every((cell) => !cell.querySelector(".calendar-childcare-entry"))).toBe(true);
      expect(entry).toBeVisible();
      expect(entry.textContent).toContain("Grandparents");
      expect(entry.textContent).toContain("For Alex, Sam");
      expect(entry?.querySelector(".calendar-childcare-icon")).not.toBeNull();
      expect(getComputedStyle(entry.querySelector(".calendar-childcare-icon")!).color)
        .toBe(getComputedStyle(entry.querySelector("strong")!).color);
      expect(entry?.getAttribute("title")).toContain("For Alex, Sam");
      expect(entry?.getAttribute("title")).toContain(`Moved from ${yesterdayDate}`);
      expect(daycareEntry).toBeVisible();
      expect(daycareEntry?.getAttribute("title")).toContain("15:00 – 16:00");
      expect(daycareEntry?.getAttribute("title")).toContain("One-off adjustment");
      expect(specialsCell.textContent.indexOf("Grandparents")).toBeLessThan(specialsCell.textContent.indexOf("Taylor"));
      expect(sharedEvents.querySelector(".calendar-childcare-entry")).toBeNull();
      expect(sharedEvents.textContent).not.toContain("Birthday: Taylor");
    });
    await expect(canvas.getByRole("button", { name: "Open event Hidden member event" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Filter events for Hidden" })).toBeNull();
    await userEvent.click(alex);
    await expect(alex).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.queryByRole("button", { name: "Open event Football practice" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "Open event Household reminder" })).toBeVisible();
    const birthday = canvasElement.querySelector(".today-row .calendar-birthday-entry")!;
    await expect(birthday).toBeVisible();
    await expect(birthday.querySelector(".calendar-special-icon[data-testid='CakeIcon']")).not.toBeNull();
    await expect(canvas.getAllByRole("button", { name: "Open event Daily check-in" }).length).toBeGreaterThan(1);
    await userEvent.click(previousPeriod);
    await expect(canvas.getByRole("banner").querySelector("p")?.textContent).not.toBe(period);
    await userEvent.click(nextPeriod);
    await expect(canvas.getByRole("banner").querySelector("p")?.textContent).toBe(period);
    await userEvent.click(sam);
    await expect(alex).toHaveAttribute("aria-pressed", "false");
    await expect(sam).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.queryByRole("button", { name: "Open event Music lesson" })).toBeNull();
    await expect(events()).toHaveLength(1);
    await userEvent.click(sam);
    await expect(sam).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.getByRole("button", { name: "Open event Music lesson" })).toBeVisible();
    await expect(canvas.getByRole("banner").querySelector("p")?.textContent).toBe(period);
    if (!isMobile) {
      await expect(canvas.getByRole("button", { name: "2 Weeks" })).toHaveAttribute("aria-pressed", "true");
    }
  },
};
export const DayGroupedEvents: Story = {
  args: { width: 390 },
  play: DayAndEvents.play,
};
export const MultiDayEvent: Story = {
  args: { width: 1440 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const eventCards = canvas.getAllByRole("button", { name: "Open event Overnight stay" });
    await expect(eventCards.length).toBeGreaterThan(1);
    await expect(canvas.getAllByText("18:00 →").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Continues").length).toBeGreaterThan(0);

    await userEvent.click(canvas.getByTitle("Create event"));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Multi-day event" }));
    const lastDay = canvas.getByLabelText("Last day") as HTMLInputElement;
    await expect(lastDay).toBeVisible();
    await expect(lastDay.value).toBe(tomorrowDate);
  },
};

export const ParentingTime: Story = {
  args: { width: 1440 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvasElement.querySelectorAll(".today-row .calendar-parenting-entry")).toHaveLength(3));
    const todayRow = within(canvasElement.querySelector(".today-row") as HTMLElement);
    const parentingEntry = todayRow.getByText("Parenting · Dad").closest(".calendar-parenting-entry")!;
    await expect(parentingEntry).toBeVisible();
    await expect(parentingEntry.textContent).toBe("Parenting · DadHand-off 12:00");
    await expect(parentingEntry.getAttribute("title")).toContain("12:00 – 18:00");
    await expect(canvas.queryByText("One-off change · Agreed swap")).toBeNull();
    await expect(parentingEntry.querySelector("summary")).toBeNull();
    const childcareEntry = canvasElement.querySelector(".today-row .calendar-childcare-entry")!;
    await expect(getComputedStyle(parentingEntry).borderLeftWidth).toBe("0px");
    await expect(getComputedStyle(parentingEntry).borderTopWidth).toBe("0px");
    await expect(getComputedStyle(parentingEntry).borderRadius).toBe("0px");
    await expect(getComputedStyle(parentingEntry).borderBottomColor).toBe(getComputedStyle(childcareEntry).borderBottomColor);
    await expect(getComputedStyle(parentingEntry.querySelector(".calendar-special-icon")!).color)
      .toBe(getComputedStyle(childcareEntry.querySelector(".calendar-childcare-icon")!).color);
    await expect(getComputedStyle(parentingEntry.querySelector("small")!).paddingLeft)
      .toBe(getComputedStyle(childcareEntry.querySelector("small")!).paddingLeft);
    await userEvent.hover(parentingEntry);
    await expect(parentingEntry.getAttribute("title")).toContain("One-off change · Agreed swap");
    await expect(parentingEntry.getAttribute("title")).toContain("Handover from Mum at 12:00");
    await expect(parentingEntry.getAttribute("title")).toContain("Handover to Mum at 18:00");
    await expect(parentingEntry.getAttribute("aria-label")).toContain("Adjusted responsibility");
    await expect(canvas.queryByText("Handover from Mum at 12:00")).toBeNull();
    await expect(canvas.queryByText("Handover to Mum at 18:00")).toBeNull();
    const normalEntry = canvasElement.querySelector(".today-row .calendar-parenting-entry")!;
    const previousDayVisible = Boolean(canvasElement.querySelector(`[title^="Parenting · Dad · All day"]`));
    await expect(normalEntry.textContent).toBe(previousDayVisible ? "Parenting · MumHand-off 00:00" : "Parenting · Mum");
    await expect(normalEntry.getAttribute("title")).toContain("Normal plan");
    const returningEntry = canvasElement.querySelectorAll(".today-row .calendar-parenting-entry")[2]!;
    await expect(returningEntry.textContent).toBe("Parenting · MumHand-off 18:00");
    const continuingEntries = Array.from(canvasElement.querySelectorAll(".calendar-parenting-entry"))
      .filter((entry) => entry.getAttribute("title")?.includes("Same-party adjustment")
        || entry.getAttribute("title")?.startsWith("Parenting · Mum · 00:00 – 12:00 · Normal plan:")
          && !entry.closest(".today-row"));
    for (const entry of continuingEntries) {
      await expect(entry.textContent).toBe("Parenting · Mum");
      await expect(entry.querySelector("small")).toBeNull();
    }
    await expect(canvas.queryByRole("button", { name: "Open event Parenting · Dad" })).toBeNull();
    await userEvent.click(canvas.getByTitle("Create event"));
    await fireEvent.change(await page.findByRole("textbox", { name: /^Title/ }), { target: { value: "Personal appointment" } });
    await userEvent.click(page.getByRole("button", { name: /Alex$/ }));
    await userEvent.click(page.getByRole("switch", { name: "Check this personal event for parenting responsibility" }));
    await expect(page.getByText(/Select a party explicitly/)).toBeVisible();
    await userEvent.click(page.getByRole("combobox", { name: "Acting parenting party (development only)" }));
    await userEvent.click(await page.findByRole("option", { name: "Dad" }));
    await waitFor(() => expect(page.getByRole("alert")).toHaveTextContent("You can still save"));
    await expect(page.getByRole("alert")).toHaveTextContent("One-off change: Agreed swap");
    await expect(page.getByRole("button", { name: "Add event" })).toBeEnabled();
    const dateInput = page.getByLabelText(/^Date/) as HTMLInputElement;
    await fireEvent.change(dateInput, { target: { value: tomorrowDate } });
    await waitFor(() => expect(page.queryByRole("alert")).toBeNull());
    await waitFor(() => expect(page.getByText("No parenting responsibility overlap for this range.")).toBeVisible());
    await fireEvent.change(dateInput, { target: { value: date } });
    await waitFor(() => expect(page.getByRole("alert")).toHaveTextContent("You can still save"));
    await userEvent.click(page.getByRole("combobox", { name: "Acting parenting party (development only)" }));
    await userEvent.click(await page.findByRole("option", { name: "Mum" }));
    await waitFor(() => expect(page.getByRole("alert")).toHaveTextContent("Normal plan"));
    await userEvent.click(page.getByRole("button", { name: "Add event" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Add event" })).toBeNull());
    await expect(canvas.getAllByRole("button", { name: "Open event Personal appointment" }).length).toBeGreaterThan(0);
  },
};

export const UnknownParentingResponsibility: Story = {
  args: { width: 1440, unknownResponsibility: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByTitle("Create event"));
    await userEvent.click(await page.findByRole("switch", { name: "Check this personal event for parenting responsibility" }));
    await userEvent.click(page.getByRole("combobox", { name: "Acting parenting party (development only)" }));
    await userEvent.click(await page.findByRole("option", { name: "Dad" }));
    await waitFor(() => expect(page.getByText("Cannot determine responsibility: no active valid plan covers this range.")).toBeVisible());
    await expect(page.queryByRole("alert")).toBeNull();
    await expect(page.getByRole("button", { name: "Add event" })).toBeEnabled();
  },
};
