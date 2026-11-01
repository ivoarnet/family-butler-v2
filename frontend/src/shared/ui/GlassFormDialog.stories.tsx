import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Typography } from "@mui/material";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { ColorPicker } from "./ColorPicker";
import { FieldTitle, FormField, GradientButton, SecondaryButton } from "./GlassFormDialog";
import { DateField, TimeField } from "./PickerFields";

const GlassPrimitives = ({
  disabled = false,
  error = false,
}: {
  disabled?: boolean;
  error?: boolean;
}) => {
  const [date, setDate] = useState("2026-03-15");
  const [time, setTime] = useState("09:30");
  const [color, setColor] = useState("#7f8bff");

  return (
    <Box component="main" sx={{ width: "min(100%, 420px)", display: "grid", gap: 2, p: 2 }}>
      <Typography component="h1" sx={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
      }}>Shared form controls</Typography>
      <FieldTitle component="h2" variant="subtitle1">Profile details</FieldTitle>
      <FormField
        label="First name"
        slotProps={{ inputLabel: { shrink: true } }}
        value={error ? "" : "Alex"}
        error={error}
        helperText={error ? "First name is required." : " "}
        disabled={disabled}
      />
      <DateField label="Date" value={date} onChange={setDate} disabled={disabled} />
      <TimeField label="Time" value={time} onChange={setTime} disabled={disabled} />
      <ColorPicker label="Avatar color" value={color} onChange={setColor} disabled={disabled}
        presets={["#7f8bff", "#b07cff", "#4cbd9b"]} helperText="Choose with the color picker or enter a hex value." />
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
        <SecondaryButton variant="outlined" disabled={disabled}>Cancel</SecondaryButton>
        <GradientButton variant="contained" disableElevation disabled={disabled}>Save changes</GradientButton>
      </Box>
      <output aria-label="Stored values">{date} · {time} · {color}</output>
    </Box>
  );
};

const meta: Meta<typeof GlassPrimitives> = {
  title: "Shared/GlassFormPrimitives",
  component: GlassPrimitives,
  parameters: {
    layout: "centered",
  },
  beforeEach: ({ parameters }) => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", parameters.dark ? "dark" : "light");
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => query === "(pointer: fine)"
      ? { ...originalMatchMedia.call(window, query), matches: !parameters.mobilePicker,
        media: query, addEventListener: () => {}, removeEventListener: () => {} } as MediaQueryList
      : originalMatchMedia.call(window, query);
    return () => {
      window.matchMedia = originalMatchMedia;
      if (previousTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previousTheme);
    };
  },
};

export default meta;
type Story = StoryObj<typeof GlassPrimitives>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dateField = canvas.getByRole("group", { name: "Date" });
    await expect(dateField.querySelector("input")).toHaveValue("15.03.2026");
    const daySection = canvas.getByRole("spinbutton", { name: "Day" });
    const hourSection = canvas.getByRole("spinbutton", { name: "Hours" });
    await expect(daySection).toHaveAttribute("aria-valuenow", "15");
    await expect(hourSection).toHaveAttribute("aria-valuenow", "9");
    await userEvent.click(daySection);
    await userEvent.keyboard("16");
    await userEvent.click(hourSection);
    await userEvent.keyboard("10");
    await expect(canvas.getByLabelText("Stored values")).toHaveTextContent("2026-03-16 · 10:30");
    await expect(dateField.querySelector("input")).toHaveValue("16.03.2026");
    const colorInput = canvas.getByRole("textbox", { name: "Avatar color hex value" });
    await expect(colorInput).toHaveValue("#7f8bff");
    await userEvent.click(canvas.getByRole("button", { name: "Select #4cbd9b avatar color" }));
    await expect(canvas.getByLabelText("Stored values")).toHaveTextContent("2026-03-16 · 10:30 · #4cbd9b");
    await userEvent.clear(colorInput);
    await userEvent.type(colorInput, "#12abef");
    await expect(canvas.getByLabelText("Stored values")).toHaveTextContent("#12abef");
  },
};
export const ErrorState: Story = { args: { error: true } };
export const DisabledState: Story = { args: { disabled: true } };

const calendarPlay: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: /Choose date/ }));
  const dialog = await body.findByRole("dialog");
  const calendar = within(dialog);
  const root = canvasElement.ownerDocument.documentElement;
  const expectedColor = getComputedStyle(root).getPropertyValue("--text-primary").trim();
  const probe = document.createElement("span");
  probe.style.color = expectedColor;
  root.appendChild(probe);
  const textColor = getComputedStyle(probe).color;
  probe.remove();
  const day = calendar.getByRole("gridcell", { name: "16" });
  await expect(getComputedStyle(day).color).toBe(textColor);
  await expect(getComputedStyle(calendar.getByRole("button", { name: "Next month" })).color).toBe(textColor);
  const paper = day.closest(".MuiPaper-root")!;
  const background = getComputedStyle(paper).backgroundColor;
  await expect(background).not.toBe("rgba(0, 0, 0, 0)");
  await expect(background).not.toMatch(/rgba/);
  await userEvent.click(calendar.getByRole("button", { name: /switch to year view/ }));
  await expect(getComputedStyle(calendar.getByRole("radio", { name: "2025" })).color).toBe(textColor);
  await userEvent.click(calendar.getByRole("radio", { name: "2026" }));
  await userEvent.click(calendar.getByRole("gridcell", { name: "16" }));
  const accept = body.queryByRole("button", { name: /^(OK|Accept)$/ });
  if (accept) await userEvent.click(accept);
  await expect(canvas.getByLabelText("Stored values")).toHaveTextContent("2026-03-16");
};

export const LightDatePicker: Story = { play: calendarPlay };
export const DarkDatePicker: Story = { parameters: { dark: true }, play: calendarPlay };
export const DarkMobileDatePicker: Story = { parameters: { dark: true, mobilePicker: true }, play: calendarPlay };
