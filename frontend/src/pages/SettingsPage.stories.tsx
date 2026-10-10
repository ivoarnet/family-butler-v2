import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type SetStateAction } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import type { HouseholdData, ThemeMode } from "../features/app/types";
import { SettingsPage } from "./SettingsPage";

const household: HouseholdData = {
  householdId: "demo",
  householdName: "Family Calendar",
  familyMembers: [
    { id: "legacy", firstName: "Sam", role: "Child", schoolBuilding: "Legacy School",
      avatarColor: "#8b5cf6", visibleInCalendar: true, order: 0 },
    { id: "child", firstName: "Alex", role: "Daughter", isChild: true, hatchParentingAway: true,
      schoolBuilding: "Riverside School", schoolClass: "3B",
      avatarColor: "#3b82f6", visibleInCalendar: true, order: 1 },
  ],
  contacts: [], eventTypes: [], events: [], dayConfigurations: [],
};

function SettingsMembersStory() {
  const [data, setData] = useState(household);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [refresh, setRefresh] = useState(0);
  const saved = useRef(structuredClone(household));
  const update = (action: SetStateAction<HouseholdData>) => {
    const next = typeof action === "function" ? action(data) : action;
    const payload = JSON.parse(JSON.stringify(next)) as HouseholdData;
    saved.current = { ...payload, familyMembers: payload.familyMembers.map((member) => {
      const previous = saved.current.familyMembers.find(({ id }) => id === member.id);
      return {
        ...member,
        schoolBuilding: Object.prototype.hasOwnProperty.call(member, "schoolBuilding")
          ? member.schoolBuilding?.trim() || undefined : previous?.schoolBuilding,
        schoolClass: Object.prototype.hasOwnProperty.call(member, "schoolClass")
          ? member.schoolClass?.trim() || undefined : previous?.schoolClass,
      };
    }) };
    setData(next);
  };
  return <div className="app-shell">
    <button type="button" onClick={() => {
      setData(structuredClone(saved.current));
      setRefresh((current) => current + 1);
    }}>Reload saved household</button>
    <SettingsPage key={refresh} mode="settings" households={[{ id: "demo", name: "Family Calendar" }]}
      activeHouseholdId="demo" onSwitchHousehold={() => undefined}
      onCreateHousehold={async () => ({ ok: true })} onUpdateHousehold={async () => ({ ok: true })}
      isContextLoading={false} isCreatingHousehold={false} householdData={data} setHouseholdData={update}
      contextError={null} onRetryContextAction={() => undefined} onGoHome={() => undefined}
      initialSection="households" currentUserEmail="demo@example.com" initialProfileFirstName="Demo"
      initialProfileLastName="User" isProfileSaving={false} onSaveProfile={async () => ({ ok: true })}
      theme={theme} setTheme={setTheme} />
  </div>;
}

const meta: Meta<typeof SettingsMembersStory> = {
  title: "Settings/Members",
  component: SettingsMembersStory,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof SettingsMembersStory>;

export const ChildDetailsPersistence: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const membersTable = canvas.getByRole("table", { name: "Household members" });
    await expect(within(membersTable).queryByRole("columnheader", { name: "Color" })).toBeNull();
    await expect(within(membersTable).getAllByRole("columnheader")).toHaveLength(4);
    const edit = async (name: string) => {
      const row = canvas.getByText(name, { exact: true }).closest("tr")!;
      await userEvent.click(within(row).getByRole("button", { name: /Edit/ }));
      return within(await page.findByRole("dialog", { name: "Edit member" }));
    };
    const legacy = await edit("Sam");
    await expect(legacy.getByRole("switch", { name: "Child" })).not.toBeChecked();
    await expect(legacy.queryByRole("textbox", { name: "School building" })).toBeNull();
    await expect(legacy.getByRole("textbox", { name: "Role / relationship" })).toHaveValue("Child");
    await userEvent.click(legacy.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    const child = await edit("Alex");
    await expect(child.getByRole("switch", { name: "Child" })).toBeChecked();
    await expect(child.getByRole("textbox", { name: "School building" })).toHaveValue("Riverside School");
    await fireEvent.change(child.getByRole("textbox", { name: "School class" }), { target: { value: " 4A " } });
    await userEvent.click(child.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved household" }));
    const reloaded = await edit("Alex");
    await expect(reloaded.getByRole("switch", { name: "Child" })).toBeChecked();
    await expect(reloaded.getByRole("switch", { name: /Hatch background/ })).toBeChecked();
    await expect(reloaded.getByRole("textbox", { name: "School building" })).toHaveValue("Riverside School");
    await expect(reloaded.getByRole("textbox", { name: "School class" })).toHaveValue("4A");
    await expect(reloaded.getByRole("textbox", { name: "Role / relationship" })).toHaveValue("Daughter");
    await userEvent.click(reloaded.getByRole("switch", { name: "Child" }));
    await userEvent.click(reloaded.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved household" }));
    const adult = await edit("Alex");
    await expect(adult.getByRole("switch", { name: "Child" })).not.toBeChecked();
    await expect(adult.queryByRole("switch", { name: /Hatch background/ })).toBeNull();
    await userEvent.click(adult.getByRole("switch", { name: "Child" }));
    await expect(adult.getByRole("switch", { name: /Hatch background/ })).toBeChecked();
    await expect(adult.getByRole("textbox", { name: "School class" })).toHaveValue("4A");
    await userEvent.click(adult.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "+ Member" }));
    const added = within(page.getByRole("dialog", { name: "Add member" }));
    await expect(added.getByRole("switch", { name: "Child" })).not.toBeChecked();
    await fireEvent.change(added.getByRole("textbox", { name: "First name" }), { target: { value: "Taylor" } });
    await userEvent.click(added.getByRole("switch", { name: "Child" }));
    await expect(added.getByRole("switch", { name: /Hatch background/ })).not.toBeChecked();
    await userEvent.click(added.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved household" }));
    const optional = await edit("Taylor");
    await expect(optional.getByRole("switch", { name: "Child" })).toBeChecked();
    await expect(optional.getByRole("switch", { name: /Hatch background/ })).not.toBeChecked();
    await expect(optional.getByRole("textbox", { name: "School building" })).toHaveValue("");
    await expect(optional.getByRole("textbox", { name: "School class" })).toHaveValue("");
  },
};

export const ClearingSchoolDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Edit member Alex" }));
    const child = within(await page.findByRole("dialog", { name: "Edit member" }));
    await expect(child.getByRole("textbox", { name: "School building" })).toHaveValue("Riverside School");
    await expect(child.getByRole("textbox", { name: "School class" })).toHaveValue("3B");
    await fireEvent.change(child.getByRole("textbox", { name: "School building" }), { target: { value: "   " } });
    await fireEvent.change(child.getByRole("textbox", { name: "School class" }), { target: { value: "" } });
    await userEvent.click(child.getByRole("button", { name: "Save member" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved household" }));
    await userEvent.click(canvas.getByRole("button", { name: "Edit member Alex" }));
    const refreshed = within(await page.findByRole("dialog", { name: "Edit member" }));
    await expect(refreshed.getByRole("switch", { name: "Child" })).toBeChecked();
    await expect(refreshed.getByRole("textbox", { name: "School building" })).toHaveValue("");
    await expect(refreshed.getByRole("textbox", { name: "School class" })).toHaveValue("");
    await expect(refreshed.getByRole("textbox", { name: "Role / relationship" })).toHaveValue("Daughter");
  },
};

export const PerChildHatchingPersistence: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    for (const initial of [true, false]) {
      await userEvent.click(canvas.getByRole("button", { name: "Edit member Alex" }));
      const dialog = within(await page.findByRole("dialog", { name: "Edit member" }));
      if (initial) await expect(dialog.getByRole("switch", { name: /Hatch background/ })).toBeChecked();
      else await expect(dialog.getByRole("switch", { name: /Hatch background/ })).not.toBeChecked();
      await userEvent.click(dialog.getByRole("switch", { name: /Hatch background/ }));
      await userEvent.click(dialog.getByRole("button", { name: "Save member" }));
      await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
      await userEvent.click(canvas.getByRole("button", { name: "Reload saved household" }));
    }
    await userEvent.click(canvas.getByRole("button", { name: "Edit member Alex" }));
    const refreshed = within(await page.findByRole("dialog", { name: "Edit member" }));
    await expect(refreshed.getByRole("switch", { name: /Hatch background/ })).toBeChecked();
    await expect(refreshed.getByRole("textbox", { name: "School building" })).toHaveValue("Riverside School");
    await expect(refreshed.getByRole("textbox", { name: "School class" })).toHaveValue("3B");
  },
};
