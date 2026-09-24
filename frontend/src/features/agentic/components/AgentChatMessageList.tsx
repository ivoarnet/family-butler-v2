import { AgentChatMessage } from "./AgentChat.types";

export function AgentChatMessageList({ messages }: { messages: AgentChatMessage[] }) {
  return (
    <div className="agent-chat-message-list" aria-live="polite">
      {messages.map((message) => (
        <article key={message.id} className={`agent-chat-message-row ${message.role}`}>
          <div className="agent-chat-author">{message.author}</div>
          <div className={`agent-chat-bubble ${message.role}`}>{message.text}</div>
        </article>
      ))}
    </div>
  );
}
