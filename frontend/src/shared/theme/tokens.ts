type ThemeTokenValues = {
  bg: string;
  bgGradient: string;
  textPrimary: string;
  textSecondary: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  row: string;
  accent: string;
  accentStrong: string;
  todayBg: string;
  weekendBg: string;
  shadow: string;
  dialogSurface: string;
  dialogPanel: string;
  dialogField: string;
  dialogBorder: string;
  dialogMuted: string;
  dialogSoftText: string;
  dialogBackdrop: string;
  actionGradientStart: string;
  actionGradientEnd: string;
  menuSurface: string;
  menuBackdropBlur: string;
  datePickerIndicatorFilter: string;
};

const toCssVariables = (tokens: ThemeTokenValues): Record<string, string> => ({
  "--bg": tokens.bg,
  "--bg-gradient": tokens.bgGradient,
  "--text-primary": tokens.textPrimary,
  "--text-secondary": tokens.textSecondary,
  "--surface": tokens.surface,
  "--surface-strong": tokens.surfaceStrong,
  "--border": tokens.border,
  "--row": tokens.row,
  "--accent": tokens.accent,
  "--accent-strong": tokens.accentStrong,
  "--today-bg": tokens.todayBg,
  "--weekend-bg": tokens.weekendBg,
  "--shadow": tokens.shadow,
  "--dialog-surface": tokens.dialogSurface,
  "--dialog-panel": tokens.dialogPanel,
  "--dialog-field": tokens.dialogField,
  "--dialog-border": tokens.dialogBorder,
  "--dialog-muted": tokens.dialogMuted,
  "--dialog-soft-text": tokens.dialogSoftText,
  "--dialog-backdrop": tokens.dialogBackdrop,
  "--action-gradient-start": tokens.actionGradientStart,
  "--action-gradient-end": tokens.actionGradientEnd,
  "--menu-surface": tokens.menuSurface,
  "--menu-backdrop-blur": tokens.menuBackdropBlur,
  "--date-picker-indicator-filter": tokens.datePickerIndicatorFilter,
});

export const themeTokens = {
  light: {
    bg: "#f2f4fb",
    bgGradient: "radial-gradient(circle at 15% 15%, #ffffff 0%, #f2f4fb 50%, #e9edf8 100%)",
    textPrimary: "#1c1f2d",
    textSecondary: "#666d83",
    surface: "rgba(255, 255, 255, 0.74)",
    surfaceStrong: "rgba(255, 255, 255, 0.84)",
    border: "rgba(112, 122, 157, 0.22)",
    row: "rgba(255, 255, 255, 0.35)",
    accent: "#7f8bff",
    accentStrong: "#6f7cff",
    todayBg: "rgba(127, 139, 255, 0.16)",
    weekendBg: "rgba(110, 120, 154, 0.08)",
    shadow: "0 20px 36px rgba(20, 26, 49, 0.14)",
    dialogSurface: "rgba(252, 253, 255, 0.9)",
    dialogPanel: "rgba(247, 250, 255, 0.7)",
    dialogField: "rgba(255, 255, 255, 0.82)",
    dialogBorder: "rgba(112, 122, 157, 0.28)",
    dialogMuted: "rgba(74, 82, 106, 0.88)",
    dialogSoftText: "rgba(46, 52, 71, 0.8)",
    dialogBackdrop: "rgba(12, 18, 32, 0.45)",
    actionGradientStart: "#7f8bff",
    actionGradientEnd: "#9a7dff",
    menuSurface: "rgba(255, 255, 255, 0.5)",
    menuBackdropBlur: "52px",
    datePickerIndicatorFilter: "none",
  } satisfies ThemeTokenValues,
  dark: {
    bg: "#090b14",
    bgGradient: "radial-gradient(circle at 20% 10%, #2b2a3f 0%, #11131c 40%, #090b14 100%)",
    textPrimary: "#f3f5ff",
    textSecondary: "#a4a9c2",
    surface: "rgba(32, 35, 48, 0.62)",
    surfaceStrong: "rgba(39, 42, 57, 0.72)",
    border: "rgba(142, 151, 184, 0.24)",
    row: "rgba(24, 27, 39, 0.52)",
    accent: "#7f8bff",
    accentStrong: "#8a97ff",
    todayBg: "rgba(110, 128, 255, 0.22)",
    weekendBg: "rgba(62, 74, 92, 0.22)",
    shadow: "0 20px 45px rgba(0, 0, 0, 0.45)",
    dialogSurface: "rgba(24, 26, 36, 0.9)",
    dialogPanel: "rgba(21, 24, 36, 0.68)",
    dialogField: "rgba(27, 31, 45, 0.78)",
    dialogBorder: "rgba(184, 194, 255, 0.24)",
    dialogMuted: "rgba(216, 223, 255, 0.86)",
    dialogSoftText: "rgba(211, 218, 255, 0.74)",
    dialogBackdrop: "rgba(7, 10, 18, 0.58)",
    actionGradientStart: "#7f8bff",
    actionGradientEnd: "#9a7dff",
    menuSurface: "rgba(20, 24, 35, 0.52)",
    menuBackdropBlur: "52px",
    datePickerIndicatorFilter: "brightness(0) invert(0.88)",
  } satisfies ThemeTokenValues,
} as const;

export const themeTokenGlobalStyles = {
  ":root": toCssVariables(themeTokens.light),
  ':root[data-theme="dark"]': toCssVariables(themeTokens.dark),
} as const;
