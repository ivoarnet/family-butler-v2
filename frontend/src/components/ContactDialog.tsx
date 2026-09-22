import { FormEvent } from "react";
import { Box, Button, Typography, useMediaQuery } from "@mui/material";
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
} from "./GlassFormDialog";

const ContactDetailsSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const BirthdayDetailsSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const FullWidthField = styled(FormField)({
  gridColumn: "1 / -1",
});

export interface ContactDialogFormState {
  firstName: string;
  lastName: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  email: string;
  mobilePhone: string;
}

interface ContactDialogProps {
  open: boolean;
  editing: boolean;
  formState: ContactDialogFormState;
  firstNameError: boolean;
  birthdayMissingError: boolean;
  birthdayRangeError: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormStateChange: (updater: (current: ContactDialogFormState) => ContactDialogFormState) => void;
}

export function ContactDialog({
  open,
  editing,
  formState,
  firstNameError,
  birthdayMissingError,
  birthdayRangeError,
  onClose,
  onSubmit,
  onFormStateChange,
}: ContactDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "contact-dialog-title";
  const descriptionId = "contact-dialog-description";

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {editing ? "Edit contact" : "Add contact"}
          </Typography>
          <Button
            type="button"
            onClick={onClose}
            aria-label="Close contact dialog"
            sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}
          >
            ✕
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <DialogDescription id={descriptionId} variant="body2">
            Save birthdays and contact details in the same glass form style as other settings dialogs.
          </DialogDescription>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Contact details</FieldTitle>
            <ContactDetailsSection>
              <FormField
                required
                label="First name"
                autoFocus
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.firstName}
                error={firstNameError}
                helperText={firstNameError ? "First name is required." : " "}
                onChange={(event) => onFormStateChange((current) => ({ ...current, firstName: event.target.value }))}
              />
              <FormField
                label="Last name"
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.lastName}
                helperText="Optional"
                onChange={(event) => onFormStateChange((current) => ({ ...current, lastName: event.target.value }))}
              />
              <FullWidthField
                type="email"
                label="Email"
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.email}
                helperText="Optional"
                onChange={(event) => onFormStateChange((current) => ({ ...current, email: event.target.value }))}
              />
              <FullWidthField
                type="tel"
                label="Mobile phone"
                slotProps={{ inputLabel: { shrink: true } }}
                value={formState.mobilePhone}
                helperText="Optional"
                onChange={(event) => onFormStateChange((current) => ({ ...current, mobilePhone: event.target.value }))}
              />
            </ContactDetailsSection>
          </GlassPanel>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Birthday</FieldTitle>
            <BirthdayDetailsSection>
              <FormField
                type="number"
                label="Day"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 31 } }}
                value={formState.birthDay}
                error={birthdayMissingError || birthdayRangeError}
                helperText={birthdayMissingError ? "Enter day and month together." : birthdayRangeError ? "Use a valid day (1-31)." : " "}
                onChange={(event) => onFormStateChange((current) => ({ ...current, birthDay: event.target.value }))}
              />
              <FormField
                type="number"
                label="Month"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 12 } }}
                value={formState.birthMonth}
                error={birthdayMissingError || birthdayRangeError}
                helperText={birthdayMissingError ? "Enter day and month together." : birthdayRangeError ? "Use a valid month (1-12)." : " "}
                onChange={(event) => onFormStateChange((current) => ({ ...current, birthMonth: event.target.value }))}
              />
              <FormField
                type="number"
                label="Year (optional)"
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1 } }}
                value={formState.birthYear}
                helperText="Optional"
                onChange={(event) => onFormStateChange((current) => ({ ...current, birthYear: event.target.value }))}
              />
            </BirthdayDetailsSection>
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
            Save contact
          </GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  );
}
