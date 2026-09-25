import { useMemo, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { GlassDialog } from "../../../shared/ui/GlassFormDialog";
import { AgentChatAttachment, AgentChatMessage } from "./AgentChat.types";
import { AgentChatMessageList } from "./AgentChatMessageList";
import { AgentChatComposer } from "./AgentChatComposer";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 4;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]);

const INITIAL_MESSAGES: AgentChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    author: "Family Butler Agent",
    text: "Hi! Send a message and optionally attach PDF or image files.",
  },
];

const parseResponseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
};

const fileToBase64 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const buildUserMessage = (text: string, attachments: AgentChatAttachment[]): string => {
  const trimmed = text.trim();
  if (attachments.length === 0) {
    return trimmed;
  }

  const attachmentSummary = attachments.map((attachment) => attachment.file.name).join(", ");
  return trimmed ? `${trimmed}\n\nAttachments: ${attachmentSummary}` : `Attachments: ${attachmentSummary}`;
};

const toHistoryRole = (role: AgentChatMessage["role"]): "user" | "assistant" => (role === "assistant" ? "assistant" : "user");

export function AgentChatDialog({
  open,
  onClose,
  accessToken,
  householdId,
}: {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  householdId: string;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [messages, setMessages] = useState<AgentChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<AgentChatAttachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(() => (draft.trim().length > 0 || attachments.length > 0) && !isSending, [draft, attachments, isSending]);

  const addAssistantMessage = (text: string) => {
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant",
        author: "Family Butler Agent",
        text,
      },
    ]);
  };

  const onFilesSelected = (files: File[]) => {
    const nextAttachments = [...attachments];

    for (const file of files) {
      const normalizedMime = file.type.toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        addAssistantMessage(`Unsupported file type: ${file.name}`);
        continue;
      }

      if (file.size > MAX_FILE_BYTES) {
        addAssistantMessage(`File is too large (max 5MB): ${file.name}`);
        continue;
      }

      if (nextAttachments.length >= MAX_FILES_PER_MESSAGE) {
        addAssistantMessage(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
        break;
      }

      nextAttachments.push({
        id: crypto.randomUUID(),
        file,
      });
    }

    setAttachments(nextAttachments);
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) {
      return;
    }

    const currentAttachments = attachments;
    const history = messages
      .filter((message) => message.id !== "welcome")
      .map((message) => ({
        role: toHistoryRole(message.role),
        text: message.text,
      }));

    setMessages((current) => [
      ...current,
      {
        id: `user-${crypto.randomUUID()}`,
        role: "user",
        author: "You",
        text: buildUserMessage(text, currentAttachments),
      },
    ]);

    setDraft("");
    setAttachments([]);
    setIsSending(true);

    try {
      const attachmentPayload = await Promise.all(
        currentAttachments.map(async (attachment) => ({
          name: attachment.file.name,
          mimeType: attachment.file.type,
          sizeBytes: attachment.file.size,
          dataBase64: await fileToBase64(attachment.file),
        }))
      );

      const response = await fetch(`${API_BASE_URL}/api/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ["Bearer", accessToken].join(" "),
          "x-supabase-auth-token": accessToken,
        },
        body: JSON.stringify({
          message: text,
          householdId,
          history,
          attachments: attachmentPayload,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseResponseError(response, "Failed to send chat message"));
      }

      const payload = (await response.json()) as { reply?: unknown };
      const reply = typeof payload.reply === "string" && payload.reply.trim() ? payload.reply : "The agent returned an empty response.";
      addAssistantMessage(reply);
    } catch (error) {
      addAssistantMessage(error instanceof Error ? error.message : "Failed to send chat message");
    } finally {
      setIsSending(false);
    }
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
        <AgentChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => {
            void sendMessage();
          }}
          disabled={!canSend}
          isDragActive={isDragActive}
          onDragActiveChange={setIsDragActive}
          onFilesSelected={onFilesSelected}
          attachments={attachments}
          onRemoveAttachment={(attachmentId) => {
            setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
          }}
        />
      </Box>
    </GlassDialog>
  );
}
