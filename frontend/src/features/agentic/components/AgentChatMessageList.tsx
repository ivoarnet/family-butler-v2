import { useEffect, useRef } from "react";
import { AgentChatMessage } from "./AgentChat.types";

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
          <div className={`agent-chat-bubble ${message.role}`}>{message.text}</div>
        </article>
      ))}
    </div>
  );
}
