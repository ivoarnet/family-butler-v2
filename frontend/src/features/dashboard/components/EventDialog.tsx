import { FormEvent } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, FormControl, FormControlLabel, MenuItem, Switch, Typography, useMediaQuery } from "@mui/material";
import { alpha, styled, useTheme } from "@mui/material/styles";
import {
  DialogActionsBar,
  DialogContentPanel,
  DialogDescription,
  DialogHeader,
  FieldTitle,
  FormField,
  FormSelect,
  GlassDialog,
  GlassPanel,
  GradientButton,
} from "../../../shared/ui/GlassFormDialog";
import { EventType, FamilyMember } from "../../../types/family";

const EventDetailsSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  [theme.breakpoints.down("md")]: {
    gridTemplateColumns: "1fr",
  },
}));

const TimeSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const FullWidthField = styled(FormField)({
  gridColumn: "1 / -1",
});

const MemberPicker = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
}));

const MemberButton = styled("button")<{ $selected: boolean }>(({ $selected }) => ({
  borderRadius: 999,
  border: $selected ? "1px solid var(--accent-strong)" : "1px solid var(--dialog-border)",
  background: $selected ? "rgba(127, 139, 255, 0.18)" : "var(--dialog-field)",
  color: "var(--text-primary)",
  padding: "0.35rem 0.75rem 0.35rem 0.35rem",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.45rem",
  cursor: "pointer",
  font: "inherit",
}));

const MemberAvatar = styled("span")<{ $color: string }>(({ $color }) => ({
  width: 24,
  height: 24,
  borderRadius: 999,
  background: $color,
  color: "#fff",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.75rem",
}));

export interface EventDialogFormState {
  title: string;
  memberIds: string[];
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  eventTypeId: string;
  repeatRule: string;
  location: string;
  notes: string;
}

interface EventDialogProps {
  open: boolean;
  editing: boolean;
  members: FamilyMember[];
  eventTypes: EventType[];
  formState: EventDialogFormState;
  titleError: boolean;
  dateError: boolean;
  memberSelectionError: boolean;
  timeErrorMessage: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormStateChange: (updater: (current: EventDialogFormState) => EventDialogFormState) => void;
}

export function EventDialog({
  open,
  editing,
  members,
  eventTypes,
  formState,
  titleError,
  dateError,
  memberSelectionError,
  timeErrorMessage,
  onClose,
  onSubmit,
  onFormStateChange,
}: EventDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "event-dialog-title";
  const descriptionId = "event-dialog-description";

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {editing ? "Edit event" : "Add event"}
          </Typography>
          <Button type="button" onClick={onClose} aria-label="Close event dialog" sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}>
            <CloseIcon fontSize="small" />
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Create a household event and assign involved family members.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Event details</FieldTitle>
            <EventDetailsSection>
              <FullWidthField
                required
                label="Title"
                autoFocus
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.title}
                error={titleError}
                helperText={titleError ? "Title is required." : " "}
                onChange={(event) => onFormStateChange((current) => ({ ...current, title: event.target.value }))}
              />
              <FormField
                required
                type="date"
                label="Date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.date}
                error={dateError}
                helperText={dateError ? "Date is required." : " "}
                onChange={(event) => onFormStateChange((current) => ({ ...current, date: event.target.value }))}
              />
              <FormControl>
                <FormSelect
                  displayEmpty
                  value={formState.eventTypeId}
                  onChange={(event) => onFormStateChange((current) => ({ ...current, eventTypeId: String(event.target.value) }))}
                  inputProps={{ "aria-label": "Event type" }}
                >
                  <MenuItem value="">No type</MenuItem>
                  {eventTypes.map((eventType) => (
                    <MenuItem key={eventType.id} value={eventType.id}>
                      {eventType.icon ? `${eventType.icon} ` : ""}
                      {eventType.name}
                    </MenuItem>
                  ))}
                </FormSelect>
              </FormControl>
              <FormControl>
                <FormSelect
                  value={formState.repeatRule}
                  onChange={(event) => onFormStateChange((current) => ({ ...current, repeatRule: String(event.target.value) }))}
                  inputProps={{ "aria-label": "Repeat rule" }}
                >
                  <MenuItem value="">Does not repeat</MenuItem>
                  <MenuItem value="RRULE:FREQ=DAILY">Daily</MenuItem>
                  <MenuItem value="RRULE:FREQ=WEEKLY">Weekly</MenuItem>
                  <MenuItem value="RRULE:FREQ=MONTHLY">Monthly</MenuItem>
                  <MenuItem value="RRULE:FREQ=YEARLY">Yearly</MenuItem>
                </FormSelect>
              </FormControl>
            </EventDetailsSection>
          </GlassPanel>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Family members</FieldTitle>
            <MemberPicker>
              {members.map((member) => {
                const selected = formState.memberIds.includes(member.id);
                return (
                  <MemberButton
                    key={member.id}
                    type="button"
                    $selected={selected}
                    onClick={() =>
                      onFormStateChange((current) => ({
                        ...current,
                        memberIds: selected ? current.memberIds.filter((memberId) => memberId !== member.id) : [...current.memberIds, member.id],
                      }))
                    }
                  >
                    <MemberAvatar $color={member.avatarColor}>{member.firstName.charAt(0)}</MemberAvatar>
                    {member.firstName}
                  </MemberButton>
                );
              })}
            </MemberPicker>
            {memberSelectionError ? (
              <Typography variant="caption" sx={{ color: theme.palette.error.main }}>
                Select at least one family member.
              </Typography>
            ) : null}
          </GlassPanel>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Time and notes</FieldTitle>
            <FormControlLabel
              control={
                <Switch
                  checked={formState.allDay}
                  onChange={(event) =>
                    onFormStateChange((current) => ({
                      ...current,
                      allDay: event.target.checked,
                    }))
                  }
                />
              }
              label="All day"
              sx={{
                marginLeft: 0,
                "& .MuiFormControlLabel-label": {
                  color: "var(--text-primary)",
                  fontWeight: 600,
                },
              }}
            />
            {!formState.allDay ? (
              <TimeSection>
                <FormField
                  required
                  type="time"
                  label="Begin"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={formState.startTime}
                  error={Boolean(timeErrorMessage)}
                  helperText={timeErrorMessage ?? " "}
                  onChange={(event) => onFormStateChange((current) => ({ ...current, startTime: event.target.value }))}
                />
                <FormField
                  required
                  type="time"
                  label="End"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={formState.endTime}
                  error={Boolean(timeErrorMessage)}
                  helperText={timeErrorMessage ?? " "}
                  onChange={(event) => onFormStateChange((current) => ({ ...current, endTime: event.target.value }))}
                />
              </TimeSection>
            ) : null}
            <FormField
              label="Location"
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.location}
              onChange={(event) => onFormStateChange((current) => ({ ...current, location: event.target.value }))}
            />
            <FormField
              label="Notes"
              multiline
              minRows={3}
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.notes}
              onChange={(event) => onFormStateChange((current) => ({ ...current, notes: event.target.value }))}
            />
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
            Cancel
          </Button>
          <GradientButton type="submit" variant="contained" disableElevation>
            {editing ? "Save event" : "Add event"}
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
