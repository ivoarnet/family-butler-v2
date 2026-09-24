import { FormEvent } from "react";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Box, IconButton } from "@mui/material";
import { FormField } from "../../../shared/ui/GlassFormDialog";

export function AgentChatComposer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSend();
  };

  return (
    <Box component="form" className="agent-chat-composer" onSubmit={handleSubmit}>
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
    </Box>
  );
}
