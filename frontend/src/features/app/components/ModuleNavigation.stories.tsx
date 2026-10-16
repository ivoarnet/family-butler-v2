import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { HouseholdData } from "../types";
import { DashboardPage } from "../../../pages/DashboardPage";
import { ReportsPage } from "../../../pages/ReportsPage";
import { SettingsPage } from "../../../pages/SettingsPage";
import { ModuleNavigation } from "./ModuleNavigation";

function NavigationStory() {
  const [path, setPath] = useState("/");
  const [data, setData] = useState<HouseholdData>({
    householdId: "demo", householdName: "Family Calendar", familyMembers: [], contacts: [],
    eventTypes: [], events: [], dayConfigurations: [],
  });
  const navigation = <ModuleNavigation
    activeId={path === "/" || path === "/settings" ? "family-calendar" : undefined}
    onNavigate={(destination) => {
      if (destination.path) setPath(destination.path);
    }} />;

  return <div className="app-shell">
    {path === "/" ? <DashboardPage householdData={data} setHouseholdData={setData}
      moduleNavigation={navigation} onOpenSettings={() => setPath("/settings")} onOpenReports={() => setPath("/reports")}
      currentUserLabel="Demo" currentUserEmail="demo@example.com" currentUserInitials="D"
      currentUserAvatarUrl={null} accessToken="" onAgentDataChanged={() => undefined} onSignOut={async () => undefined} />
      : path === "/reports" ? <ReportsPage householdName={data.householdName} onGoHome={() => setPath("/")}
        moduleNavigation={navigation} />
        : <SettingsPage mode="settings" households={[]} activeHouseholdId="demo"
          onSwitchHousehold={() => undefined} onCreateHousehold={async () => ({ ok: true })}
          onUpdateHousehold={async () => ({ ok: true })} isContextLoading={false} isCreatingHousehold={false}
          householdData={data} setHouseholdData={setData} contextError={null} onRetryContextAction={() => undefined}
          onGoHome={() => setPath("/")} initialSection="profile" currentUserEmail="demo@example.com"
          initialProfileFirstName="Demo" initialProfileLastName="" isProfileSaving={false}
          onSaveProfile={async () => ({ ok: true })} theme="dark" setTheme={() => undefined}
          moduleNavigation={navigation} />}
  </div>;
}

const meta: Meta<typeof NavigationStory> = {
  title: "App/Module navigation",
  component: NavigationStory,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof NavigationStory>;

export const NavigationAndDismissal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Open module menu" });
    await expect(trigger).toHaveAttribute("title", "Calendar — Open module menu");
    await expect(trigger.querySelector("svg")).not.toBeNull();
    await expect(trigger.closest(".header-branding")?.querySelectorAll("svg")).toHaveLength(1);
    await expect(trigger.closest(".header-branding")?.querySelector(".icon-badge")).toBeNull();
    if (window.matchMedia("(min-width:1200px)").matches) {
      const nav = page.getByRole("navigation", { name: "Modules" });
      const calendar = within(nav).getByRole("button", { name: "Calendar" });
      await expect(calendar).toHaveAttribute("aria-current", "page");
      await expect(within(nav).getByRole("button", { name: "Tasks Coming soon" })).toHaveAttribute("aria-disabled", "true");
      const label = within(nav).getByText("Calendar");
      const paper = nav.closest(".MuiDrawer-paper")!;
      const pageBounds = canvas.getByRole("banner").getBoundingClientRect();
      await expect(pageBounds.left).toBe(window.innerWidth >= 1600 ? 240 : 80);
      if (window.innerWidth < 1600) {
        await expect(label).not.toBeVisible();
        await userEvent.click(trigger);
        await expect(calendar).toHaveFocus();
        await expect(label).toBeVisible();
        await expect(paper.getBoundingClientRect().width).toBe(240);
        calendar.blur();
      } else {
        await expect(label).toBeVisible();
      }
      await userEvent.click(canvas.getByRole("button", { name: "Open reports" }));
      await expect(await canvas.findByRole("heading", { name: "Reports & exports" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Calendar" }));
      await expect(await canvas.findByRole("heading", { name: "Family Calendar" })).toBeVisible();
      await expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull();
      return;
    }
    const open = async () => {
      await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
      await userEvent.click(canvas.getByRole("button", { name: "Open module menu" }));
      return within(await page.findByRole("dialog", { name: "Modules" }));
    };
    let menu = await open();
    await expect(menu.getByRole("button", { name: "Calendar" }).querySelector("svg")?.innerHTML)
      .toBe(trigger.querySelector("svg")?.innerHTML);
    await expect(menu.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    const tasks = menu.getByRole("button", { name: "Tasks Coming soon" });
    await expect(tasks).toHaveAttribute("aria-disabled", "true");
    await expect(menu.queryByText("Calendar")).toBeNull();
    await expect(menu.queryByText("Tasks")).toBeNull();
    const list = menu.getByRole("list").getBoundingClientRect();
    const drawer = page.getByRole("dialog", { name: "Modules" }).getBoundingClientRect();
    await expect(drawer.width).toBeLessThanOrEqual(80);
    await expect(Math.abs((list.top + list.bottom) / 2 - (drawer.top + drawer.bottom) / 2)).toBeLessThanOrEqual(2);
    await userEvent.hover(menu.getByRole("button", { name: "Calendar" }));
    await expect(await page.findByRole("tooltip")).toHaveTextContent("Calendar");
    await userEvent.unhover(menu.getByRole("button", { name: "Calendar" }));
    await expect(menu.getAllByRole("button")).toHaveLength(3);
    await expect(menu.queryByText("Childcare")).toBeNull();
    await expect(menu.queryByText(/Shared Parenting/)).toBeNull();
    await expect(menu.queryByText("Reports & exports")).toBeNull();
    await expect(menu.queryByText("Shop & Cook")).toBeNull();
    await expect(menu.queryByText("Gamification")).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
    await expect(canvas.getByRole("button", { name: "Open module menu" })).toHaveFocus();

    menu = await open();
    await userEvent.click(menu.getByRole("button", { name: "Close module menu" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await expect(await canvas.findByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Childcare" }));
    await expect(canvas.getByRole("tab", { name: "Childcare" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Parenting Time" }));
    await expect(canvas.getByRole("tab", { name: "Parenting Time" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Members" }));
    menu = await open();
    await userEvent.click(menu.getByRole("button", { name: "Calendar" }));
    await expect(await canvas.findByRole("heading", { name: "Family Calendar" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open reports" }));
    await expect(await canvas.findByRole("heading", { name: "Reports & exports" })).toBeVisible();
    menu = await open();
    await expect(menu.getByRole("button", { name: "Calendar" })).not.toHaveAttribute("aria-current");
    await userEvent.click(menu.getByRole("button", { name: "Calendar" }));
    await expect(await canvas.findByRole("heading", { name: "Family Calendar" })).toBeVisible();
    await expect(canvas.getByRole("group", { name: "Period navigation" })).toBeVisible();
  },
};

export const OpenMenu: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open module menu" }));
    await expect(await within(canvasElement.ownerDocument.body).findByRole(
      window.matchMedia("(min-width:1200px)").matches ? "navigation" : "dialog", { name: "Modules" })).toBeVisible();
  },
};

export const TasksHeaderIcon: Story = {
  render: () => <ModuleNavigation activeId="tasks" onNavigate={() => undefined} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open module menu" });
    await expect(trigger).toHaveAttribute("title", "Tasks — Open module menu");
    await expect(trigger.querySelector("svg")).not.toBeNull();
    await userEvent.click(trigger);
    const desktop = window.matchMedia("(min-width:1200px)").matches;
    const menu = within(await within(canvasElement.ownerDocument.body).findByRole(desktop ? "navigation" : "dialog", { name: "Modules" }));
    await expect(menu.getByRole("button", { name: "Tasks Coming soon" }).querySelector("svg")?.innerHTML)
      .toBe(trigger.querySelector("svg")?.innerHTML);
    await expect(menu.getByRole("button", { name: "Calendar" }).querySelector("svg")?.innerHTML)
      .not.toBe(trigger.querySelector("svg")?.innerHTML);
    if (!desktop) {
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(trigger).toHaveFocus());
    }
  },
};
