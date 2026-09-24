import { useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { GlassDialog } from "../../../shared/ui/GlassFormDialog";
import { AgentChatMessage } from "./AgentChat.types";
import { AgentChatMessageList } from "./AgentChatMessageList";
import { AgentChatComposer } from "./AgentChatComposer";

const INITIAL_MESSAGES: AgentChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    author: "Family Butler Agent",
    text: "Hi! I’m your Family Butler Agent. I can help draft routines, reminders, and weekly plans.",
  },
  {
    id: "user-seed",
    role: "user",
    author: "You",
    text: "Create a school-week evening routine for Lena and Max.",
  },
  {
    id: "agent-seed",
    role: "assistant",
    author: "Family Butler Agent",
    text: "Great idea. I can draft a weekday plan with dinner, prep for tomorrow, and bedtime. Start by choosing the days you want covered.",
  },
];

const buildReply = (message: string): string =>
  `Family Butler Agent draft:\n\n${message}\n\nWould you like this split into weekdays and weekend?`;

export function AgentChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [messages, setMessages] = useState<AgentChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const userMessage: AgentChatMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      author: "You",
      text,
    };
    const assistantMessage: AgentChatMessage = {
      id: `assistant-${crypto.randomUUID()}`,
      role: "assistant",
      author: "Family Butler Agent",
      text: buildReply(text),
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
  };

  return (
    <GlassDialog open={open} onClose={onClose} fullScreen={fullScreen} aria-label="Agent Chat window">
      <Box className="agent-chat-panel">
        <header className="agent-chat-header">
          <div>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
              Agent Chat
            </Typography>
            <Typography variant="body2" className="agent-chat-subtitle">
              Plan, ask, and get help for family coordination.
            </Typography>
          </div>
          <Button type="button" onClick={onClose} aria-label="Close Agent Chat" sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}>
            <CloseIcon fontSize="small" />
          </Button>
        </header>

        <AgentChatMessageList messages={messages} />
        <AgentChatComposer value={draft} onChange={setDraft} onSend={sendMessage} disabled={!canSend} />
      </Box>
    </GlassDialog>
  );
}
