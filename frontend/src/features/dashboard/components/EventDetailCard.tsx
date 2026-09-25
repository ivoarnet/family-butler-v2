import CloseIcon from "@mui/icons-material/Close";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import EditIcon from "@mui/icons-material/Edit";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { Avatar, AvatarGroup, Box, IconButton, Stack, Typography } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import { EventType, FamilyMember, HouseholdEvent } from "../../../types/family";

const EVENT_TYPE_COLOR_FALLBACK = "#7f8bff";

const CardRoot = styled(Box)({
  position: "relative",
  border: "1px solid var(--dialog-border)",
  borderRadius: 20,
  background: "var(--dialog-surface)",
  color: "var(--text-primary)",
  overflow: "hidden",
});

const CardInner = styled(Box)({
  display: "grid",
  gap: "1.2rem",
  padding: "1.65rem",
});

const CardHeader = styled(Box)({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
});

const ActionButton = styled(IconButton)({
  border: "1px solid rgba(255, 255, 255, 0.12)",
  color: "var(--text-primary)",
  background: alpha("#ffffff", 0.03),
  borderRadius: 12,
});

const DetailList = styled(Box)({
  display: "grid",
  gap: "0.95rem",
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
  background: alpha("#61d7bd", 0.16),
  color: "var(--text-primary)",
});

const Label = styled("small")({
  color: "var(--text-secondary)",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
});

const TimeInline = styled(Stack)({
  color: "var(--text-secondary)",
  marginTop: "0.35rem",
  fontSize: "0.95rem",
});

const CornerBand = styled(Box)<{ $color: string }>(({ $color }) => ({
  position: "absolute",
  right: "-2rem",
  bottom: "0.8rem",
  width: "8.6rem",
  height: "1.85rem",
  transform: "rotate(-45deg)",
  background: alpha($color, 0.36),
  borderTop: `1px solid ${alpha($color, 0.5)}`,
  borderBottom: `1px solid ${alpha($color, 0.5)}`,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
}));

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
  event: HouseholdEvent;
  eventType: EventType | null;
  members: FamilyMember[];
  onClose: () => void;
  onEdit: () => void;
}

export function EventDetailCard({ event, eventType, members, onClose, onEdit }: EventDetailCardProps) {
  const assignedMembers = members.filter((member) => event.memberIds.includes(member.id));
  const eventTypeColor = eventType?.color ?? EVENT_TYPE_COLOR_FALLBACK;
  const timeLabel = event.allDay ? "All day" : `${event.startTime ?? "—"} – ${event.endTime ?? "—"}`;

  return (
    <CardRoot>
      <CardInner>
        <CardHeader>
          <Box>
            <Label>Event details</Label>
            <Typography id="event-detail-title" variant="h4" component="h2" sx={{ fontWeight: 700, marginTop: "0.55rem" }}>
              {event.title}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.7}>
            <ActionButton onClick={onEdit} aria-label="Edit event">
              <EditIcon fontSize="small" />
            </ActionButton>
            <ActionButton onClick={onClose} aria-label="Close event details dialog">
              <CloseIcon fontSize="small" />
            </ActionButton>
          </Stack>
        </CardHeader>

        <DetailList>
          <DetailBlock>
            <DetailIconBadge aria-label="Date" title="Date">
              <CalendarTodayOutlinedIcon fontSize="small" titleAccess="Date" />
            </DetailIconBadge>
            <Box>
              <Typography variant="h6" sx={{ marginTop: "0.15rem" }}>{formatEventDate(event.date)}</Typography>
              <TimeInline direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
                <AccessTimeOutlinedIcon sx={{ fontSize: "1rem" }} />
                <span>{timeLabel}</span>
              </TimeInline>
            </Box>
          </DetailBlock>

          <DetailBlock>
            <DetailIconBadge aria-label="Location" title="Location">
              <PlaceOutlinedIcon fontSize="small" titleAccess="Location" />
            </DetailIconBadge>
            <Box>
              <Typography variant="h6" sx={{ marginTop: "0.15rem" }}>{event.location?.trim() || "—"}</Typography>
            </Box>
          </DetailBlock>
        </DetailList>

        <Stack direction="row" spacing={1.1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <AvatarGroup max={6} sx={{ justifyContent: "flex-start", "& .MuiAvatar-root": { width: 36, height: 36, fontSize: "0.86rem" } }}>
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

        <Box>
          <Label>Notes</Label>
          <Typography variant="h5" sx={{ marginTop: "0.35rem", fontWeight: 500, maxWidth: "66ch", color: "var(--text-secondary)" }}>
            {event.notes?.trim() || "—"}
          </Typography>
        </Box>
      </CardInner>

      {eventType ? (
        <CornerBand $color={eventTypeColor} aria-hidden>
          <Typography variant="body2" sx={{ color: "#f8fbff", fontWeight: 700 }}>
            {eventType.icon || "•"}
          </Typography>
        </CornerBand>
      ) : null}
    </CardRoot>
  );
}
