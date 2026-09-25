import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { Avatar, AvatarGroup, Box, IconButton, Stack, Typography, useMediaQuery } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import {
  DialogContentPanel,
  DialogHeader,
  GlassDialog,
  GlassPanel,
} from "../../../shared/ui/GlassFormDialog";
import { EventType, FamilyMember, HouseholdEvent } from "../../../types/family";

const DetailGrid = styled(Box)({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.8rem",
  "@media (max-width: 720px)": {
    gridTemplateColumns: "1fr",
  },
});

const DetailCard = styled(Box)({
  border: "1px solid var(--dialog-border)",
  borderRadius: 12,
  padding: "0.8rem 0.9rem",
  background: "var(--dialog-field)",
  color: "var(--text-primary)",
  display: "grid",
  gap: "0.3rem",
});

const DetailLabel = styled("small")({
  color: "var(--text-secondary)",
  fontWeight: 600,
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
          <Box>
            <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
              {event.title}
            </Typography>
            <Typography id={descriptionId} variant="body2" sx={{ color: "var(--text-secondary)" }}>
              Event details
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <IconButton onClick={onEdit} aria-label="Edit event" sx={{ color: "var(--text-primary)" }}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={onClose} aria-label="Close event details dialog" sx={{ color: "var(--text-primary)" }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogHeader>

        <DialogContentPanel>
          <GlassPanel>
            <DetailGrid>
              <DetailCard>
                <DetailLabel>Date</DetailLabel>
                <span>{event.date}</span>
              </DetailCard>
              <DetailCard>
                <DetailLabel>Time</DetailLabel>
                <span>{timeLabel}</span>
              </DetailCard>
              <DetailCard>
                <DetailLabel>Type</DetailLabel>
                <span>{eventType ? `${eventType.icon ? `${eventType.icon} ` : ""}${eventType.name}` : "No type"}</span>
              </DetailCard>
              <DetailCard>
                <DetailLabel>Repeat</DetailLabel>
                <span>{event.repeatRule ? event.repeatRule : "Does not repeat"}</span>
              </DetailCard>
              <DetailCard>
                <DetailLabel>Family members</DetailLabel>
                {assignedMembers.length ? (
                  <AvatarGroup max={6} sx={{ justifyContent: "flex-start", "& .MuiAvatar-root": { width: 24, height: 24, fontSize: "0.72rem" } }}>
                    {assignedMembers.map((member) => (
                      <Avatar key={member.id} sx={{ bgcolor: member.avatarColor, color: "#fff" }}>
                        {member.firstName.charAt(0)}
                      </Avatar>
                    ))}
                  </AvatarGroup>
                ) : (
                  <span>—</span>
                )}
              </DetailCard>
              <DetailCard>
                <DetailLabel>Location</DetailLabel>
                <span>{event.location || "—"}</span>
              </DetailCard>
              <DetailCard sx={{ gridColumn: { md: "1 / -1" } }}>
                <DetailLabel>Notes</DetailLabel>
                <span>{event.notes || "—"}</span>
              </DetailCard>
            </DetailGrid>
          </GlassPanel>
        </DialogContentPanel>
      </Box>
    </GlassDialog>
  );
}
