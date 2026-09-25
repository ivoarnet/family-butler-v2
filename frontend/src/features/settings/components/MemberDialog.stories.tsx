import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MemberDialog, MemberDialogFormState } from "./MemberDialog";
import { MEMBER_COLORS } from "../../../shared/family/memberAvatarColors";

const MemberDialogStory = ({ editing = false }: { editing?: boolean }) => {
  const [formState, setFormState] = useState<MemberDialogFormState>({
    firstName: "Alex",
    role: "Parent",
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

export const AddMember: Story = {};
export const EditMember: Story = {
  args: {
    editing: true,
  },
};
