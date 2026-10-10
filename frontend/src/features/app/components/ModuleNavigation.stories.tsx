import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { HouseholdData, SettingsWorkspaceTab } from "../types";
import { DashboardPage } from "../../../pages/DashboardPage";
import { ReportsPage } from "../../../pages/ReportsPage";
import { SettingsPage } from "../../../pages/SettingsPage";
import { ModuleNavigation } from "./ModuleNavigation";

function NavigationStory() {
  const [path, setPath] = useState("/");
  const [tab, setTab] = useState<SettingsWorkspaceTab>("members");
  const [data, setData] = useState<HouseholdData>({
    householdId: "demo", householdName: "Family Calendar", familyMembers: [], contacts: [],
    eventTypes: [], events: [], dayConfigurations: [],
  });
  const navigation = <ModuleNavigation
    activeId={path === "/" ? "family-calendar" : path === "/reports" ? "reports"
      : tab === "childcare" ? "childcare" : tab === "parenting-time" ? "shared-parenting" : undefined}
    onNavigate={(destination) => {
      if (destination.settingsTab) setTab(destination.settingsTab);
      setPath(destination.path);
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
          workspaceTab={tab} onWorkspaceTabChange={setTab} moduleNavigation={navigation} />}
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
    const open = async () => {
      await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
      await userEvent.click(canvas.getByRole("button", { name: "Open module menu" }));
      return within(await page.findByRole("dialog", { name: "Modules" }));
    };
    let menu = await open();
    await expect(menu.getByRole("button", { name: "Family Calendar" })).toHaveAttribute("aria-current", "page");
    await expect(menu.queryByText("Tasks")).toBeNull();
    await expect(menu.queryByText("Shop & Cook")).toBeNull();
    await expect(menu.queryByText("Gamification")).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
    await expect(canvas.getByRole("button", { name: "Open module menu" })).toHaveFocus();

    menu = await open();
    await userEvent.click(menu.getByRole("button", { name: "Close module menu" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
    menu = await open();
    await userEvent.click(menu.getByRole("button", { name: "Childcare" }));
    await expect(await canvas.findByRole("tab", { name: "Childcare" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());

    menu = await open();
    await userEvent.click(menu.getByRole("button", { name: "Shared Parenting (Parenting Time)" }));
    await expect(await canvas.findByRole("tab", { name: "Parenting Time" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Members" }));
    menu = await open();
    await expect(menu.getByRole("button", { name: "Shared Parenting (Parenting Time)" })).not.toHaveAttribute("aria-current");
    await userEvent.click(menu.getByRole("button", { name: "Shared Parenting (Parenting Time)" }));
    await expect(await canvas.findByRole("tab", { name: "Parenting Time" })).toHaveAttribute("aria-selected", "true");

    menu = await open();
    await userEvent.click(menu.getByRole("button", { name: "Reports & exports" }));
    await expect(await canvas.findByRole("heading", { name: "Reports & exports" })).toBeVisible();
    menu = await open();
    await expect(menu.getByRole("button", { name: "Reports & exports" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(menu.getByRole("button", { name: "Family Calendar" }));
    await expect(await canvas.findByRole("heading", { name: "Family Calendar" })).toBeVisible();
    await expect(canvas.getByRole("group", { name: "Period navigation" })).toBeVisible();
  },
};

export const OpenMenu: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open module menu" }));
    await expect(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Modules" })).toBeVisible();
  },
};
