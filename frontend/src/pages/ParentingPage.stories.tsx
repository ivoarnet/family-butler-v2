import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import dayjs from "dayjs";
import { ParentingPage } from "./ParentingPage";

const request = fn(async (_path: string, _init?: RequestInit) => ({
  intervals: [{
    startAt: "2026-10-16T12:00:00.000Z",
    endAt: "2026-10-18T18:00:00.000Z",
    partyId: "party-1",
    partyName: "Mum",
    source: { type: "change", label: "School holiday" },
  }],
}));

const meta: Meta<typeof ParentingPage> = {
  title: "Parenting/Schedule",
  component: ParentingPage,
  parameters: { layout: "fullscreen" },
  args: {
    householdId: "household-1",
    householdName: "The Family",
    request,
    onGoHome: fn(),
  },
  beforeEach: () => { request.mockClear(); },
};
export default meta;
type Story = StoryObj<typeof ParentingPage>;

export const UpcomingSchedule: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = await canvas.findByRole("table", { name: "Parenting schedule" });
    await expect(within(table).getByRole("columnheader", { name: "From" })).toBeVisible();
    await expect(within(table).getByRole("columnheader", { name: "Until" })).toBeVisible();
    await expect(within(table).getByRole("columnheader", { name: "With" })).toBeVisible();
    await expect(within(table).getByRole("columnheader", { name: "Schedule (Remark)" })).toBeVisible();
    await expect(within(table).getByText("Mum")).toBeVisible();
    await expect(within(table).getByText("Change · School holiday")).toBeVisible();

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const [path] = request.mock.calls[0];
    const range = new URL(path, "http://storybook.local").searchParams;
    const startAt = new Date(range.get("startAt")!);
    const expectedEndAt = dayjs(startAt).add(3, "month").toDate();
    await expect(range.get("endAt")).toBe(expectedEndAt.toISOString());
  },
};
