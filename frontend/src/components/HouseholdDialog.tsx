import { FormEvent } from "react";
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
} from "./GlassFormDialog";

interface HouseholdDialogProps {
  open: boolean;
  creating: boolean;
  householdName: string;
  householdNameError: boolean;
  onHouseholdNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function HouseholdDialog({
  open,
  creating,
  householdName,
  householdNameError,
  onHouseholdNameChange,
  onClose,
  onSubmit,
}: HouseholdDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "household-dialog-title";
  const descriptionId = "household-dialog-description";

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            Create workspace
          </Typography>
          <Button
            type="button"
            onClick={onClose}
            aria-label="Close household dialog"
            sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}
          >
            ✕
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Create a new workspace and set it as your selected workspace.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Workspace details</FieldTitle>
            <FormField
              required
              autoFocus
              label="Workspace name"
              slotProps={{ inputLabel: { shrink: true } }}
              value={householdName}
              error={householdNameError}
              helperText={householdNameError ? "Workspace name is required." : " "}
              onChange={(event) => onHouseholdNameChange(event.target.value)}
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
          <GradientButton type="submit" variant="contained" disableElevation disabled={creating}>
            {creating ? "Creating..." : "Create workspace"}
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
