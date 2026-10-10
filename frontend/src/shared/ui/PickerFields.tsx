import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/de-ch";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";

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
          textField: { fullWidth: true, sx: pickerFieldSx },
          mobilePaper: { sx: { background: "var(--dialog-surface)", color: "var(--text-primary)" } },
          desktopPaper: { sx: { background: "var(--dialog-surface)", color: "var(--text-primary)" } },
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
          textField: { fullWidth: true, sx: pickerFieldSx },
          mobilePaper: { sx: { background: "var(--dialog-surface)", color: "var(--text-primary)" } },
          layout: {
            sx: {
              "& .MuiTypography-root, & .MuiClockNumber-root, & .MuiClockPointer-thumb, & .MuiClock-pin, & .MuiButton-root, & .MuiIconButton-root .MuiSvgIcon-root": {
                color: "var(--text-primary)",
              },
            },
          },
        }}
      />
    </LocalizationProvider>
  );
}
