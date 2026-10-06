import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useState } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
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
const guardianId = "00000000-0000-0000-0000-000000000003";
const calendarSettingsCalls = fn();
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
const periodStart = new Date(`${date}T00:00`);
periodStart.setDate(periodStart.getDate() - (periodStart.getDay() + 6) % 7);
const boundaryIntervals: ResolvedParentingInterval[] = [
  { ...parentingIntervals[1], startAt: periodStart.toISOString() },
  ...parentingIntervals.slice(2),
  { startAt: followingMidnight.toISOString(), endAt: new Date(followingMidnight.getFullYear(),
    followingMidnight.getMonth(), followingMidnight.getDate() + 1).toISOString(),
    partyId: dadId, partyName: "Dad", source: { type: "plan", planId: "plan" } },
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
    { id: "alex", firstName: "Alex", isChild: true, avatarColor: "#3b82f6", visibleInCalendar: true, order: 0 },
    { id: "sam", firstName: "Sam", isChild: false, role: "Child", schoolBuilding: "School", schoolClass: "3B",
      avatarColor: "#8b5cf6", visibleInCalendar: true, order: 1 },
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

function DashboardStory({ width, unknownResponsibility = false, hatching = false, archivedHouseholdParty = false,
  parentingUnavailable = false, classificationControls = false, noChildren = false, noHouseholdLinks = false,
  invalidHouseholdLink = false, invalidOutsideLink = false, inactiveOutsideParty = false,
  multipleHouseholdLinks = false, secondChildOptedOut = false, additionalOutsideParty = false, parentingBoundaries = false }: {
  width: number; unknownResponsibility?: boolean; hatching?: boolean; archivedHouseholdParty?: boolean;
  parentingUnavailable?: boolean; classificationControls?: boolean; noChildren?: boolean; noHouseholdLinks?: boolean;
  invalidHouseholdLink?: boolean; invalidOutsideLink?: boolean; inactiveOutsideParty?: boolean;
  multipleHouseholdLinks?: boolean; secondChildOptedOut?: boolean; additionalOutsideParty?: boolean;
  parentingBoundaries?: boolean;
}) {
  const [householdData, setHouseholdData] = useState<HouseholdData>(() => ({
    ...household, familyMembers: household.familyMembers.map((member) => ({
      ...member,
      isChild: noChildren ? false : secondChildOptedOut && member.id === "sam" ? true : member.isChild,
      hatchParentingAway: hatching && !(secondChildOptedOut && member.id === "sam"),
    })),
  }));
  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/childcare/occurrences?")) {
        return Response.json({ occurrences: childcareOccurrences });
      }
      if (url.includes("/parenting-time/resolve?")) {
        if (parentingUnavailable) return Response.json({ error: "Parenting time unavailable" }, { status: 500 });
        const range = new URL(url, window.location.origin).searchParams;
        const intervals = multipleHouseholdLinks || additionalOutsideParty ? [
          ...parentingIntervals.slice(0, 2),
          { ...parentingIntervals[2], endAt: new Date(`${date}T14:00`).toISOString() },
          { ...parentingIntervals[2], partyId: guardianId, partyName: "Guardian",
            startAt: new Date(`${date}T14:00`).toISOString(), endAt: new Date(`${date}T16:00`).toISOString() },
          { ...parentingIntervals[2], startAt: new Date(`${date}T16:00`).toISOString() },
          ...parentingIntervals.slice(3),
        ] : parentingBoundaries ? boundaryIntervals : parentingIntervals;
        return Response.json({
          intervals: unknownResponsibility ? [] : intervals.filter((interval) =>
            interval.startAt < range.get("endAt")! && interval.endAt > range.get("startAt")!),
          status: unknownResponsibility ? "cannot_determine" : "determined",
          parties: [
            { id: momId, name: "Mum", memberId: noHouseholdLinks ? null : invalidHouseholdLink ? "removed-member" : "hidden",
              active: !archivedHouseholdParty },
            { id: dadId, name: "Dad", memberId: multipleHouseholdLinks ? "sam" : invalidOutsideLink ? "removed-member" : null,
              active: !inactiveOutsideParty },
            ...(multipleHouseholdLinks || additionalOutsideParty ? [{ id: guardianId, name: "Guardian", memberId: null, active: true }] : []),
          ],
        });
      }
      if (url.endsWith("/parenting-time/calendar-settings")) {
        calendarSettingsCalls(url);
        return Response.json({ showAwayHatching: true, householdPartyId: dadId, childMemberIds: ["sam", "removed-member"] });
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
  }, [unknownResponsibility, archivedHouseholdParty, parentingUnavailable, noHouseholdLinks,
    invalidHouseholdLink, invalidOutsideLink, inactiveOutsideParty, multipleHouseholdLinks, additionalOutsideParty, parentingBoundaries]);
  return (
    <div style={{ maxWidth: width, margin: "auto" }}>
      {classificationControls && <button type="button" onClick={() => setHouseholdData((current) => ({
        ...current, familyMembers: current.familyMembers.map((member) =>
          member.id === "alex" || member.id === "sam" ? { ...member, isChild: member.isChild !== true } : member),
      }))}>Swap child classification</button>}
      {classificationControls && <button type="button" onClick={() => setHouseholdData((current) => ({
        ...current, familyMembers: current.familyMembers.map((member) => member.id === "alex"
          ? { ...member, hatchParentingAway: !member.hatchParentingAway } : member),
      }))}>Toggle Alex hatching</button>}
      {classificationControls && <button type="button" onClick={() => setHouseholdData((current) => ({
        ...current, familyMembers: current.familyMembers.some((member) => member.id === "hidden")
          ? current.familyMembers.filter((member) => member.id !== "hidden")
          : [...current.familyMembers, household.familyMembers[2]],
      }))}>Toggle linked household membership</button>}
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
  beforeEach: () => { calendarSettingsCalls.mockClear(); },
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
  args: { width: 1440, parentingBoundaries: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvasElement.querySelectorAll(".today-row .calendar-parenting-entry")).toHaveLength(2));
    const todayRow = within(canvasElement.querySelector(".today-row") as HTMLElement);
    const parentingEntry = todayRow.getByText("12:00 → Dad").closest(".calendar-parenting-entry")!;
    await expect(parentingEntry).toBeVisible();
    await expect(parentingEntry.textContent).toBe("Parenting12:00 → Dad");
    await expect(parentingEntry.querySelector("strong")?.textContent).toBe("Parenting");
    await expect(parentingEntry.querySelector(".calendar-special-icon[data-testid='FamilyRestroomIcon']")).not.toBeNull();
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
    const returningEntry = todayRow.getByText("18:00 → Mum").closest(".calendar-parenting-entry")!;
    await expect(returningEntry.textContent).toBe("Parenting18:00 → Mum");
    await expect(returningEntry.getAttribute("title")).toContain("Normal plan");
    const tomorrowRow = canvasElement.querySelector(".today-row")!.nextElementSibling!;
    await expect(tomorrowRow.querySelectorAll(".calendar-parenting-entry")).toHaveLength(0);
    const midnightRow = tomorrowRow.nextElementSibling!;
    await expect(midnightRow.querySelectorAll(".calendar-parenting-entry")).toHaveLength(1);
    const midnightEntry = midnightRow.querySelector(".calendar-parenting-entry")!;
    await expect(midnightEntry.textContent).toBe("Parenting00:00 → Dad");
    await expect(midnightEntry.getAttribute("title")).toContain("Handover from Mum at 00:00");
    const allEntries = Array.from(canvasElement.querySelectorAll(".calendar-parenting-entry"));
    await expect(allEntries).toHaveLength(3);
    await expect(allEntries.some((entry) => entry.getAttribute("title")?.includes("Same-party adjustment"))).toBe(false);
    await expect(allEntries.some((entry) => entry.textContent === "Parenting00:00 → Mum")).toBe(false);
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

export const AwayHatching: Story = {
  args: { width: 1440, hatching: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvasElement.querySelectorAll(".today-row .member-event-cell .parenting-away-segment")).toHaveLength(1));
    const cells = canvasElement.querySelectorAll(".today-row .member-event-cell");
    const segment = cells[0].querySelector(".parenting-away-segment") as HTMLElement;
    await expect(segment.style.top).toBe("50%");
    await expect(segment.style.height).toBe("25%");
    await expect(getComputedStyle(segment).backgroundImage).toContain("repeating-linear-gradient");
    await expect(getComputedStyle(segment.parentElement!).pointerEvents).toBe("none");
    await expect(cells[1].querySelector(".parenting-away-background")).toBeNull();
    await expect(canvasElement.querySelector(".today-row .day-cell .parenting-away-background")).toBeNull();
    await expect(canvasElement.querySelector(".today-row .specials-cell .parenting-away-background")).toBeNull();
    const continuingRow = canvasElement.querySelector(".today-row")!.nextElementSibling!;
    await expect(continuingRow.querySelector(".parenting-away-segment")).toBeNull();
    await expect(cells[0].textContent).toContain("12:00 → Dad");
    await expect(cells[0].textContent).toContain("18:00 → Mum");
    const allDay = Array.from(canvasElement.querySelectorAll(".parenting-away-segment"))
      .find((entry) => (entry as HTMLElement).style.height === "100%");
    if (today.getDay() !== 1) {
      await expect(allDay).toBeDefined();
      await expect((allDay as HTMLElement).style.top).toBe("0%");
    }
    const isCompact = (canvasElement.querySelector(".dashboard-page")?.getBoundingClientRect().width ?? Infinity) <= 960;
    if (!isCompact) {
      await userEvent.click(within(cells[0] as HTMLElement).getByRole("button", { name: "Open event Music lesson" }));
      await waitFor(() => expect(page.getByRole("dialog")).toBeVisible());
      await userEvent.click(page.getByRole("button", { name: /Close/ }));
    } else {
      await expect(canvasElement.querySelector(".today-row .shared-events-column .parenting-away-background")).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Filter events for Alex" }));
      await expect(canvasElement.querySelector(".today-row .shared-events-column .parenting-away-segment")).not.toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Open event Music lesson" }));
      await waitFor(() => expect(page.getByRole("dialog")).toBeVisible());
      await userEvent.click(page.getByRole("button", { name: /Close/ }));
      await userEvent.click(canvas.getByRole("button", { name: "Filter events for Sam" }));
      await expect(canvasElement.querySelector(".today-row .shared-events-column .parenting-away-background")).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Filter events for Alex" }));
    }
    const navigation = canvasElement.querySelector(`${isCompact && (canvasElement.querySelector(".dashboard-page")?.getBoundingClientRect().width ?? Infinity) <= 760
      ? ".calendar-period-navigation" : ".header-controls .period-navigation"} [title="Next two-week period"]`)!;
    await userEvent.click(navigation);
    await waitFor(() => expect(canvasElement.querySelector(".parenting-away-segment")).toBeNull());
    expect(calendarSettingsCalls).not.toHaveBeenCalled();
  },
};

export const AwayHatchingMobile: Story = {
  args: { width: 390, hatching: true },
  play: AwayHatching.play,
};

export const UnknownAwayHatching: Story = {
  args: { width: 1440, hatching: true, unknownResponsibility: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText(/Parenting responsibility cannot be determined:/)).toBeVisible());
    await expect(canvasElement.querySelector(".parenting-away-segment")).toBeNull();
    await expect(within(canvasElement).getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
  },
};

export const ArchivedAwayParty: Story = {
  args: { width: 1440, hatching: true, archivedHouseholdParty: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector(".calendar-parenting-entry")).not.toBeNull());
    await expect(canvasElement.querySelector(".parenting-away-background")).toBeNull();
  },
};

export const LegacyDisplayPreferencesIgnored: Story = {
  args: { width: 1440, hatching: true },
  play: AwayHatching.play,
};

export const ChildClassificationChanges: Story = {
  args: { width: 1440, hatching: true, classificationControls: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cells = () => canvasElement.querySelectorAll(".today-row .member-event-cell");
    await waitFor(() => expect(cells()[0].querySelector(".parenting-away-segment")).not.toBeNull());
    await expect(cells()[1].querySelector(".parenting-away-background")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Toggle Alex hatching" }));
    await expect(canvasElement.querySelector(".parenting-away-background")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Toggle Alex hatching" }));
    await waitFor(() => expect(cells()[0].querySelector(".parenting-away-segment")).not.toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Toggle linked household membership" }));
    await expect(canvasElement.querySelector(".parenting-away-background")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Toggle linked household membership" }));
    await waitFor(() => expect(cells()[0].querySelector(".parenting-away-segment")).not.toBeNull());
    expect(calendarSettingsCalls).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Swap child classification" }));
    await waitFor(() => expect(cells()[1].querySelector(".parenting-away-segment")).not.toBeNull());
    await expect(cells()[0].querySelector(".parenting-away-background")).toBeNull();
    await expect(canvas.getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "Swap child classification" }));
    await waitFor(() => expect(cells()[0].querySelector(".parenting-away-segment")).not.toBeNull());
    await expect(cells()[1].querySelector(".parenting-away-background")).toBeNull();
  },
};

export const NoChildMembers: Story = {
  args: { width: 1440, hatching: true, noChildren: true },
  play: ArchivedAwayParty.play,
};

export const UnavailableParentingTime: Story = {
  args: { width: 1440, hatching: true, parentingUnavailable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText(/Parenting time could not be loaded; responsibility cannot be determined/)).toBeVisible());
    await expect(canvasElement.querySelector(".parenting-away-background")).toBeNull();
    await expect(canvas.getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
  },
};

export const HatchingDisabledByDefault: Story = {
  args: { width: 1440 },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector(".calendar-parenting-entry")).not.toBeNull());
    await expect(canvasElement.querySelector(".parenting-away-background")).toBeNull();
    await expect(canvasElement.querySelector(".today-row .calendar-childcare-entry")).not.toBeNull();
    await expect(canvasElement.querySelector(".today-row .calendar-birthday-entry")).not.toBeNull();
    await expect(canvasElement.querySelector(".today-row .day-special-corner")).not.toBeNull();
    expect(calendarSettingsCalls).not.toHaveBeenCalled();
  },
};

export const MultipleHouseholdPartyLinks: Story = {
  args: { width: 1440, hatching: true, multipleHouseholdLinks: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll(".today-row .parenting-away-segment")).toHaveLength(1));
    const segment = canvasElement.querySelector(".today-row .parenting-away-segment") as HTMLElement;
    await expect(segment.dataset.partyId).toBe(guardianId);
    await expect(Number.parseFloat(segment.style.top)).toBeCloseTo(100 * 14 / 24);
    await expect(Number.parseFloat(segment.style.height)).toBeCloseTo(100 * 2 / 24);
    await expect(canvasElement.querySelector(`.parenting-away-segment[data-party-id="${momId}"]`)).toBeNull();
    await expect(canvasElement.querySelector(`.parenting-away-segment[data-party-id="${dadId}"]`)).toBeNull();
    const childCell = canvasElement.querySelector(".today-row .member-event-cell")!;
    for (const handoff of ["12:00 → Dad", "14:00 → Guardian", "16:00 → Dad", "18:00 → Mum"]) {
      await expect(childCell.textContent).toContain(handoff);
    }
    await expect(within(canvasElement).getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
    expect(calendarSettingsCalls).not.toHaveBeenCalled();
  },
};

export const PerChildOptOut: Story = {
  args: { width: 1440, hatching: true, secondChildOptedOut: true },
  play: AwayHatching.play,
};

export const NoHouseholdPartyLinks: Story = {
  args: { width: 1440, hatching: true, noHouseholdLinks: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText(/Link an active parenting party to a current household member/)).toBeVisible());
    await expect(canvasElement.querySelector(".parenting-away-background")).toBeNull();
    await expect(within(canvasElement).getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
    expect(calendarSettingsCalls).not.toHaveBeenCalled();
  },
};

export const InvalidHouseholdPartyLink: Story = {
  args: { width: 1440, hatching: true, invalidHouseholdLink: true },
  play: NoHouseholdPartyLinks.play,
};

export const InvalidOutsidePartyLink: Story = {
  args: { width: 1440, hatching: true, invalidOutsideLink: true, additionalOutsideParty: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll(".today-row .parenting-away-segment")).toHaveLength(1));
    const segment = canvasElement.querySelector(".today-row .parenting-away-segment") as HTMLElement;
    await expect(segment.dataset.partyId).toBe(guardianId);
    await expect(Number.parseFloat(segment.style.top)).toBeCloseTo(100 * 14 / 24);
    await expect(Number.parseFloat(segment.style.height)).toBeCloseTo(100 * 2 / 24);
    await expect(canvasElement.querySelector(`.parenting-away-segment[data-party-id="${dadId}"]`)).toBeNull();
    await expect(canvasElement.querySelector(".parenting-handoff-marker")).toBeNull();
    await expect(within(canvasElement).getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
    expect(calendarSettingsCalls).not.toHaveBeenCalled();
  },
};

export const InactiveOutsideParty: Story = {
  args: { width: 1440, hatching: true, inactiveOutsideParty: true },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector(".calendar-parenting-entry")).not.toBeNull());
    await expect(canvasElement.querySelector(".parenting-away-segment")).toBeNull();
    await expect(within(canvasElement).getAllByRole("button", { name: "Open event Music lesson" }).length).toBeGreaterThan(0);
  },
};
