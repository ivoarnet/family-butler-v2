import { useState } from "react";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import { AgentChatDialog } from "./AgentChatDialog";

export function AgentChat({ accessToken }: { accessToken: string }) {
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="fab icon-fab chat-fab"
        onClick={() => setIsAgentChatOpen(true)}
        title="Open Agent Chat"
        aria-label="Open Agent Chat"
      >
        <ChatRoundedIcon fontSize="small" />
      </button>

      <AgentChatDialog open={isAgentChatOpen} onClose={() => setIsAgentChatOpen(false)} accessToken={accessToken} />
    </>
  );
}
