import { StrictMode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SharedLinkPage } from "./SharedLinkPage";

const token = "p".repeat(43);
const requests = fn();
type MockMode = "loaded" | "invalid" | "empty" | "expiry" | "deleted" | "handover" | "rateLimited"
  | "networkFailure" | "serverFailure" | "refreshFailure" | "malformedResponse";
const meta: Meta<typeof SharedLinkPage> = {
  title: "Sharing/Public parenting changes",
  component: SharedLinkPage,
  args: { token },
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <StrictMode><Story /></StrictMode>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    requests.mockClear();
    const mode = (parameters.shareMock ?? "loaded") as MockMode;
    window.fetch = async (input, init) => {
      if (!String(input).endsWith("/api/shared-links/resolve")) return original(input, init);
      requests(input, init);
      if (mode === "invalid" || (mode === "deleted" && requests.mock.calls.length > 2)) return new Response("Not found", { status: 404 });
      if (mode === "rateLimited" && requests.mock.calls.length <= 2) return new Response("Busy", { status: 429, headers: { "Retry-After": "1" } });
      if ((mode === "networkFailure" && requests.mock.calls.length <= 2)
        || (mode === "refreshFailure" && requests.mock.calls.length === 3)) throw new TypeError("Failed to fetch");
      if (mode === "serverFailure" && requests.mock.calls.length <= 2) return new Response("Unavailable", { status: 503 });
      if (mode === "malformedResponse") return new Response("not JSON", { status: 200 });
      const now = Date.now();
      return new Response(JSON.stringify({
        resourceType: "parenting_changes", timeZone: "Europe/Zurich",
        expiresAt: new Date(now + (mode === "expiry" ? 2000 : 7 * 86400000)).toISOString(),
        changes: mode === "empty" ? [] : [{
          startAt: new Date(now + (mode === "expiry" ? 1000 : mode === "handover" ? 1500 : 86400000)).toISOString(),
          endAt: new Date(now + 2 * 86400000).toISOString(), partyName: "Mum", category: "holiday", label: "Family holiday",
        }, {
          startAt: new Date(now - 86400000).toISOString(), endAt: new Date(now + 86400000).toISOString(),
          partyName: "Past", category: "diverse", label: "Ongoing should not appear",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    return () => { window.fetch = original; };
  },
};
export default meta;
type Story = StoryObj<typeof SharedLinkPage>;

export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Family holiday")).toBeVisible();
    await expect(canvas.getByText(/Timezone: Europe\/Zurich/)).toBeVisible();
    await expect(canvas.queryByText("Ongoing should not appear")).toBeNull();
    await expect(canvas.queryByRole("button")).toBeNull();
    const [, init] = requests.mock.calls[requests.mock.calls.length - 1];
    expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit" });
    expect(new Headers(init.headers).get("Authorization")).toBe(["Bearer", token].join(" "));
    expect(new Headers(init.headers).has("x-supabase-auth-token")).toBe(false);
  },
};
export const Invalid: Story = {
  parameters: { shareMock: "invalid" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/This shared link is unavailable/)).toBeVisible();
    await expect(canvas.queryByText("Family holiday")).toBeNull();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};
export const MalformedToken: Story = {
  args: { token: "bad-token" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/This shared link is unavailable/);
    expect(requests).not.toHaveBeenCalled();
  },
};
export const Empty: Story = {
  parameters: { shareMock: "empty" },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("No upcoming changes are available for this link.")).toBeVisible();
  },
};
export const ExpiresWhileOpen: Story = {
  parameters: { shareMock: "expiry" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Family holiday");
    await waitFor(() => expect(canvas.getByText(/This shared link is unavailable/)).toBeVisible(), { timeout: 4000 });
    await expect(canvas.queryByText("Family holiday")).toBeNull();
  },
};
export const FutureHandoverOnly: Story = {
  parameters: { shareMock: "handover" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Family holiday");
    await waitFor(() => expect(canvas.queryByText("Family holiday")).toBeNull(), { timeout: 4000 });
    await expect(canvas.getByText("No upcoming changes are available for this link.")).toBeVisible();
  },
};
export const DeletedOnReturn: Story = {
  parameters: { shareMock: "deleted" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Family holiday");
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    await waitFor(() => expect(canvas.queryByText("Family holiday")).toBeNull());
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await expect(await canvas.findByText(/This shared link is unavailable/)).toBeVisible();
  },
};
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: Loaded.play,
};
export const RateLimitedThenRetry: Story = {
  parameters: { shareMock: "rateLimited" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/This link is temporarily busy/)).toBeVisible();
    await waitFor(() => expect(canvas.getByText("Family holiday")).toBeVisible(), { timeout: 4000 });
    await expect(canvas.queryByText(/This link is temporarily busy/)).toBeNull();
  },
};
export const NetworkFailureRecovery: Story = {
  parameters: { shareMock: "networkFailure" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Could not load shared changes right now/)).toBeVisible();
    await expect(canvas.queryByText("Family holiday")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(await canvas.findByText("Family holiday")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();
  },
};
export const ServerFailureRecovery: Story = {
  parameters: { shareMock: "serverFailure" },
  play: NetworkFailureRecovery.play,
};
export const RefreshFailureClearsContent: Story = {
  parameters: { shareMock: "refreshFailure" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Family holiday");
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await canvas.findByText(/Could not load shared changes right now/);
    await expect(canvas.queryByText("Family holiday")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(await canvas.findByText("Family holiday")).toBeVisible();
  },
};
export const MalformedResponseIsPermanent: Story = {
  parameters: { shareMock: "malformedResponse" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/This shared link is unavailable/);
    await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull();
  },
};
