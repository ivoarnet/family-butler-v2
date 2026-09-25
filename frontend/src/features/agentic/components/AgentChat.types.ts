export interface AgentChatMessage {
  id: string;
  role: "assistant" | "user";
  author: string;
  text: string;
}

export interface AgentChatAttachment {
  id: string;
  file: File;
}
