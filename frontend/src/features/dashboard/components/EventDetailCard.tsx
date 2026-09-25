import CloseIcon from "@mui/icons-material/Close";
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
  gap: "1.35rem",
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
  background: alpha("#61d7bd", 0.16),
  color: "var(--text-primary)",
});

const TimeSplitCard = styled(Box)({
  borderRadius: 14,
  background: alpha("#ffffff", 0.05),
  padding: "0.95rem 1rem",
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

const Label = styled("small")({
  color: "var(--text-secondary)",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
});

const CornerDecoration = styled(Box)<{ $color: string }>(({ $color }) => ({
  position: "absolute",
  right: 0,
  bottom: 0,
  width: "7rem",
  height: "7rem",
  clipPath: "polygon(100% 0, 0 100%, 100% 100%)",
  background: alpha($color, 0.45),
  display: "inline-flex",
  alignItems: "flex-end",
  justifyContent: "flex-end",
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
  const beginLabel = event.allDay ? "All day" : event.startTime ?? "—";
  const endLabel = event.allDay ? "—" : event.endTime ?? "—";

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

        <DetailGrid>
          <DetailBlock>
            <DetailIconBadge>
              <CalendarTodayOutlinedIcon fontSize="small" />
            </DetailIconBadge>
            <Box>
              <Label>Date</Label>
              <Typography variant="h6" sx={{ marginTop: "0.15rem" }}>{formatEventDate(event.date)}</Typography>
            </Box>
          </DetailBlock>
          <DetailBlock>
            <DetailIconBadge>
              <PlaceOutlinedIcon fontSize="small" />
            </DetailIconBadge>
            <Box>
              <Label>Location</Label>
              <Typography variant="h6" sx={{ marginTop: "0.15rem" }}>{event.location || "—"}</Typography>
            </Box>
          </DetailBlock>
        </DetailGrid>

        <TimeSplitCard>
          <Box>
            <Label>Begins</Label>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{beginLabel}</Typography>
          </Box>
          <TimeDivider />
          <Box>
            <Label>Ends</Label>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{endLabel}</Typography>
          </Box>
        </TimeSplitCard>

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
            {event.notes || "—"}
          </Typography>
        </Box>

        <Box>
          <Label>Type</Label>
          <Typography variant="body1" sx={{ marginTop: "0.2rem" }}>
            {eventType ? `${eventType.icon ? `${eventType.icon} ` : ""}${eventType.name}` : "No type"}
          </Typography>
          <Label style={{ marginTop: "0.7rem", display: "inline-block" }}>Repeat</Label>
          <Typography variant="body1" sx={{ marginTop: "0.2rem" }}>{event.repeatRule || "Does not repeat"}</Typography>
        </Box>
      </CardInner>

      {eventType ? (
        <CornerDecoration $color={eventTypeColor} aria-hidden>
          <Typography
            variant="h6"
            sx={{
              color: "#f8fbff",
              fontWeight: 700,
              marginRight: "0.6rem",
              marginBottom: "0.4rem",
              transform: "rotate(-45deg)",
            }}
          >
            {eventType.icon || "•"}
          </Typography>
        </CornerDecoration>
      ) : null}
    </CardRoot>
  );
}
