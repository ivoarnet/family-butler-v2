import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, styled } from "@mui/material/styles";

export const GlassDialog = styled(Dialog)(({ theme }) => ({
  "& .MuiBackdrop-root": {
    background: "var(--dialog-backdrop)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
  "& .MuiDialog-paper": {
    width: "min(900px, calc(100vw - 2rem))",
    margin: theme.spacing(1),
    borderRadius: 20,
    background: "var(--dialog-surface)",
    border: "1px solid var(--dialog-border)",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    color: "var(--text-primary)",
  },
}));

export const DialogHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  padding: theme.spacing(2.5, 3),
  borderBottom: "1px solid var(--dialog-border)",
}));

export const DialogContentPanel = styled(DialogContent)(({ theme }) => ({
  padding: theme.spacing(2.5, 3),
  display: "grid",
  gap: theme.spacing(2.5),
}));

export const DialogDescription = styled(Typography)({
  color: "var(--dialog-muted)",
  marginTop: -4,
});

export const GlassPanel = styled(Box)(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(1.25),
  padding: 0,
  border: "none",
  background: "transparent",
}));

export const FieldTitle = styled(Typography)({
  color: "var(--text-primary)",
  fontWeight: 700,
});

export const FormField = styled(TextField)(({ theme }) => ({
  "& .MuiInputBase-root": {
    minHeight: 52,
    borderRadius: 12,
    background: "var(--dialog-field)",
    transition: "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--dialog-border)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent-strong)",
  },
  "& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent-strong)",
    boxShadow: "0 0 0 2px rgba(127, 139, 255, 0.2)",
  },
  "& .MuiInputLabel-root": {
    color: "var(--dialog-muted)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "var(--accent-strong)",
  },
  "& .MuiInputBase-input": {
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    "&[type='date']::-webkit-calendar-picker-indicator": {
      filter: "var(--date-picker-indicator-filter, none)",
      opacity: 0.92,
    },
    "&[type='date']::-webkit-datetime-edit, &[type='date']::-webkit-datetime-edit-text, &[type='date']::-webkit-datetime-edit-month-field, &[type='date']::-webkit-datetime-edit-day-field, &[type='date']::-webkit-datetime-edit-year-field": {
      color: "var(--text-primary)",
    },
    "&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus, &:-webkit-autofill:active": {
      WebkitBoxShadow: "0 0 0 100px var(--dialog-field) inset",
      WebkitTextFillColor: "var(--text-primary)",
      caretColor: "var(--text-primary)",
      borderRadius: "inherit",
    },
  },
  "& .MuiSvgIcon-root": {
    color: "var(--text-primary)",
  },
  "& .MuiFormHelperText-root": {
    marginLeft: 2,
    color: "var(--dialog-soft-text)",
  },
  "& .MuiFormHelperText-root.Mui-error": {
    color: theme.palette.error.main,
  },
}));

export const FormSelect = styled(Select)({
  borderRadius: 12,
  background: "var(--dialog-field)",
  color: "var(--text-primary)",
  minHeight: 52,
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--dialog-border)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent-strong)",
  },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--accent-strong)",
    boxShadow: "0 0 0 2px rgba(127, 139, 255, 0.2)",
  },
  "& .MuiSelect-icon": {
    color: "var(--dialog-muted)",
  },
});

export const CalendarVisibilityToggle = styled(FormControlLabel)({
  marginLeft: 0,
  "& .MuiFormControlLabel-label": {
    color: "var(--text-primary)",
    fontWeight: 600,
  },
});

export const DialogActionsBar = styled(DialogActions)(({ theme }) => ({
  padding: theme.spacing(2.25, 3),
  borderTop: "1px solid var(--dialog-border)",
}));

export const GradientButton = styled(Button)(({ theme }) => ({
  borderRadius: 999,
  minHeight: 44,
  padding: theme.spacing(0.8, 2.5),
  background: "linear-gradient(90deg, var(--action-gradient-start) 0%, var(--action-gradient-end) 100%)",
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
    outline: "2px solid rgba(221, 226, 255, 0.9)",
    outlineOffset: 2,
  },
  "&.Mui-disabled": {
    color: alpha("#f9faff", 0.72),
    background: "linear-gradient(90deg, rgba(127, 139, 255, 0.5), rgba(154, 125, 255, 0.45))",
  },
}));
