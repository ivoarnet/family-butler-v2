import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { IconButton, Tooltip } from "@mui/material";

export function SettingsInfo({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip title={text} enterTouchDelay={0}>
      <IconButton size="small" aria-label={label} sx={{ color: "var(--text-secondary)" }}>
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
