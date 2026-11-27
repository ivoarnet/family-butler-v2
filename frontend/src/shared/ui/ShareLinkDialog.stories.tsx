import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { ShareLinkDialog, afterLocalShareDay, localShareDate, type ShareLinkValues } from "./ShareLinkDialog";

const save = fn(async (_values: ShareLinkValues, _signal: AbortSignal) => undefined);
const close = fn();
const expiredAt = "2020-05-10T12:34:56.000Z";
const meta: Meta<typeof ShareLinkDialog> = {
  title: "Shared/Share Link Dialog",
  component: ShareLinkDialog,
  args: {
    initialValues: { expiresAt: expiredAt, note: "Original note", categories: ["holiday"] },
    title: "Edit shared link", editing: true, onSave: save, onClose: close,
  },
  beforeEach: () => { save.mockClear(); close.mockClear(); },
};
export default meta;
type Story = StoryObj<typeof ShareLinkDialog>;

export const CompactCreate: Story = {
  args: {
    title: "Share parenting changes", editing: false,
    initialValues: { expiresAt: "2090-12-01T00:00:00Z", note: "", categories: ["holiday"] },
    categoryOptions: [
      { value: "adjusted_handover", label: "Adjusted Handover" },
      { value: "holiday", label: "Holiday" }, { value: "diverse", label: "Diverse" },
    ],
    information: "Only future changes in selected categories are shared.",
  },
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await expect(dialog.queryByText(/Dates use your local timezone/)).toBeNull();
    await expect(dialog.queryByText(/Only future changes/)).toBeNull();
    await expect(dialog.queryByText(/^Expires:/)).toBeNull();
    await waitFor(() => expect(dialog.getByText(/Anyone with the link can view it/)).toBeVisible());
    await expect(dialog.getByRole("button", { name: "Create link" })).toBeEnabled();
  },
};
export const KeyboardInformation: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    const info = dialog.getByRole("button", { name: "Sharing information" });
    await userEvent.tab();
    await expect(info).toHaveFocus();
    const tooltip = await page.findByRole("tooltip");
    await expect(tooltip).toHaveTextContent("The selected day is included");
    await expect(tooltip).toHaveTextContent("Private notes are never shared");
    await expect(tooltip).toHaveTextContent("only a digest is stored");
    expect(save).not.toHaveBeenCalled();
    await userEvent.tab();
    await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
  },
};
export const MobileInformation: Story = {
  args: CompactCreate.args,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    const info = dialog.getByRole("button", { name: "Sharing information" });
    await fireEvent.touchStart(info);
    await expect(await page.findByRole("tooltip")).toHaveTextContent("Only future changes");
    await fireEvent.touchEnd(info);
    expect(save).not.toHaveBeenCalled();
    await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull(), { timeout: 3000 });
  },
};

export const EditExpiredNote: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog", { name: "Edit shared link" }));
    const button = dialog.getByRole("button", { name: "Save shared link" });
    await expect(button).toBeEnabled();
    await waitFor(() => expect(dialog.getByText("This link is expired.")).toBeVisible());
    await expect(dialog.queryByText(/^Expires:/)).toBeNull();
    await userEvent.clear(dialog.getByRole("textbox", { name: "Private note (optional)" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Private note (optional)" }), "Still private");
    await userEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledWith({
      expiresAt: expiredAt, note: "Still private", categories: ["holiday"],
    }, expect.any(AbortSignal)));
    expect(close).toHaveBeenCalled();
  },
};
export const ShortenExpiryToPast: Story = {
  args: { initialValues: { expiresAt: afterLocalShareDay(localShareDate(new Date(Date.now() + 86400000).toISOString())), note: "", categories: [] } },
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    const picker = within(dialog.getByRole("group", { name: "Expiry date" }));
    await userEvent.click(picker.getByRole("spinbutton", { name: "Year" }));
    await userEvent.keyboard("2020");
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Date.parse(save.mock.calls[0][0].expiresAt)).toBeLessThan(Date.now());
    const date = new Date(save.mock.calls[0][0].expiresAt);
    expect(date.getHours()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);
  },
};
export const ExpiredCreateRejected: Story = {
  args: { editing: false, title: "Create shared link" },
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await expect(dialog.getByRole("button", { name: "Create link" })).toBeDisabled();
    await waitFor(() => expect(dialog.getByText("Choose a future expiry.")).toBeVisible());
    expect(save).not.toHaveBeenCalled();
  },
};
export const SaveFailure: Story = {
  args: { onSave: async () => { throw new Error("Could not save shared link."); } },
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await waitFor(() => expect(dialog.getByText("Could not save shared link.")).toBeVisible());
    await expect(dialog.getByRole("button", { name: "Save shared link" })).toBeEnabled();
    expect(close).not.toHaveBeenCalled();
  },
};
export const BusySave: Story = {
  args: { onSave: async () => { await new Promise<void>((resolve) => setTimeout(resolve, 500)); } },
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await waitFor(() => expect(close).toHaveBeenCalled());
  },
};
