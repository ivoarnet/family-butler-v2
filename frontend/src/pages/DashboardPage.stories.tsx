import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { HouseholdData } from "../features/app/types";
import { DashboardPage } from "./DashboardPage";

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
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
        accessToken=""
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

export const Desktop: Story = { args: { width: 1440 } };
export const DayAndEvents: Story = {
  args: { width: 800 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alex = canvas.getByRole("button", { name: "Filter events for Alex" });
    const sam = canvas.getByRole("button", { name: "Filter events for Sam" });
    const period = canvas.getByRole("banner").querySelector("p")?.textContent;
    const events = () => canvas.getAllByRole("button", { name: "Open event Family picnic" });

    await expect(alex.querySelector(".avatar")?.getBoundingClientRect().width).toBe(alex.getBoundingClientRect().width);
    await expect(alex.querySelector(".avatar")?.getBoundingClientRect().height).toBe(alex.getBoundingClientRect().height);
    await expect(events()).toHaveLength(1);
    await expect(canvas.getByRole("button", { name: "Open event Hidden member event" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Filter events for Hidden" })).toBeNull();
    await userEvent.click(alex);
    await expect(alex).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.queryByRole("button", { name: "Open event Football practice" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "Open event Household reminder" })).toBeVisible();
    await expect(canvas.getByText("Birthday: Taylor")).toBeVisible();
    await expect(canvas.getAllByRole("button", { name: "Open event Daily check-in" }).length).toBeGreaterThan(1);
    await userEvent.click(sam);
    await expect(alex).toHaveAttribute("aria-pressed", "false");
    await expect(sam).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.queryByRole("button", { name: "Open event Music lesson" })).toBeNull();
    await expect(events()).toHaveLength(1);
    await userEvent.click(sam);
    await expect(sam).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.getByRole("button", { name: "Open event Music lesson" })).toBeVisible();
    await expect(canvas.getByRole("banner").querySelector("p")?.textContent).toBe(period);
    await expect(canvas.getByRole("button", { name: "2 Weeks" })).toHaveAttribute("aria-pressed", "true");
  },
};
export const DayGroupedEvents: Story = {
  args: { width: 390 },
  play: DayAndEvents.play,
};
