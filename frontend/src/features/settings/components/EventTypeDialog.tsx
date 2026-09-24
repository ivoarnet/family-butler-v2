import { FormEvent } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Button, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  DialogActionsBar,
  DialogContentPanel,
  DialogDescription,
  DialogHeader,
  FieldTitle,
  FormField,
  GlassDialog,
  GlassPanel,
  GradientButton,
} from "../../../shared/ui/GlassFormDialog";

export interface EventTypeDialogFormState {
  name: string;
  icon: string;
}

interface EventTypeDialogProps {
  open: boolean;
  editing: boolean;
  formState: EventTypeDialogFormState;
  nameError: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormStateChange: (updater: (current: EventTypeDialogFormState) => EventTypeDialogFormState) => void;
}

export function EventTypeDialog({ open, editing, formState, nameError, onClose, onSubmit, onFormStateChange }: EventTypeDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "event-type-dialog-title";
  const descriptionId = "event-type-dialog-description";

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {editing ? "Edit event type" : "Add event type"}
          </Typography>
          <Button type="button" onClick={onClose} aria-label="Close event type dialog" sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}>
            <CloseIcon fontSize="small" />
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Configure reusable event types for household events.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Type details</FieldTitle>
            <FormField
              required
              label="Name"
              autoFocus
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.name}
              error={nameError}
              helperText={nameError ? "Name is required." : " "}
              onChange={(event) => onFormStateChange((current) => ({ ...current, name: event.target.value }))}
            />
            <FormField
              label="Icon (optional)"
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.icon}
              helperText="Example: 🎓, 🩺, 🎉"
              onChange={(event) => onFormStateChange((current) => ({ ...current, icon: event.target.value }))}
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
                background: "rgba(127, 139, 255, 0.12)",
              },
            }}
          >
            Cancel
          </Button>
          <GradientButton type="submit" variant="contained" disableElevation>
            Save type
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
