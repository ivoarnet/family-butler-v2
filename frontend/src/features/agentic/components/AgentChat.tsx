import { useMemo, useState } from "react";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, Button, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ChatBox, createEchoAdapter } from "@mui/x-chat";
import type { ChatConversation, ChatMessage, ChatUser } from "@mui/x-chat/headless";
import { GlassDialog } from "../../../shared/ui/GlassFormDialog";

const CHAT_MEMBERS: ChatUser[] = [
  { id: "user", displayName: "You", role: "user" },
  { id: "agent", displayName: "Family Butler Agent", role: "assistant" },
];

const CHAT_CONVERSATIONS: ChatConversation[] = [
  {
    id: "family-butler-agent",
    title: "Agent Chat",
    subtitle: "Plan, ask, and get help for family coordination.",
    participants: CHAT_MEMBERS,
  },
];

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    author: { id: "agent", displayName: "Family Butler Agent" },
    conversationId: "family-butler-agent",
    parts: [{ type: "text", text: "Hi! I’m your Family Butler Agent. I can help draft routines, reminders, and weekly plans." }],
  },
  {
    id: "user-seed",
    role: "user",
    author: { id: "user", displayName: "You" },
    conversationId: "family-butler-agent",
    parts: [{ type: "text", text: "Create a school-week evening routine for Lena and Max." }],
  },
  {
    id: "agent-seed",
    role: "assistant",
    author: { id: "agent", displayName: "Family Butler Agent" },
    conversationId: "family-butler-agent",
    parts: [
      {
        type: "text",
        text: "Great idea. I can draft a weekday plan with dinner, prep for tomorrow, and bedtime. Start by choosing the days you want covered.",
      },
    ],
  },
];

export function AgentChat() {
  const [isAgentChatOpen, setIsAgentChatOpen] = useState(false);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const chatAdapter = useMemo(
    () =>
      createEchoAdapter({
        delayMs: 550,
        respond: (text) => `Family Butler Agent draft:\n\n${text}\n\nWould you like this split into weekdays and weekend?`,
      }),
    []
  );

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

      <GlassDialog
        open={isAgentChatOpen}
        onClose={() => setIsAgentChatOpen(false)}
        fullScreen={fullScreen}
        aria-label="Agent Chat window"
      >
        <Box className="agent-chat-panel">
          <Button
            type="button"
            className="agent-chat-close-button"
            onClick={() => setIsAgentChatOpen(false)}
            title="Close Agent Chat"
            aria-label="Close Agent Chat"
            sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px", position: "absolute", top: "0.8rem", right: "0.9rem", zIndex: 4 }}
          >
            <CloseRoundedIcon fontSize="small" />
          </Button>
            <ChatBox
              className="mui-agent-chat-box"
              adapter={chatAdapter}
              members={CHAT_MEMBERS}
              currentUser={CHAT_MEMBERS[0]}
              initialConversations={CHAT_CONVERSATIONS}
              initialActiveConversationId="family-butler-agent"
              initialMessages={INITIAL_CHAT_MESSAGES}
              features={{
                conversationList: false,
                attachments: false,
                helperText: false,
                suggestions: false,
              }}
              slotProps={{
                root: {
                  sx: { height: "100%" },
                },
                conversationRoot: {
                  sx: { height: "100%" },
                },
                conversationHeader: {
                  className: "agent-chat-conversation-header",
                },
                conversationTitle: {
                  sx: { fontWeight: 700 },
                },
                conversationSubtitle: {
                  sx: { color: "var(--text-secondary)" },
                },
                messageList: {
                  sx: { px: "1.25rem", py: "1.2rem", background: "transparent" },
                },
                messageRoot: {
                  sx: { mb: "0.55rem" },
                },
                messageContent: {
                  className: "agent-chat-message-content",
                },
                composerRoot: {
                  sx: {
                    borderTop: "1px solid var(--border)",
                    background: "var(--surface-strong)",
                  },
                },
                composerInput: {
                  placeholder: "Message Family Butler Agent…",
                  "aria-label": "Message Agent Chat",
                  sx: {
                    borderRadius: "999px",
                    border: "1px solid var(--border)",
                    background: "var(--dialog-field)",
                  },
                },
              }}
            />
        </Box>
      </GlassDialog>
    </>
  );
}
