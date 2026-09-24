import { FormEvent } from "react";
import { Box, Button, Typography, useMediaQuery } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { styled, useTheme } from "@mui/material/styles";
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

const HouseholdDetailsSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
}));

interface HouseholdDialogProps {
  open: boolean;
  householdName: string;
  householdNameError: boolean;
  requestError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onHouseholdNameChange: (value: string) => void;
}

export function HouseholdDialog({
  open,
  householdName,
  householdNameError,
  requestError,
  isSubmitting,
  onClose,
  onSubmit,
  onHouseholdNameChange,
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
            Create household
          </Typography>
          <Button
            type="button"
            onClick={onClose}
            aria-label="Close household dialog"
            sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}
          >
            <CloseIcon fontSize="small" />
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Create a household workspace to manage members and contact lists in that context.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Household details</FieldTitle>
            <HouseholdDetailsSection>
              <FormField
                required
                label="Household name"
                autoFocus
                slotProps={{ inputLabel: { shrink: true } }}
                value={householdName}
                error={householdNameError || Boolean(requestError)}
                helperText={householdNameError ? "Household name is required." : requestError ?? " "}
                onChange={(event) => onHouseholdNameChange(event.target.value)}
              />
            </HouseholdDetailsSection>
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
          <GradientButton type="submit" variant="contained" disableElevation disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create household"}
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
