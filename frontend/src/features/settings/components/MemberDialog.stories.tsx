import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import { MemberDialog, MemberDialogFormState } from "./MemberDialog";
import { MEMBER_COLORS } from "../../../shared/family/memberAvatarColors";

const MemberDialogStory = ({ editing = false, child = false }: { editing?: boolean; child?: boolean }) => {
  const [formState, setFormState] = useState<MemberDialogFormState>({
    firstName: child ? "Elsa" : "Alex",
    role: child ? "Daughter" : "Parent",
    isChild: child,
    hatchParentingAway: child,
    schoolBuilding: child ? "Sagenhof" : "",
    schoolClass: child ? "5f" : "",
    avatarColor: MEMBER_COLORS[0],
    visibleInCalendar: true,
  });

  return (
    <MemberDialog
      open
      editing={editing}
      colors={MEMBER_COLORS}
      formState={formState}
      firstNameError={!formState.firstName.trim()}
      onClose={() => undefined}
      onSubmit={(event) => event.preventDefault()}
      onFirstNameChange={(value) => setFormState((current) => ({ ...current, firstName: value }))}
      onRoleChange={(value) => setFormState((current) => ({ ...current, role: value }))}
      onIsChildChange={(value) => setFormState((current) => ({ ...current, isChild: value }))}
      onHatchParentingAwayChange={(value) => setFormState((current) => ({ ...current, hatchParentingAway: value }))}
      onSchoolBuildingChange={(value) => setFormState((current) => ({ ...current, schoolBuilding: value }))}
      onSchoolClassChange={(value) => setFormState((current) => ({ ...current, schoolClass: value }))}
      onAvatarColorChange={(value) => setFormState((current) => ({ ...current, avatarColor: value }))}
      onVisibleInCalendarChange={(value) => setFormState((current) => ({ ...current, visibleInCalendar: value }))}
    />
  );
};

const meta: Meta<typeof MemberDialogStory> = {
  title: "Settings/MemberDialog",
  component: MemberDialogStory,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof MemberDialogStory>;

export const AddMember: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const child = dialog.getByRole("switch", { name: "Child" });
    await expect(child).not.toBeChecked();
    await expect(dialog.queryByRole("textbox", { name: "School building" })).toBeNull();
    await expect(dialog.queryByRole("switch", { name: /Hatch background/ })).toBeNull();
    await expect(dialog.getByRole("textbox", { name: "Role / relationship" })).toHaveValue("Parent");
    await userEvent.click(child);
    const hatch = dialog.getByRole("switch", { name: /Hatch background/ });
    await expect(hatch).not.toBeChecked();
    await userEvent.click(hatch);
    await expect(dialog.getByRole("textbox", { name: "School class" })).toHaveValue("");
    await userEvent.click(dialog.getByRole("button", { name: "Save member" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "School building" }), { target: { value: "Riverside School" } });
    await fireEvent.change(dialog.getByRole("textbox", { name: "School class" }), { target: { value: "3B" } });
    await userEvent.click(child);
    await expect(dialog.queryByRole("textbox", { name: "School class" })).toBeNull();
    await expect(dialog.queryByRole("switch", { name: /Hatch background/ })).toBeNull();
    await userEvent.click(child);
    await expect(dialog.getByRole("textbox", { name: "School building" })).toHaveValue("Riverside School");
    await expect(dialog.getByRole("textbox", { name: "School building" })).toHaveAttribute("maxlength", "100");
    await expect(dialog.getByRole("textbox", { name: "School class" })).toHaveValue("3B");
    await expect(dialog.getByRole("textbox", { name: "School class" })).toHaveAttribute("maxlength", "50");
    await expect(dialog.getByRole("switch", { name: /Hatch background/ })).toBeChecked();
    await expect(dialog.getByRole("textbox", { name: "Role / relationship" })).toHaveValue("Parent");
  },
};
export const EditMember: Story = {
  args: {
    editing: true,
  },
};
export const ChildMemberDetails: Story = {
  args: { editing: true, child: true },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(dialog.getByRole("switch", { name: "Child" })).toBeChecked();
    await expect(dialog.getByRole("switch", { name: /Hatch background/ })).toBeChecked();
    await expect(dialog.getByRole("textbox", { name: "School building" })).toHaveValue("Sagenhof");
    await expect(dialog.getByRole("textbox", { name: "School class" })).toHaveValue("5f");
  },
};
