import { useEffect, useMemo, useState } from "react";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { ChatBox, createEchoAdapter } from "@mui/x-chat";
import type { ChatConversation, ChatMessage, ChatUser } from "@mui/x-chat/headless";

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
  const chatAdapter = useMemo(
    () =>
      createEchoAdapter({
        delayMs: 550,
        respond: (text) => `Family Butler Agent draft:\n\n${text}\n\nWould you like this split into weekdays and weekend?`,
      }),
    []
  );

  useEffect(() => {
    if (!isAgentChatOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAgentChatOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAgentChatOpen]);

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

      {isAgentChatOpen ? (
        <section className="agent-chat-overlay" aria-label="Agent Chat">
          <div className="agent-chat-panel" role="dialog" aria-modal="true" aria-label="Agent Chat window">
            <button
              type="button"
              className="icon-button agent-chat-close-button"
              onClick={() => setIsAgentChatOpen(false)}
              title="Close Agent Chat"
              aria-label="Close Agent Chat"
            >
              <CloseRoundedIcon fontSize="small" />
            </button>
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
                composerInput: {
                  placeholder: "Message Family Butler Agent…",
                  "aria-label": "Message Agent Chat",
                },
              }}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
