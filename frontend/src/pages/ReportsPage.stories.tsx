import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import type { HouseholdData } from "../features/app/types";
import { ReportsPage } from "./ReportsPage";

const today = new Date();
const firstOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const firstReportDate = isoDate(firstOfNextMonth);
const household: HouseholdData = {
  householdId: "demo",
  householdName: "Family Calendar",
  familyMembers: [
    { id: "alex", firstName: "Alex", avatarColor: "#3b82f6", visibleInCalendar: true, order: 0 },
    { id: "sam", firstName: "Sam", avatarColor: "#8b5cf6", visibleInCalendar: true, order: 1 },
  ],
  contacts: [],
  eventTypes: [],
  events: [
    { id: "alex-event", title: "Music lesson", date: firstReportDate, allDay: false, startTime: "15:00", endTime: "16:00", memberIds: ["alex"] },
    { id: "family-event", title: "Family dinner", date: firstReportDate, allDay: true, memberIds: [] },
  ],
  dayConfigurations: [],
};

function ReportsStory() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/childcare/occurrences?")) return Response.json({ occurrences: [] });
      if (url.includes("/parenting-time/resolve?")) return Response.json({ intervals: [] });
      return originalFetch(input);
    };
    return () => { window.fetch = originalFetch; };
  }, []);
  return <ReportsPage householdData={household} accessToken="storybook-token" onGoHome={() => undefined} />;
}

const meta: Meta<typeof ReportsStory> = {
  title: "Reports/CalendarReport",
  component: ReportsStory,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ReportsStory>;

export const CalendarReport: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fromDate = canvas.getByLabelText("From") as HTMLInputElement;
    const toDate = canvas.getByLabelText("To") as HTMLInputElement;
    const threeMonthsLater = new Date(firstOfNextMonth.getFullYear(), firstOfNextMonth.getMonth() + 3, 0);
    await expect(fromDate.value).toBe(firstReportDate);
    await expect(toDate.value).toBe(isoDate(threeMonthsLater));
    await expect(canvas.getByRole("columnheader", { name: "Alex" })).toBeVisible();
    await expect(canvas.getByRole("columnheader", { name: "Sam" })).toBeVisible();
    await expect(canvas.getByText(/Music lesson/)).toBeVisible();
    await expect(canvas.getByText(/Family dinner/)).toBeVisible();
    await expect(canvas.getByRole("columnheader", { name: "Day" })).toBeVisible();
    await expect(canvas.getByRole("columnheader", { name: "Events" })).toBeVisible();
    await expect(canvas.getByRole("columnheader", { name: "Specials" })).toBeVisible();
    const dayRows = canvasElement.querySelectorAll(".report-table tbody tr");
    await expect(dayRows.length).toBeGreaterThanOrEqual(89);
    await expect(dayRows.length).toBeLessThanOrEqual(92);

    const link = await canvas.findByRole("link", { name: `Download calendar report from ${fromDate.value} to ${toDate.value} as PDF` });
    await waitFor(() => expect(link.getAttribute("href")).toMatch(/^blob:/));
    await expect(link.getAttribute("download")).toContain(`family-calendar-${fromDate.value}-to-${toDate.value}.pdf`);
    const pdf = await fetch(link.getAttribute("href")!).then((response) => response.arrayBuffer());
    const pdfContents = new TextDecoder().decode(pdf);
    const pdfHeader = pdfContents.slice(0, 8);
    await expect(pdfHeader).toContain("%PDF-");
    await expect(pdfContents).toMatch(/\/MediaBox \[0 0 841\.89\d* 1190\.55\d*\]/);
    await expect(pdfContents.match(/\/Type\s*\/Page\b/g) ?? []).toHaveLength(3);

    const previousDate = new Date(firstOfNextMonth);
    previousDate.setDate(previousDate.getDate() - 1);
    await fireEvent.change(toDate, { target: { value: isoDate(previousDate) } });
    await expect(canvas.getByRole("alert")).toHaveTextContent("Choose valid dates");
    await expect(canvas.queryByRole("link", { name: /Download calendar report/ })).toBeNull();
    await fireEvent.change(toDate, { target: { value: isoDate(threeMonthsLater) } });
    await expect(canvas.queryByRole("alert")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Back to calendar" }));
  },
};
