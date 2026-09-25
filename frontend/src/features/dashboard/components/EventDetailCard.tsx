import CloseIcon from "@mui/icons-material/Close";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import EditIcon from "@mui/icons-material/Edit";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { Avatar, AvatarGroup, Box, IconButton, Stack, Typography, useMediaQuery } from "@mui/material";
import { alpha, styled, useTheme } from "@mui/material/styles";
import {
  DialogContentPanel,
  DialogHeader,
  GlassDialog,
  GlassPanel,
} from "../../../shared/ui/GlassFormDialog";
import { EventType, FamilyMember, HouseholdEvent } from "../../../types/family";

const EVENT_TYPE_COLOR_FALLBACK = "#7f8bff";

const ContentCard = styled(Box)({
  position: "relative",
  border: "1px solid var(--dialog-border)",
  borderRadius: 16,
  background: "var(--dialog-field)",
  padding: "1.2rem",
  overflow: "hidden",
});

const DetailGrid = styled(Box)({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "1rem",
  "@media (max-width: 720px)": {
    gridTemplateColumns: "1fr",
  },
});

const DetailBlock = styled(Box)({
  display: "grid",
  gridTemplateColumns: "2.6rem 1fr",
  gap: "0.8rem",
  alignItems: "center",
});

const DetailIconBadge = styled(Box)({
  width: "2.6rem",
  height: "2.6rem",
  borderRadius: 12,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--dialog-border)",
  background: alpha("#7f8bff", 0.18),
  color: "var(--text-primary)",
});

const TimeSplitCard = styled(Box)({
  border: "1px solid var(--dialog-border)",
  borderRadius: 12,
  background: alpha("#ffffff", 0.02),
  padding: "0.9rem 1rem",
  display: "grid",
  gridTemplateColumns: "1fr 1px 1fr",
  gap: "0.9rem",
  alignItems: "center",
});

const TimeDivider = styled("span")({
  width: 1,
  height: "100%",
  background: "var(--dialog-border)",
});

const DetailCard = styled(Box)({
  color: "var(--text-primary)",
  display: "grid",
  gap: "0.2rem",
});

const CornerDecoration = styled(Box)<{ $color: string }>(({ $color }) => ({
  position: "absolute",
  right: 0,
  bottom: 0,
  width: "6.4rem",
  height: "6.4rem",
  clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
  background: alpha($color, 0.4),
  display: "inline-flex",
  alignItems: "flex-end",
  justifyContent: "flex-end",
}));

const DetailLabel = styled("small")({
  color: "var(--text-secondary)",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
});

const formatEventDate = (date: string): string => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
};

interface EventDetailCardProps {
  open: boolean;
  event: HouseholdEvent | null;
  eventType: EventType | null;
  members: FamilyMember[];
  timeLabel: string;
  onClose: () => void;
  onEdit: () => void;
}

export function EventDetailCard({ open, event, eventType, members, timeLabel, onClose, onEdit }: EventDetailCardProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "event-view-dialog-title";
  const descriptionId = "event-view-dialog-description";

  if (!event) {
    return null;
  }

  const assignedMembers = members.filter((member) => event.memberIds.includes(member.id));
  const eventTypeColor = eventType?.color ?? EVENT_TYPE_COLOR_FALLBACK;
  const [beginLabel, endLabel] = event.allDay ? ["All day", "—"] : [event.startTime ?? "—", event.endTime ?? "—"];

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box>
        <DialogHeader>
          <Box>
            <Typography variant="overline" sx={{ color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.12em" }}>
              Event details
            </Typography>
            <Typography id={titleId} variant="h4" component="h2" sx={{ fontWeight: 700 }}>
              {event.title}
            </Typography>
            <Typography id={descriptionId} variant="body2" sx={{ color: "var(--text-secondary)" }}>
              Read-only event summary
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <IconButton onClick={onEdit} aria-label="Edit event" sx={{ color: "var(--text-primary)", border: "1px solid var(--dialog-border)" }}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={onClose} aria-label="Close event details dialog" sx={{ color: "var(--text-primary)", border: "1px solid var(--dialog-border)" }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogHeader>

        <DialogContentPanel>
          <ContentCard>
            <GlassPanel>
              <DetailGrid>
                <DetailBlock>
                  <DetailIconBadge>
                    <CalendarTodayOutlinedIcon fontSize="small" />
                  </DetailIconBadge>
                  <DetailCard>
                    <DetailLabel>Date</DetailLabel>
                    <Typography variant="h6">{formatEventDate(event.date)}</Typography>
                  </DetailCard>
                </DetailBlock>
                <DetailBlock>
                  <DetailIconBadge>
                    <PlaceOutlinedIcon fontSize="small" />
                  </DetailIconBadge>
                  <DetailCard>
                    <DetailLabel>Location</DetailLabel>
                    <Typography variant="h6">{event.location || "—"}</Typography>
                  </DetailCard>
                </DetailBlock>
              </DetailGrid>

              <TimeSplitCard>
                <DetailCard>
                  <DetailLabel>Begins</DetailLabel>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {beginLabel}
                  </Typography>
                </DetailCard>
                <TimeDivider />
                <DetailCard>
                  <DetailLabel>Ends</DetailLabel>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {endLabel}
                  </Typography>
                </DetailCard>
              </TimeSplitCard>

              <DetailGrid>
                <DetailCard>
                  <DetailLabel>Family members</DetailLabel>
                  {assignedMembers.length ? (
                    <Stack direction="row" spacing={1.1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <AvatarGroup max={6} sx={{ justifyContent: "flex-start", "& .MuiAvatar-root": { width: 32, height: 32, fontSize: "0.86rem" } }}>
                        {assignedMembers.map((member) => (
                          <Avatar key={member.id} sx={{ bgcolor: member.avatarColor, color: "#fff" }}>
                            {member.firstName.charAt(0)}
                          </Avatar>
                        ))}
                      </AvatarGroup>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {assignedMembers.length} {assignedMembers.length === 1 ? "member" : "members"} attending
                      </Typography>
                    </Stack>
                  ) : (
                    <span>—</span>
                  )}
                </DetailCard>
                <DetailCard>
                  <DetailLabel>Type</DetailLabel>
                  <Typography variant="body1">{eventType ? `${eventType.icon ? `${eventType.icon} ` : ""}${eventType.name}` : "No type"}</Typography>
                  <DetailLabel>Repeat</DetailLabel>
                  <Typography variant="body1">{event.repeatRule ? event.repeatRule : "Does not repeat"}</Typography>
                </DetailCard>
              </DetailGrid>

              <DetailCard>
                <DetailLabel>Notes</DetailLabel>
                <Typography variant="h6" sx={{ fontWeight: 500, maxWidth: "66ch" }}>
                  {event.notes || "—"}
                </Typography>
              </DetailCard>
            </GlassPanel>

            {eventType ? (
              <CornerDecoration $color={eventTypeColor} aria-hidden>
                <Typography
                  variant="h6"
                  sx={{
                    color: "#f8fbff",
                    fontWeight: 700,
                    marginRight: "0.55rem",
                    marginBottom: "0.35rem",
                    transform: "rotate(-45deg)",
                  }}
                >
                  {eventType.icon || "•"}
                </Typography>
              </CornerDecoration>
            ) : null}
          </ContentCard>
        </DialogContentPanel>
      </Box>
    </GlassDialog>
  );
}
