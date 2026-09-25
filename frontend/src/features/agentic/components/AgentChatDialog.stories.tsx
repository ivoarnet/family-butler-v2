import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentChatDialog } from "./AgentChatDialog";

const meta: Meta<typeof AgentChatDialog> = {
  title: "Agentic/AgentChatDialog",
  component: AgentChatDialog,
  args: {
    open: true,
    onClose: () => undefined,
    accessToken: "storybook-token",
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof AgentChatDialog>;

export const Default: Story = {};
