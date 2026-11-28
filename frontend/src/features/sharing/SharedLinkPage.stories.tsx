import { StrictMode, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SharedLinkPage } from "./SharedLinkPage";

const token = "p".repeat(43);
const requests = fn();
type MockMode = "loaded" | "childcare" | "invalid" | "empty" | "expiry" | "deleted" | "handover" | "rateLimited"
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
      if (mode === "childcare") {
        const start = new Date();
        const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
        const previous = new Date(start);
        previous.setDate(previous.getDate() - 1);
        const previousDate = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        const expiryDate = new Date(end);
        expiryDate.setDate(expiryDate.getDate() + 1);
        return new Response(JSON.stringify({
          resourceType: "childcare_schedule", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          startDate, endDate, providerName: "Grandparents",
          expiresAt: expiryDate.toISOString(),
          occurrences: [
            { date: startDate, providerName: "Grandparents", childNames: ["Alex"], allDay: true,
              startTime: null, endTime: null, overrideAction: null },
            { date: startDate, providerName: "Grandparents", childNames: ["Sam"], allDay: false,
              startTime: "09:30", endTime: "15:00", overrideAction: "replace" },
            { date: previousDate, providerName: "Yesterday should not be shown", childNames: ["Alex"], allDay: true,
              startTime: null, endTime: null, overrideAction: null },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
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
    expect(new Headers(init.headers).get("x-share-token")).toBe(token);
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(new Headers(init.headers).has("x-supabase-auth-token")).toBe(false);
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    const table = within(canvas.getByRole("table", { name: "Shared parenting changes" }));
    await expect(table.getByText("Family holiday")).toBeVisible();
    await expect(table.getAllByText(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/)).toHaveLength(2);
    await expect(canvas.getByText(/Expires:/)).toHaveTextContent(/Expires: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} · Timezone:/);
  },
};
export const SharedChildcare: Story = {
  parameters: { shareMock: "childcare" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Shared resolved care")).toBeVisible();
    const table = within(canvas.getByRole("table", { name: "Shared care occurrences" }));
    const occurrence = table.getByRole("row", { name: /Grandparents.*Alex/ });
    await expect(occurrence).toHaveTextContent(/Grandparents/);
    await expect(occurrence).toHaveTextContent(/\d{2}\.\d{2}\.\d{4} · All day.*Alex.*Recurring/);
    await expect(table.getByRole("row", { name: /Sam/ })).toHaveTextContent(/\d{2}\.\d{2}\.\d{4} 09:30–15:00.*Changed · replace/);
    await expect(canvas.queryByText(/Yesterday should not be shown/)).toBeNull();
    await expect(canvas.getByText(/Live future resolved care/)).toBeVisible();
  },
};
export const ViewCountIgnoresRefresh: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Family holiday");
    const initialIds = requests.mock.calls.map(([, init]) => JSON.parse(init.body).viewId);
    expect(initialIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(initialIds).size).toBe(1);
    const before = requests.mock.calls.length;
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(before));
    await canvas.findByText("Family holiday");
    expect(JSON.parse(requests.mock.calls[requests.mock.calls.length - 1][1].body)).toEqual({});
  },
};
function ReopenStory() {
  const [visit, setVisit] = useState(0);
  return <><button onClick={() => setVisit((current) => current + 1)}>Open again</button>
    <SharedLinkPage key={visit} token={token} /></>;
}
export const NewOpenCountsAgain: Story = {
  render: () => <ReopenStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Family holiday");
    const initialId = JSON.parse(requests.mock.calls[requests.mock.calls.length - 1][1].body).viewId;
    await userEvent.click(canvas.getByRole("button", { name: "Open again" }));
    await canvas.findByText("Family holiday");
    expect(JSON.parse(requests.mock.calls[requests.mock.calls.length - 1][1].body).viewId).not.toBe(initialId);
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
    expect(new Set(requests.mock.calls.map(([, init]) => JSON.parse(init.body).viewId)).size).toBe(1);
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
