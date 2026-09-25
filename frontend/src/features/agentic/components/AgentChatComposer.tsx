import { ChangeEvent, DragEvent, FormEvent, useRef } from "react";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Box, IconButton } from "@mui/material";
import { FormField } from "../../../shared/ui/GlassFormDialog";
import { AgentChatAttachment } from "./AgentChat.types";

const ACCEPTED_ATTACHMENT_TYPES = "application/pdf,image/png,image/jpeg,image/webp,image/heic";

export function AgentChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  isDragActive,
  onDragActiveChange,
  onFilesSelected,
  attachments,
  onRemoveAttachment,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  isDragActive: boolean;
  onDragActiveChange: (value: boolean) => void;
  onFilesSelected: (files: File[]) => void;
  attachments: AgentChatAttachment[];
  onRemoveAttachment: (attachmentId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSend();
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    onFilesSelected(Array.from(files));
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onDragActiveChange(false);
    addFiles(event.dataTransfer.files);
  };

  return (
    <Box component="form" className="agent-chat-composer" onSubmit={handleSubmit}>
      <div
        className={`agent-chat-dropzone ${isDragActive ? "active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          onDragActiveChange(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          onDragActiveChange(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          onDragActiveChange(false);
        }}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="agent-chat-file-input"
          accept={ACCEPTED_ATTACHMENT_TYPES}
          multiple
          onChange={handleFileInputChange}
        />
        <button type="button" className="agent-chat-attach-button" onClick={() => fileInputRef.current?.click()}>
          <AttachFileRoundedIcon fontSize="small" />
          Attach PDF or image
        </button>
        <span>Drop files here</span>
      </div>

      {attachments.length > 0 ? (
        <ul className="agent-chat-attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <span>{attachment.file.name}</span>
              <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`Remove ${attachment.file.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="agent-chat-input-row">
        <FormField
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Message Family Butler Agent…"
          aria-label="Message Agent Chat"
          fullWidth
          multiline
          minRows={1}
          maxRows={4}
        />
        <IconButton type="submit" aria-label="Send message" className="agent-chat-send-button" disabled={disabled}>
          <SendRoundedIcon fontSize="small" />
        </IconButton>
      </div>
    </Box>
  );
}
