import { FormEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions as MuiDialogActions,
  DialogContent,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, styled, useTheme } from "@mui/material/styles";
import { MemberAvatarColor } from "../types/family";

const GlassDialog = styled(Dialog)(({ theme }) => ({
  "& .MuiDialog-paper": {
    width: "min(900px, calc(100vw - 2rem))",
    margin: theme.spacing(1),
    borderRadius: 20,
    background: "rgba(24, 26, 36, 0.9)",
    border: `1px solid ${alpha("#b8c2ff", 0.2)}`,
    boxShadow: "0 20px 45px rgba(0, 0, 0, 0.45)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    color: "var(--text-primary)",
  },
}));

const DialogHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  padding: theme.spacing(2.5, 3),
  borderBottom: `1px solid ${alpha("#b8c2ff", 0.16)}`,
}));

const DialogContentPanel = styled(DialogContent)(({ theme }) => ({
  padding: theme.spacing(2.5, 3),
  display: "grid",
  gap: theme.spacing(2.5),
}));

const GlassPanel = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(1.25),
  padding: theme.spacing(2),
  borderRadius: 14,
  border: `1px solid ${alpha("#b8c2ff", 0.16)}`,
  background: alpha("#151824", 0.5),
}));

const MemberDetailsSection = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const FieldTitle = styled(Typography)({
  color: alpha("#f3f5ff", 0.95),
  fontWeight: 700,
});

const FormField = styled(TextField)(({ theme }) => ({
  "& .MuiInputBase-root": {
    minHeight: 52,
    borderRadius: 12,
    background: alpha("#1c2030", 0.74),
    transition: "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ccd4ff", 0.24),
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ccd4ff", 0.4),
  },
  "& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#8e9dff", 0.95),
    boxShadow: "0 0 0 2px rgba(127, 139, 255, 0.18)",
  },
  "& .MuiInputLabel-root": {
    color: alpha("#d7dcff", 0.88),
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: alpha("#b5beff", 0.98),
  },
  "& .MuiInputBase-input": {
    color: "var(--text-primary)",
  },
  "& .MuiFormHelperText-root": {
    marginLeft: 2,
    color: alpha("#d7dcff", 0.75),
  },
  "& .MuiFormHelperText-root.Mui-error": {
    color: theme.palette.error.light,
  },
}));

const RelationshipField = styled(FormField)({});

const ColorSelect = styled(Select)({
  borderRadius: 12,
  background: alpha("#1c2030", 0.74),
  color: "var(--text-primary)",
  minHeight: 52,
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ccd4ff", 0.24),
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#ccd4ff", 0.4),
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha("#8e9dff", 0.95),
    boxShadow: "0 0 0 2px rgba(127, 139, 255, 0.18)",
  },
  "& .MuiSelect-icon": {
    color: alpha("#eff2ff", 0.9),
  },
});

const CalendarVisibilityToggle = styled(FormControlLabel)({
  marginLeft: 0,
  "& .MuiFormControlLabel-label": {
    color: alpha("#f3f5ff", 0.94),
    fontWeight: 600,
  },
});

const AvatarUploadField = styled(Box)(({ theme }) => ({
  borderRadius: 12,
  border: `1px dashed ${alpha("#b8c2ff", 0.32)}`,
  background: alpha("#1a1d2b", 0.68),
  padding: theme.spacing(2),
  display: "grid",
  gap: theme.spacing(0.75),
}));

const DialogActions = styled(MuiDialogActions)(({ theme }) => ({
  padding: theme.spacing(2.25, 3),
  borderTop: `1px solid ${alpha("#b8c2ff", 0.16)}`,
}));

const GradientButton = styled(Button)(({ theme }) => ({
  borderRadius: 999,
  minHeight: 44,
  padding: theme.spacing(0.8, 2.5),
  background: "linear-gradient(90deg, #7f8bff 0%, #9a7dff 100%)",
  color: "#f9faff",
  fontWeight: 700,
  textTransform: "none",
  boxShadow: "0 12px 22px rgba(108, 121, 255, 0.32)",
  transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
  "@media (prefers-reduced-motion: reduce)": {
    transition: "none",
  },
  "&:hover": {
    boxShadow: "0 14px 26px rgba(108, 121, 255, 0.4)",
    filter: "brightness(1.03)",
  },
  "&:active": {
    transform: "translateY(1px)",
  },
  "&:focus-visible": {
    outline: `2px solid ${alpha("#dde2ff", 0.9)}`,
    outlineOffset: 2,
  },
  "&.Mui-disabled": {
    color: alpha("#f9faff", 0.72),
    background: "linear-gradient(90deg, rgba(127, 139, 255, 0.5), rgba(154, 125, 255, 0.45))",
  },
}));

export interface MemberDialogFormState {
  firstName: string;
  role: string;
  avatarColor: MemberAvatarColor;
  visibleInCalendar: boolean;
}

interface MemberDialogProps {
  open: boolean;
  editing: boolean;
  colors: MemberAvatarColor[];
  formState: MemberDialogFormState;
  firstNameError: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFirstNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onAvatarColorChange: (value: MemberAvatarColor) => void;
  onVisibleInCalendarChange: (value: boolean) => void;
}

export function MemberDialog({
  open,
  editing,
  colors,
  formState,
  firstNameError,
  onClose,
  onSubmit,
  onFirstNameChange,
  onRoleChange,
  onAvatarColorChange,
  onVisibleInCalendarChange,
}: MemberDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const titleId = "member-dialog-title";
  const descriptionId = "member-dialog-description";

  return (
    <GlassDialog open={open} onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId} fullScreen={fullScreen}>
      <Box component="form" onSubmit={onSubmit} noValidate>
        <DialogHeader>
          <Typography id={titleId} variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            {editing ? "Edit member" : "Add member"}
          </Typography>
          <Button
            type="button"
            onClick={onClose}
            aria-label="Close member dialog"
            sx={{ minWidth: "auto", color: "var(--text-primary)", borderRadius: "999px" }}
          >
            ✕
          </Button>
        </DialogHeader>

        <DialogContentPanel>
          <Typography id={descriptionId} variant="body2" sx={{ color: alpha("#d7dcff", 0.82), marginTop: -0.5 }}>
            Add household member details, calendar visibility, and avatar preferences.
          </Typography>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Member details</FieldTitle>
            <MemberDetailsSection>
              <FormField
                required
                label="First name"
                autoFocus
                value={formState.firstName}
                error={firstNameError}
                helperText={firstNameError ? "First name is required." : " "}
                onChange={(event) => onFirstNameChange(event.target.value)}
              />
              <RelationshipField
                label="Role / relationship"
                value={formState.role}
                helperText="Optional"
                onChange={(event) => onRoleChange(event.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel id="member-avatar-color-label" sx={{ color: alpha("#d7dcff", 0.88) }}>
                  Color
                </InputLabel>
                <ColorSelect
                  labelId="member-avatar-color-label"
                  label="Color"
                  value={formState.avatarColor}
                  onChange={(event) => onAvatarColorChange(event.target.value as MemberAvatarColor)}
                >
                  {colors.map((color) => (
                    <MenuItem key={color} value={color}>
                      {color.charAt(0).toUpperCase() + color.slice(1)}
                    </MenuItem>
                  ))}
                </ColorSelect>
              </FormControl>
              <Box sx={{ display: "grid", alignContent: "center" }}>
                <CalendarVisibilityToggle
                  control={
                    <Switch
                      checked={formState.visibleInCalendar}
                      onChange={(event) => onVisibleInCalendarChange(event.target.checked)}
                      slotProps={{ input: { "aria-label": "Visible in calendar" } }}
                    />
                  }
                  label={formState.visibleInCalendar ? "Visible in calendar" : "Hidden from calendar"}
                />
              </Box>
            </MemberDetailsSection>
          </GlassPanel>

          <GlassPanel>
            <FieldTitle variant="subtitle1">Avatar / photo</FieldTitle>
            <AvatarUploadField>
              <Typography variant="body2" sx={{ color: alpha("#f1f4ff", 0.92), fontWeight: 600 }}>
                Photo upload coming soon
              </Typography>
              <Typography variant="body2" sx={{ color: alpha("#d3d9ff", 0.72) }}>
                Avatar images will be available in an upcoming update.
              </Typography>
            </AvatarUploadField>
          </GlassPanel>
        </DialogContentPanel>

        <DialogActions>
          <Button
            type="button"
            onClick={onClose}
            variant="outlined"
            sx={{
              borderRadius: "999px",
              color: alpha("#d6ddff", 0.9),
              borderColor: alpha("#b8c2ff", 0.3),
              textTransform: "none",
              minHeight: 42,
              "&:hover": {
                borderColor: alpha("#b8c2ff", 0.55),
                background: alpha("#7f8bff", 0.1),
              },
            }}
          >
            Cancel
          </Button>
          <GradientButton type="submit" variant="contained" disableElevation>
            Save member
          </GradientButton>
        </DialogActions>
      </Box>
    </GlassDialog>
  );
}
