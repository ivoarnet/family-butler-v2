import type { Meta, StoryObj } from "@storybook/react-vite";
import { AvatarContextMenu } from "./AvatarContextMenu";

const meta: Meta<typeof AvatarContextMenu> = {
  title: "Shared/AvatarContextMenu",
  component: AvatarContextMenu,
  args: {
    currentUserLabel: "Alex Doe",
    currentUserEmail: "alex@example.com",
    currentUserInitials: "AD",
    currentUserAvatarUrl: null,
    onProfileClick: () => undefined,
    onHouseholdsClick: () => undefined,
    onLogoutClick: () => undefined,
  },
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof AvatarContextMenu>;

export const InitialsAvatar: Story = {};

export const ImageAvatar: Story = {
  args: {
    currentUserAvatarUrl: "https://avatars.githubusercontent.com/u/9919?s=200&v=4",
    currentUserInitials: "GH",
  },
};
