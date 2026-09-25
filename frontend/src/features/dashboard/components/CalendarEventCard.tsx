import { Avatar, AvatarGroup } from "@mui/material";
import { styled } from "@mui/material/styles";
import { FamilyMember, HouseholdEvent } from "../../../types/family";

const EventCardButton = styled("button")({
  width: "100%",
  border: "1px solid rgba(127, 139, 255, 0.35)",
  background: "rgba(127, 139, 255, 0.16)",
  borderRadius: "0.7rem",
  padding: "0.35rem 0.6rem",
  color: "inherit",
  display: "grid",
  gap: "0.3rem",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
  "&:hover": {
    background: "rgba(127, 139, 255, 0.24)",
  },
});

const EventHeader = styled("div")({
  display: "flex",
  justifyContent: "space-between",
  gap: "0.35rem",
  alignItems: "flex-start",
  flexWrap: "wrap",
  minWidth: 0,
});

interface CalendarEventCardProps {
  event: HouseholdEvent;
  eventTypeLabel: string | null;
  timeLabel: string;
  members: FamilyMember[];
  onClick: () => void;
}

export function CalendarEventCard({ event, eventTypeLabel, timeLabel, members, onClick }: CalendarEventCardProps) {
  const assignedMembers = members.filter((member) => event.memberIds.includes(member.id));

  return (
    <EventCardButton type="button" onClick={onClick} aria-label={`Open event ${event.title}`}>
      <EventHeader>
        <strong className="event-item-title">
          {eventTypeLabel ? `${eventTypeLabel} ` : ""}
          {event.title}
        </strong>
        {assignedMembers.length > 0 && (
          <AvatarGroup
            max={4}
            sx={{ justifyContent: "flex-end", flexShrink: 0, "& .MuiAvatar-root": { width: 22, height: 22, fontSize: "0.72rem" } }}
          >
            {assignedMembers.map((member) => (
              <Avatar key={member.id} sx={{ bgcolor: member.avatarColor, color: "#fff" }}>
                {member.firstName.charAt(0)}
              </Avatar>
            ))}
          </AvatarGroup>
        )}
      </EventHeader>
      <small>{timeLabel}</small>
    </EventCardButton>
  );
}
