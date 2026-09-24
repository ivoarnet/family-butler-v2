import CloseIcon from "@mui/icons-material/Close";
import { Avatar, AvatarGroup, Box, Button, Typography, useMediaQuery } from "@mui/material";
import { alpha, styled, useTheme } from "@mui/material/styles";
import {
  DialogActionsBar,
  DialogContentPanel,
  DialogDescription,
  DialogHeader,
  FieldTitle,
  GlassDialog,
  GlassPanel,
  GradientButton,
} from "../../../shared/ui/GlassFormDialog";
import { EventType, FamilyMember, HouseholdEvent } from "../../../types/family";

const ReadonlyRow = styled(Box)({
  border: "1px solid var(--dialog-border)",
  borderRadius: 12,
  minHeight: 52,
  padding: "0.75rem 0.9rem",
  background: "var(--dialog-field)",
  color: "var(--text-primary)",
  display: "grid",
  alignContent: "center",
  gap: "0.2rem",
});

interface EventViewDialogProps {
  open: boolean;
  event: HouseholdEvent | null;
  eventType: EventType | null;
  members: FamilyMember[];
  timeLabel: string;
  onClose: () => void;
  onEdit: () => void;
}

export function EventViewDialog({ open, event, eventType, members, timeLabel, onClose, onEdit }: EventViewDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "event-view-dialog-title";
  const descriptionId = "event-view-dialog-description";

  if (!event) {
    return null;
  }

  const assignedMembers = members.filter((member) => event.memberIds.includes(member.id));

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            Event details
          </Typography>
          <Button type="button" onClick={onClose} aria-label="Close event details dialog" sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}>
            <CloseIcon fontSize="small" />
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            View event details. Switch to edit mode to make changes.
          </DialogDescription>
          <GlassPanel>
            <FieldTitle variant="subtitle1">{event.title}</FieldTitle>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Date</small>
              <span>{event.date}</span>
            </ReadonlyRow>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Time</small>
              <span>{timeLabel}</span>
            </ReadonlyRow>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Type</small>
              <span>{eventType ? `${eventType.icon ? `${eventType.icon} ` : ""}${eventType.name}` : "No type"}</span>
            </ReadonlyRow>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Repeat</small>
              <span>{event.repeatRule ? event.repeatRule : "Does not repeat"}</span>
            </ReadonlyRow>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Family members</small>
              <AvatarGroup max={6} sx={{ justifyContent: "flex-start", "& .MuiAvatar-root": { width: 24, height: 24, fontSize: "0.72rem" } }}>
                {assignedMembers.map((member) => (
                  <Avatar key={member.id} sx={{ bgcolor: member.avatarColor, color: "#fff" }}>
                    {member.firstName.charAt(0)}
                  </Avatar>
                ))}
              </AvatarGroup>
            </ReadonlyRow>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Location</small>
              <span>{event.location || "—"}</span>
            </ReadonlyRow>
            <ReadonlyRow>
              <small style={{ color: "var(--text-secondary)" }}>Notes</small>
              <span>{event.notes || "—"}</span>
            </ReadonlyRow>
          </GlassPanel>
        </DialogContentPanel>

        <DialogActionsBar>
          <Button
            type="button"
            onClick={onClose}
            variant="outlined"
            sx={{
              borderRadius: "999px",
              color: "var(--dialog-muted)",
              borderColor: "var(--dialog-border)",
              textTransform: "none",
              minHeight: 42,
              "&:hover": {
                borderColor: "var(--accent-strong)",
                background: alpha("#7f8bff", 0.12),
              },
            }}
          >
            Close
          </Button>
          <GradientButton type="button" variant="contained" disableElevation onClick={onEdit}>
            Edit event
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
