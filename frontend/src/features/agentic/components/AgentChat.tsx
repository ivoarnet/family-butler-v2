import { useState } from "react";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import { AgentChatDialog } from "./AgentChatDialog";

export function AgentChat({
  accessToken,
  householdId,
  onCloseChat,
}: {
  accessToken: string;
  householdId: string;
  onCloseChat: () => void;
}) {
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false);

  const handleClose = () => {
    setIsAgentChatOpen(false);
    onCloseChat();
  };

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

      <AgentChatDialog open={isAgentChatOpen} onClose={handleClose} accessToken={accessToken} householdId={householdId} />
    </>
  );
}
