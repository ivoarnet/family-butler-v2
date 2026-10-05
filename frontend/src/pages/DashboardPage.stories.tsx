import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { HouseholdData } from "../features/app/types";
import { DashboardPage } from "./DashboardPage";

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
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

function DashboardStory({ width }: { width: number }) {
  const [householdData, setHouseholdData] = useState(household);
  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/childcare/occurrences?")) {
        return Response.json({ occurrences: childcareOccurrences });
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);
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
      expect(firstChildcare.getAttribute("title")).toContain("All day");
      const birthdayEntry = specialsCell.querySelector(".calendar-birthday-entry")!;
      expect(birthdayEntry.textContent).toBe("Taylor");
      expect(birthdayEntry.querySelector(".calendar-special-icon[data-testid='CakeIcon']")).not.toBeNull();
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
      expect(Array.from(memberCells).every((cell) => !cell.querySelector(".calendar-childcare-entry"))).toBe(true);
      expect(entry).toBeVisible();
      expect(entry.textContent).toContain("Grandparents");
      expect(entry.textContent).toContain("For Alex, Sam");
      expect(entry?.querySelector(".calendar-childcare-icon")).not.toBeNull();
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
