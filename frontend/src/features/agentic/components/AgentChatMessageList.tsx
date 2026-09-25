import { useEffect, useRef } from "react";
import { ChatMessageContent } from "@mui/x-chat/ChatMessage";
import { MessageContextProvider } from "@mui/x-chat/headless";
import type { ChatMessage as MuiChatMessage, MessageOwnerState } from "@mui/x-chat/headless";
import { AgentChatMessage } from "./AgentChat.types";

const createAssistantMessageOwnerState = (message: AgentChatMessage): MessageOwnerState => {
  const muiChatMessage: MuiChatMessage = {
    id: message.id,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: message.text,
      },
    ],
    status: "sent",
  };

  return {
    messageId: message.id,
    message: muiChatMessage,
    role: "assistant",
    status: "sent",
    streaming: false,
    error: false,
    isGrouped: false,
    variant: "default",
    density: "standard",
    resolvedAuthor: null,
    showAvatar: false,
    isOwnMessage: false,
  };
};

export function AgentChatMessageList({ messages }: { messages: AgentChatMessage[] }) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  return (
    <div ref={listRef} className="agent-chat-message-list" aria-live="polite">
      {messages.map((message) => (
        <article key={message.id} className={`agent-chat-message-row ${message.role}`}>
          <div className="agent-chat-author">{message.author}</div>
          {message.role === "assistant" ? (
            <MessageContextProvider value={createAssistantMessageOwnerState(message)}>
              <ChatMessageContent slotProps={{ bubble: { className: "agent-chat-bubble assistant" } }} />
            </MessageContextProvider>
          ) : (
            <div className={`agent-chat-bubble ${message.role}`}>{message.text}</div>
          )}
        </article>
      ))}
    </div>
  );
}
