import { Dialog } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { EventType, FamilyMember, HouseholdEvent } from "../../../types/family";
import { EventDetailCard } from "./EventDetailCard";

const EventDetailDialogShell = styled(Dialog)(({ theme }) => ({
  "& .MuiBackdrop-root": {
    background: "var(--dialog-backdrop)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
  "& .MuiDialog-paper": {
    width: "min(760px, calc(100vw - 2rem))",
    margin: theme.spacing(1),
    borderRadius: 24,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    overflow: "visible",
  },
}));

interface EventDetailDialogProps {
  open: boolean;
  event: HouseholdEvent | null;
  eventType: EventType | null;
  members: FamilyMember[];
  onClose: () => void;
  onEdit: () => void;
}

export function EventDetailDialog({ open, event, eventType, members, onClose, onEdit }: EventDetailDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  if (!event) {
    return null;
  }

  return (
    <EventDetailDialogShell open={open} onClose={onClose} aria-labelledby="event-detail-title" fullScreen={fullScreen}>
      <EventDetailCard event={event} eventType={eventType} members={members} onEdit={onEdit} onClose={onClose} />
    </EventDetailDialogShell>
  );
}
