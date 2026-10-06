import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useMemo } from "react";
import { ParentingTimeSettings, type ParentingTimeRequest } from "./ParentingTimeSettings";

const householdId = "00000000-0000-0000-0000-000000000001";
const fatherId = "00000000-0000-0000-0000-000000000002";
const motherId = "00000000-0000-0000-0000-000000000003";
const members = [
  { id: fatherId, firstName: "Dad" },
  { id: motherId, firstName: "Mum" },
];
const calls = fn();

function ParentingTimeStory() {
  const request = useMemo(() => {
    const data: {
      parties: Array<{ id: string; name: string; memberId: string | null; active: boolean }>;
      plan: Record<string, unknown> | null;
      changes: Array<{ id: string; partyId: string; startAt: string; endAt: string; label: string }>;
    } = {
      parties: [
        { id: fatherId, name: "Dad", memberId: fatherId, active: true },
        { id: motherId, name: "Mum", memberId: motherId, active: true },
      ],
      plan: null,
      changes: [],
    };
    return (async (path, init = {}) => {
      calls(path, init);
      const url = new URL(path, "http://storybook.local");
      const resource = url.pathname.split("/parenting-time")[1].replace(/^\//, "");
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      if (!resource) return structuredClone(data);
      if (resource === "preview" || resource === "resolve") return {
        intervals: [
          { startAt: "2026-10-08T19:30:00.000Z", endAt: "2026-10-09T17:00:00.000Z", partyId: fatherId, partyName: "Dad", source: { type: "plan" } },
          { startAt: "2026-10-09T17:00:00.000Z", endAt: "2026-10-11T19:30:00.000Z", partyId: motherId, partyName: "Mum", source: { type: "plan" } },
        ],
      };
      if (resource === "plan" && init.method === "PUT") {
        data.plan = { ...body, id: "00000000-0000-0000-0000-000000000004" };
        return data.plan;
      }
      if (resource === "parties" && init.method === "POST") {
        const party = { ...body, id: "00000000-0000-0000-0000-000000000005" };
        data.parties.push(party as typeof data.parties[number]);
        return party;
      }
      if (resource === "parties" && init.method === "PUT") {
        const party = data.parties.find(({ id }) => id === body.id)!;
        Object.assign(party, body);
        return party;
      }
      return structuredClone(data);
    }) as ParentingTimeRequest;
  }, []);
  return <div className="app-shell" style={{ padding: 24 }}>
    <section className="settings-section">
      <ParentingTimeSettings householdId={householdId} members={members} request={request} />
    </section>
  </div>;
}

const meta: Meta<typeof ParentingTimeStory> = {
  title: "Settings/Parenting Time",
  component: ParentingTimeStory,
  parameters: { layout: "fullscreen" },
  beforeEach: () => { calls.mockClear(); },
};
export default meta;
type Story = StoryObj<typeof ParentingTimeStory>;

export const HouseholdPlan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Dad")).toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Preview next 14 days" }));
    await waitFor(() => expect(canvas.getAllByText("Regular plan").length).toBeGreaterThan(0));
    const previewCall = calls.mock.calls.find(([path, init]) => String(path).endsWith("/preview") && init?.method === "POST");
    expect(previewCall).toBeDefined();
    const payload = JSON.parse(String(previewCall?.[1]?.body));
    expect(payload.plan.recurrenceMode).toBe("alternating");
    expect(payload.plan.rules).toHaveLength(6);
    expect(payload.plan.rules.find((rule: { weekday: number; startTime: string; weekParity: string | null }) =>
      rule.weekday === 5 && rule.startTime === "17:00" && rule.weekParity === "odd")?.partyId).toBe(fatherId);
    expect(payload.plan.rules.find((rule: { weekday: number; startTime: string; weekParity: string | null }) =>
      rule.weekday === 5 && rule.startTime === "17:00" && rule.weekParity === "even")?.partyId).toBe(motherId);
    await userEvent.click(canvas.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) =>
      String(path).endsWith("/plan") && init?.method === "PUT")).toBe(true));
  },
};
