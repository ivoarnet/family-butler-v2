import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useMemo, useState } from "react";
import { ParentingTimeSettings, type ParentingTimeRequest } from "./ParentingTimeSettings";

const householdId = "00000000-0000-0000-0000-000000000001";
const fatherId = "00000000-0000-0000-0000-000000000002";
const motherId = "00000000-0000-0000-0000-000000000003";
const members = [
  { id: fatherId, firstName: "Dad" },
  { id: motherId, firstName: "Mum" },
  { id: "00000000-0000-0000-0000-000000000007", firstName: "Elsa", isChild: true },
];
const calls = fn();

function ParentingTimeStory({ withPlan = false }: {
  withPlan?: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const request = useMemo(() => {
    const data: {
      parties: Array<{ id: string; name: string; memberId: string | null; active: boolean }>;
      plan: Record<string, unknown> | null;
      changes: Array<{ id: string; partyId: string; startAt: string; endAt: string; label: string }>;
    } = {
      parties: [
        { id: fatherId, name: "Dad", memberId: fatherId, active: true },
        { id: motherId, name: "Mum", memberId: null, active: true },
      ],
      plan: withPlan ? {
        id: "00000000-0000-0000-0000-000000000006",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        timeZone: "Europe/Zurich",
        recurrenceMode: "alternating",
        rules: [],
        handovers: [],
        active: true,
      } : null,
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
  }, [withPlan]);
  return <div className="app-shell" style={{ padding: 24 }}>
    <button type="button" onClick={() => setRefresh((current) => current + 1)}>Reload saved settings</button>
    <section className="settings-section">
      <ParentingTimeSettings key={refresh} householdId={householdId}
        members={members} request={request} />
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
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Dad" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Edit parenting party Dad" }));
    const partyDialog = page.getByRole("dialog", { name: "Edit parenting party" });
    await expect(partyDialog).toBeInTheDocument();
    await userEvent.click(within(partyDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Create schedule" })).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Create schedule" }));
    const planDialog = within(page.getByRole("dialog", { name: "Create recurring schedule" }));
    const scheduleInfo = planDialog.getByRole("button", { name: "Schedule scope and legal information" });
    await expect(scheduleInfo).toBeVisible();
    await userEvent.hover(scheduleInfo);
    await expect(await page.findByRole("tooltip")).toHaveTextContent(/not legal advice or proof of custody/);
    await userEvent.unhover(scheduleInfo);
    await userEvent.click(planDialog.getAllByRole("combobox", { name: "From → To" })[0]);
    await expect(page.getByRole("option", { name: "Dad → Mum" })).toBeInTheDocument();
    await expect(page.getByRole("option", { name: "Mum → Dad" })).toBeInTheDocument();
    await expect(page.queryByRole("option", { name: "Dad → Dad" })).not.toBeInTheDocument();
    await expect(page.queryByRole("option", { name: "Mum → Mum" })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("option", { name: "Mum → Dad" }));
    await userEvent.click(planDialog.getByRole("button", { name: "Add handover" }));
    await expect(planDialog.getAllByRole("button", { name: /Remove handover/ })).toHaveLength(5);
    await userEvent.click(planDialog.getAllByRole("button", { name: /Remove handover/ })[4]);
    await userEvent.click(planDialog.getByRole("button", { name: "Preview next 14 days" }));
    await waitFor(() => expect(canvas.getByRole("table", { name: "Parenting-time preview" })).toBeInTheDocument());
    await expect(page.queryByRole("dialog", { name: "Create recurring schedule" })).not.toBeInTheDocument();
    const previewCall = calls.mock.calls.find(([path, init]) => String(path).endsWith("/preview") && init?.method === "POST");
    expect(previewCall).toBeDefined();
    const payload = JSON.parse(String(previewCall?.[1]?.body));
    expect(payload.plan.recurrenceMode).toBe("alternating");
    expect(payload.plan.handovers).toHaveLength(4);
    expect(payload.plan.handovers.map((handover: { weekday: number; time: string; fromPartyId: string;
      toPartyId: string; weekParity: string | null }) =>
      [handover.weekday, handover.time, handover.fromPartyId, handover.toPartyId, handover.weekParity])).toEqual([
      [1, "19:30", motherId, fatherId, null],
      [4, "19:30", motherId, fatherId, null],
      [5, "17:00", fatherId, motherId, "even"],
      [7, "19:30", motherId, fatherId, "even"],
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Create schedule" }));
    const reopenedPlanDialog = within(page.getByRole("dialog", { name: "Create recurring schedule" }));
    await userEvent.click(reopenedPlanDialog.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(calls.mock.calls.some(([path, init]) =>
      String(path).endsWith("/plan") && init?.method === "PUT")).toBe(true));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add change" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Add change" }));
    const changeDialog = page.getByRole("dialog", { name: "Add change for this period" });
    await expect(changeDialog).toBeInTheDocument();
    await userEvent.click(within(changeDialog).getByRole("button", { name: "Cancel" }));
  },
};

export const ChangeDateTimePicker: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Add change" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Add change" }));
    const changeDialog = within(page.getByRole("dialog", { name: "Add change for this period" }));
    await expect(changeDialog.getByRole("textbox", { name: "From" })).toBeInTheDocument();
    await expect(changeDialog.getByRole("textbox", { name: "Until" })).toBeInTheDocument();
    await userEvent.click(changeDialog.getByRole("button", { name: "pick date" }));
    await waitFor(() => expect(page.getByRole("grid")).toBeInTheDocument());
    expect(page.getAllByRole("columnheader").slice(0, 7).map((header) => header.getAttribute("aria-label")))
      .toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    await userEvent.click(page.getByRole("button", { name: "pick time" }));
    await expect(page.getByRole("option", { name: "13 hours" })).toBeInTheDocument();
  },
};

export const PartyMemberLinking: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Mum" })).toBeEnabled());
    const partyInfo = canvas.getByRole("button", { name: "Parenting party information" });
    await expect(partyInfo).toBeVisible();
    await expect(partyInfo).toHaveAttribute("tabindex", "0");
    await expect(canvas.queryByText(/Child background hatching is enabled per child in Members/)).toBeNull();
    const document = canvasElement.ownerDocument;
    (document.activeElement as HTMLElement | null)?.blur();
    for (let index = 0; index < 8 && document.activeElement !== partyInfo; index += 1) {
      await userEvent.tab();
    }
    await expect(partyInfo).toHaveFocus();
    await userEvent.hover(partyInfo);
    await expect(await page.findByRole("tooltip")).toHaveTextContent(/Child background hatching is enabled per child in Members/);
    await userEvent.unhover(partyInfo);
    await expect(canvas.queryByRole("combobox", { name: "Household parenting party" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Save calendar display" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Edit parenting party Mum" }));
    const dialog = within(await page.findByRole("dialog", { name: "Edit parenting party" }));
    await expect(dialog.getByRole("combobox", { name: "Link to household member (optional)" })).toHaveTextContent("No linked member");
    await userEvent.click(dialog.getByRole("combobox", { name: "Link to household member (optional)" }));
    await userEvent.click(page.getByRole("option", { name: "Mum" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save party" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(canvas.getByRole("button", { name: "Reload saved settings" })).toBeEnabled());
    const save = calls.mock.calls.find(([path, init]) => String(path).endsWith("/parties") && init?.method === "PUT");
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({
      id: motherId, name: "Mum", memberId: motherId, active: true,
    });
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved settings" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Mum" })).toBeEnabled());
    const row = canvas.getByRole("button", { name: "Edit parenting party Mum" }).closest("tr")!;
    await expect(within(row).getAllByText("Mum")).toHaveLength(2);
    expect(calls.mock.calls.some(([path]) => String(path).endsWith("/calendar-settings"))).toBe(false);
    expect(calls.mock.calls.some(([path, init]) => String(path).endsWith("/plan") && init?.method === "PUT")).toBe(false);
  },
};

export const HouseholdPartyLinks: Story = {
  args: { withPlan: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Edit parenting party Dad" })).toBeEnabled());
    const partyInfo = canvas.getByRole("button", { name: "Parenting party information" });
    await userEvent.hover(partyInfo);
    await expect(await page.findByRole("tooltip")).toHaveTextContent(/Unknown periods, stale member links, and archived parties remain unshaded/);
    const mumRow = canvas.getByRole("button", { name: "Edit parenting party Mum" }).closest("tr")!;
    await expect(within(mumRow).getByText("Not linked")).toBeVisible();
    expect(calls.mock.calls.some(([path]) => String(path).endsWith("/calendar-settings"))).toBe(false);
  },
};
