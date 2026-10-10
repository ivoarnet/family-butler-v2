import { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import { FormField } from "./GlassFormDialog";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  disabled?: boolean;
  presets?: string[];
}

const isHexColor = (value: string) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
const pickerColor = (value: string) => {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split("").map((digit) => `${digit}${digit}`).join("")}`;
  }
  return "#000000";
};

export function ColorPicker({ label, value, onChange, helperText, disabled = false, presets = [] }: ColorPickerProps) {
  const [textValue, setTextValue] = useState(value);
  useEffect(() => setTextValue(value), [value]);

  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(100px, 0.65fr) minmax(150px, 1fr)", gap: 1.5 }}>
        <FormField
          label={label}
          type="color"
          value={pickerColor(value)}
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { "aria-label": `${label} color wheel` } }}
          onChange={(event) => {
            setTextValue(event.target.value);
            onChange(event.target.value);
          }}
        />
        <FormField
          label={`${label} hex value`}
          value={textValue}
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { spellCheck: false, autoCapitalize: "off" } }}
          onChange={(event) => {
            const next = event.target.value;
            setTextValue(next);
            if (isHexColor(next)) onChange(next);
          }}
        />
      </Box>
      {helperText && <Box component="span" sx={{ color: "var(--dialog-muted)", fontSize: "0.75rem" }}>{helperText}</Box>}
      {presets.length > 0 && (
        <Box role="group" aria-label={`${label} presets`} sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {presets.map((color) => (
            <Button
              key={color}
              type="button"
              aria-label={`Select ${color} ${label.toLowerCase()}`}
              aria-pressed={value.toLowerCase() === color.toLowerCase()}
              disabled={disabled}
              onClick={() => {
                setTextValue(color);
                onChange(color);
              }}
              sx={{
                minWidth: 32,
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: value.toLowerCase() === color.toLowerCase()
                  ? "2px solid var(--accent-strong)"
                  : "1px solid var(--dialog-border)",
                backgroundColor: color,
                "&:hover": { backgroundColor: color, filter: "brightness(1.1)" },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
