import { FormEvent, type ElementType } from "react";
import CloseIcon from "@mui/icons-material/Close";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { Box, Button, MenuItem, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DayConfigurationCategory } from "../../../types/family";
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

export interface DayConfigurationDialogFormState {
  category: DayConfigurationCategory;
  startDate: string;
  endDate: string;
  label: string;
}

interface DayConfigurationDialogProps {
  open: boolean;
  editing: boolean;
  formState: DayConfigurationDialogFormState;
  categoryOptions: Array<{ value: DayConfigurationCategory; label: string; defaultMarker: string; defaultIcon: ElementType<SvgIconProps> }>;
  startDateError: boolean;
  endDateError: boolean;
  rangeError: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormStateChange: (updater: (current: DayConfigurationDialogFormState) => DayConfigurationDialogFormState) => void;
}

export function DayConfigurationDialog({
  open,
  editing,
  formState,
  categoryOptions,
  startDateError,
  endDateError,
  rangeError,
  onClose,
  onSubmit,
  onFormStateChange,
}: DayConfigurationDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "day-configuration-dialog-title";
  const descriptionId = "day-configuration-dialog-description";
  const selectedCategory = categoryOptions.find((option) => option.value === formState.category);

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {editing ? "Edit special day" : "Add special day"}
          </Typography>
          <Button type="button" onClick={onClose} aria-label="Close day configuration dialog" sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}>
            <CloseIcon fontSize="small" />
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Configure special days like school holidays, bank holidays, and bridge days.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Special day details</FieldTitle>
            <FormField
              required
              select
              label="Category"
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.category}
              onChange={(event) =>
                onFormStateChange((current) => ({ ...current, category: event.target.value as DayConfigurationCategory }))
              }
            >
              {categoryOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </FormField>
            <FormField
              required
              type="date"
              label="Start date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.startDate}
              error={startDateError || rangeError}
              helperText={startDateError ? "Start date is required." : rangeError ? "Start date must not be after end date." : " "}
              onChange={(event) => onFormStateChange((current) => ({ ...current, startDate: event.target.value }))}
            />
            <FormField
              required
              type="date"
              label="End date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={formState.endDate}
              error={endDateError || rangeError}
              helperText={endDateError ? "End date is required." : rangeError ? "End date must be on or after start date." : " "}
              onChange={(event) => onFormStateChange((current) => ({ ...current, endDate: event.target.value }))}
            />
            <FormField
              label="Marker (optional)"
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 4 } }}
              value={formState.label}
              helperText={
                selectedCategory ? (
                  (() => {
                    const SelectedCategoryIcon = selectedCategory.defaultIcon;
                    return (
                      <span className="day-configuration-marker">
                        Default marker:
                        <SelectedCategoryIcon className="day-configuration-marker-icon" fontSize="inherit" />
                        {selectedCategory.defaultMarker}
                      </span>
                    );
                  })()
                ) : (
                  "Default marker: —"
                )
              }
              onChange={(event) => onFormStateChange((current) => ({ ...current, label: event.target.value }))}
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
            {editing ? "Save changes" : "Save day"}
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
