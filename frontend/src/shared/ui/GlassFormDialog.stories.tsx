import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { FieldTitle, FormField, GradientButton } from "./GlassFormDialog";

const GlassPrimitives = ({
  disabled = false,
  error = false,
}: {
  disabled?: boolean;
  error?: boolean;
}) => (
  <Box sx={{ width: 360, display: "grid", gap: 2 }}>
    <FieldTitle variant="subtitle1">Profile details</FieldTitle>
    <FormField
      label="First name"
      slotProps={{ inputLabel: { shrink: true } }}
      value={error ? "" : "Alex"}
      error={error}
      helperText={error ? "First name is required." : " "}
      disabled={disabled}
    />
    <GradientButton variant="contained" disableElevation disabled={disabled}>
      Save changes
    </GradientButton>
  </Box>
);

const meta: Meta<typeof GlassPrimitives> = {
  title: "Shared/GlassFormPrimitives",
  component: GlassPrimitives,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof GlassPrimitives>;

export const Default: Story = {};
export const ErrorState: Story = { args: { error: true } };
export const DisabledState: Story = { args: { disabled: true } };
