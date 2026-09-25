import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentChatDialog } from "./AgentChatDialog";

const meta: Meta<typeof AgentChatDialog> = {
  title: "Agentic/AgentChatDialog",
  component: AgentChatDialog,
  args: {
    open: true,
    onClose: () => undefined,
    accessToken: "storybook-token",
    householdId: "00000000-0000-0000-0000-000000000001",
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof AgentChatDialog>;

export const Default: Story = {};
