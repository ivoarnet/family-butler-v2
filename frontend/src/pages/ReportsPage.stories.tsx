import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ReportsPage } from "./ReportsPage";

const onGoHome = fn();

const meta: Meta<typeof ReportsPage> = {
  title: "Reports/ReportsAndExports",
  component: ReportsPage,
  args: {
    householdName: "Family Calendar",
    onGoHome,
  },
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ReportsPage>;

export const ReportsAndExports: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Reports & exports" })).toBeVisible();
    await expect(canvas.getByText("More reports and exports are coming")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Go back" }).querySelector("svg")).toHaveAttribute("data-testid", "ArrowBackIcon");
    await userEvent.click(canvas.getByRole("button", { name: "Go to dashboard" }));
    await expect(onGoHome).toHaveBeenCalled();
  },
};
