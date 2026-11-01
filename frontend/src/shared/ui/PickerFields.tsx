import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/de-ch";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { pickerDayClasses } from "@mui/x-date-pickers/PickerDay";
import { yearCalendarClasses } from "@mui/x-date-pickers/YearCalendar";
import { monthCalendarClasses } from "@mui/x-date-pickers/MonthCalendar";

dayjs.extend(customParseFormat);

const pickerFieldSx = {
  "& .MuiPickersOutlinedInput-root": {
    minHeight: 52,
    borderRadius: "12px",
    background: "var(--dialog-field)",
    color: "var(--text-primary)",
  },
  "& .MuiInputLabel-root": { color: "var(--dialog-muted)" },
  "& .MuiInputLabel-root.Mui-focused": { color: "var(--accent-strong)" },
  "& .MuiPickersOutlinedInput-notchedOutline": { borderColor: "var(--dialog-border)" },
  "& .MuiPickersOutlinedInput-root:hover .MuiPickersOutlinedInput-notchedOutline": {
    borderColor: "var(--accent-strong)",
  },
  "& .MuiPickersOutlinedInput-root.Mui-focused .MuiPickersOutlinedInput-notchedOutline": {
    borderColor: "var(--accent-strong)",
    boxShadow: "0 0 0 2px rgba(127, 139, 255, 0.2)",
  },
  "& .MuiSvgIcon-root": { color: "var(--text-primary)" },
};

const pickerPaperSx = {
  background: "var(--bg)",
  color: "var(--text-primary)",
  border: "1px solid var(--dialog-border)",
};

const pickerLayoutSx = {
  color: "var(--text-primary)",
  [`& .MuiTypography-root, & .MuiPickersCalendarHeader-label, & .${pickerDayClasses.root}, & .${yearCalendarClasses.button}, & .${monthCalendarClasses.button}, & .MuiClockNumber-root, & .MuiButton-root, & .MuiIconButton-root`]: {
    color: "var(--text-primary)",
  },
  "& .MuiDayCalendar-weekDayLabel": { color: "var(--text-secondary)" },
  [`& .${pickerDayClasses.root}:hover, & .${yearCalendarClasses.button}:hover, & .${monthCalendarClasses.button}:hover, & .MuiIconButton-root:hover`]: {
    backgroundColor: "var(--today-bg)",
  },
  [`& .${pickerDayClasses.root}.Mui-selected, & .${yearCalendarClasses.button}.Mui-selected, & .${monthCalendarClasses.button}.Mui-selected`]: {
    backgroundColor: "var(--accent-strong)",
    color: "var(--bg)",
    "&:hover, &:focus": { backgroundColor: "var(--accent-strong)" },
  },
  [`& .${pickerDayClasses.root}.${pickerDayClasses.today}`]: { borderColor: "var(--accent-strong)" },
  "& .Mui-disabled": { color: "var(--text-secondary)", opacity: 0.5 },
  "& .MuiSvgIcon-root": { color: "inherit" },
  "& .MuiClockPointer-thumb, & .MuiClock-pin": { color: "var(--text-primary)" },
};

const pickerPopupSlotProps = {
  mobilePaper: { sx: pickerPaperSx },
  desktopPaper: { sx: pickerPaperSx },
  layout: { sx: pickerLayoutSx },
};

interface PickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  autoFocus?: boolean;
}

const parseDate = (value: string): Dayjs | null => {
  const parsed = dayjs(value, "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
};

export function DateField({ value, onChange, ...props }: PickerFieldProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="de-ch">
      <DatePicker
        {...props}
        value={parseDate(value)}
        format="DD.MM.YYYY"
        onChange={(date) => onChange(date?.isValid() ? date.format("YYYY-MM-DD") : "")}
        slotProps={{
          ...pickerPopupSlotProps,
          textField: { fullWidth: true, sx: pickerFieldSx },
        }}
      />
    </LocalizationProvider>
  );
}

const parseTime = (value: string): Dayjs | null => {
  if (!value) return null;
  const parsed = dayjs(value, "HH:mm", true);
  return parsed.isValid() ? parsed : null;
};

export function TimeField({ value, onChange, ...props }: PickerFieldProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="de-ch">
      <MobileTimePicker
        {...props}
        ampm={false}
        views={["hours", "minutes"]}
        minutesStep={5}
        format="HH:mm"
        value={parseTime(value)}
        onChange={(time) => onChange(time?.isValid() ? time.format("HH:mm") : "")}
        slotProps={{
          ...pickerPopupSlotProps,
          textField: { fullWidth: true, sx: pickerFieldSx },
        }}
      />
    </LocalizationProvider>
  );
}
