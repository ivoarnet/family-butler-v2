import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useRef, useState } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { SettingsPage } from "../../../pages/SettingsPage";
import type { HouseholdData } from "../../app/types";
import type { ShareLink, ShareLinkRequest } from "../../../shared/sharing/shareLinks";
import { afterLocalShareDay, localShareDate } from "../../../shared/ui/ShareLinkDialog";
import { SharedLinksSettings } from "./SharedLinksSettings";

const calls = fn<ShareLinkRequest>();
const sample = (): ShareLink => ({
  id: "parenting-link", resourceType: "parenting_changes", categories: ["holiday"], note: "For grandparents",
  createdAt: "2026-01-01T10:00:00Z", expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
});
const emptyHousehold: HouseholdData = {
  householdId: "first", householdName: "Family Calendar", familyMembers: [],
  contacts: [], eventTypes: [], events: [], dayConfigurations: [],
};

function SharedLinksStory({ navigation = false, errors = false, expired = false, futureResource = false, narrow = false, delayed }: {
  navigation?: boolean; errors?: boolean; expired?: boolean; futureResource?: boolean; narrow?: boolean; delayed?: "GET" | "PATCH" | "DELETE";
}) {
  const [householdId, setHouseholdId] = useState("first");
  const [data, setData] = useState(emptyHousehold);
  const complete = useRef<(() => void) | null>(null);
  const request = useMemo<ShareLinkRequest>(() => {
    let links = [{ ...sample(), ...(expired ? { expiresAt: "2025-01-04T09:13:00Z" } : {}) }];
    if (futureResource) links.push({ ...sample(), id: "future-link", resourceType: "future_resource",
      categories: ["future_category"], note: "Future resource metadata" });
    const failures = new Set<string>();
    return async (path, init = {}) => {
      calls(path, init);
      const method = init.method ?? "GET";
      const oldHousehold = path.includes("/first/");
      if (errors && !failures.has(method)) {
        failures.add(method);
        throw new Error(`Could not ${method === "GET" ? "load" : method === "PATCH" ? "save" : "delete"} shared links. Try again.`);
      }
      const payload = init.body ? JSON.parse(String(init.body)) : {};
      const result = method === "GET" ? { links: oldHousehold ? structuredClone(links) : [] }
        : method === "PATCH" ? { link: { ...links[0], ...payload } } : undefined;
      if (delayed === method && oldHousehold) await new Promise<void>((resolve) => { complete.current = resolve; });
      if (method === "PATCH") links[0] = { ...links[0], ...payload };
      if (method === "DELETE") links = links.filter((link) => link.id !== new URL(path, "https://example.test").searchParams.get("id"));
      return result;
    };
  }, [errors, expired, futureResource, delayed]);
  return <div className="app-shell" style={{ padding: 24, width: narrow ? "min(390px, 100%)" : undefined }}>
    {delayed && <>
      <button type="button" onClick={() => { setHouseholdId("second"); setData({ ...emptyHousehold, householdId: "second" }); }}>Switch household</button>
      <button type="button" onClick={() => complete.current?.()}>Resolve previous request</button>
    </>}
    {navigation ? <SettingsPage mode="settings" households={[{ id: householdId, name: "Family Calendar" }]}
      activeHouseholdId={householdId} onSwitchHousehold={setHouseholdId}
      onCreateHousehold={async () => ({ ok: true })} onUpdateHousehold={async () => ({ ok: true })}
      isContextLoading={false} isCreatingHousehold={false} householdData={data} setHouseholdData={setData}
      contextError={null} onRetryContextAction={() => undefined} onGoHome={() => undefined}
      initialSection="households" currentUserEmail="demo@example.com" initialProfileFirstName="Demo"
      initialProfileLastName="User" isProfileSaving={false} onSaveProfile={async () => ({ ok: true })}
      theme="dark" setTheme={() => undefined} childcareRequest={request} />
      : <section className="settings-section"><SharedLinksSettings householdId={householdId} request={request} /></section>}
  </div>;
}

const meta: Meta<typeof SharedLinksStory> = {
  title: "Settings/Shared Links", component: SharedLinksStory, parameters: { layout: "fullscreen" },
  beforeEach: () => { calls.mockClear(); },
};
export default meta;
type Story = StoryObj<typeof SharedLinksStory>;
const editButton = "Edit shared link for Parenting changes";
const deleteButton = "Delete shared link for Parenting changes";

export const SharedLinksOverview: Story = {
  args: { navigation: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Shared links" }));
    await expect(await canvas.findByRole("table", { name: "Shared links" })).toBeVisible();
  },
};

export const TitleInformation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("table", { name: "Shared links" });
    const info = canvas.getByRole("button", { name: "Shared links information" });
    await expect(info.parentElement).toHaveClass("section-title-info");
    await expect(canvas.queryByText(/Manage links you shared/)).toBeNull();
    await userEvent.tab();
    await expect(info).toHaveFocus();
    await expect(await page.findByRole("tooltip")).toHaveTextContent("Notes are private.");
    await expect(page.getByRole("tooltip")).toHaveTextContent("lost URLs cannot be recovered");
    await userEvent.tab();
    await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
    await userEvent.hover(info);
    await expect(await page.findByRole("tooltip")).toHaveTextContent("Create a new link if needed.");
    await userEvent.unhover(info);
  },
};

export const SharedLinksMobile: Story = {
  args: { navigation: true, narrow: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Shared links" }));
    const table = await canvas.findByRole("table", { name: "Shared links" });
    const scroll = table.parentElement!;
    const shell = canvasElement.querySelector(".app-shell")!;
    await waitFor(() => {
      expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
      expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth);
    });
    scroll.scrollLeft = scroll.scrollWidth;
    expect(scroll.scrollLeft).toBeGreaterThan(0);
    scroll.scrollLeft = 0;
  },
};

export const CentralSettingsNavigation: Story = {
  args: { navigation: true, futureResource: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(calls).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("tab", { name: "Shared links" }));
    const table = await canvas.findByRole("table", { name: "Shared links" });
    await expect(table).toHaveClass("settings-table");
    await expect(table.parentElement).toHaveClass("table-scroll");
    await expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Resource / type", "Categories / scope", "Created", "Expires / status", "Private note", "Actions",
    ]);
    await expect(within(table).getByText("Parenting changes")).toBeVisible();
    await expect(within(table).getByText("future_resource")).toBeVisible();
    await expect(within(table).getByText("future_category")).toBeVisible();
    await expect(within(table).getByText("For grandparents")).toBeVisible();
    await expect(within(table).getByRole("button", { name: editButton }).parentElement).toHaveClass("action-buttons");
    expect(calls.mock.calls[0][0]).toBe("/api/households/first/share-links");
    await expect(canvas.queryByRole("button", { name: "Copy link" })).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: "Members" }));
    await expect(canvas.queryByRole("table", { name: "Shared links" })).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: "Shared links" }));
    await expect(await canvas.findByRole("table", { name: "Shared links" })).toBeVisible();
  },
};

export const EditAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: editButton }));
    const dialog = within(await page.findByRole("dialog", { name: "Edit shared link" }));
    await expect(dialog.getByRole("textbox", { name: "Private note (optional)" })).toHaveValue("For grandparents");
    await waitFor(() => expect(dialog.getByText(/Categories: Holiday/)).toBeVisible());
    await expect(dialog.queryByRole("checkbox")).toBeNull();
    await userEvent.clear(dialog.getByRole("textbox", { name: "Private note (optional)" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Private note (optional)" }), "Updated private note");
    const date = new Date(Date.now() + 7 * 86400000);
    const picker = within(dialog.getByRole("group", { name: "Expiry date" }));
    for (const [name, value] of [["Day", String(date.getDate()).padStart(2, "0")],
      ["Month", String(date.getMonth() + 1).padStart(2, "0")], ["Year", String(date.getFullYear())]]) {
      await userEvent.click(picker.getByRole("spinbutton", { name }));
      await userEvent.keyboard(value);
    }
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByText("Updated private note")).toBeVisible();
    const edit = calls.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(edit?.[0]).toBe("/api/households/first/share-links?id=parenting-link");
    expect(JSON.parse(String(edit?.[1]?.body))).toEqual({
      expiresAt: afterLocalShareDay(localShareDate(date.toISOString())), note: "Updated private note",
    });
    await userEvent.click(canvas.getByRole("button", { name: deleteButton }));
    await userEvent.click(within(await page.findByRole("dialog", { name: "Delete shared link?" })).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    expect(calls.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: deleteButton }));
    await userEvent.click(within(await page.findByRole("dialog", { name: "Delete shared link?" })).getByRole("button", { name: "Delete permanently" }));
    await expect(await canvas.findByText("No shared links yet.")).toBeVisible();
    expect(calls.mock.calls.find(([, init]) => init?.method === "DELETE")?.[0]).toBe("/api/households/first/share-links?id=parenting-link");
  },
};

export const ExpiredNoteEdit: Story = {
  args: { expired: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Expired")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: editButton }));
    const dialog = within(await page.findByRole("dialog", { name: "Edit shared link" }));
    await waitFor(() => expect(dialog.getByText(/This link is expired/)).toBeVisible());
    await userEvent.type(dialog.getByRole("textbox", { name: "Private note (optional)" }), " archived");
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(String(calls.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body))).toEqual({
      expiresAt: "2025-01-04T09:13:00Z", note: "For grandparents archived",
    });
    await expect(canvas.getByText("Expired")).toBeVisible();
  },
};

export const RequestErrorsAndRetry: Story = {
  args: { errors: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Could not load shared links");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await userEvent.click(await canvas.findByRole("button", { name: editButton }));
    const dialog = within(await page.findByRole("dialog", { name: "Edit shared link" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "Private note (optional)" }), " retry");
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("Could not save shared links");
    await expect(dialog.getByRole("textbox", { name: "Private note (optional)" })).toHaveValue("For grandparents retry");
    await userEvent.click(dialog.getByRole("button", { name: "Save shared link" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: deleteButton }));
    const confirm = within(await page.findByRole("dialog", { name: "Delete shared link?" }));
    await userEvent.click(confirm.getByRole("button", { name: "Delete permanently" }));
    await expect(await confirm.findByRole("alert")).toHaveTextContent("Could not delete shared links");
    await userEvent.click(confirm.getByRole("button", { name: "Delete permanently" }));
    await expect(await canvas.findByText("No shared links yet.")).toBeVisible();
  },
};

const switchDuringRequest = (method: "GET" | "PATCH" | "DELETE"): Story => ({
  args: { delayed: method, navigation: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("tab", { name: "Shared links" }));
    if (method !== "GET") {
      await userEvent.click(await canvas.findByRole("button", { name: method === "PATCH" ? editButton : deleteButton }));
      const dialog = within(await page.findByRole("dialog", { name: method === "PATCH" ? "Edit shared link" : "Delete shared link?" }));
      await userEvent.click(dialog.getByRole("button", { name: method === "PATCH" ? "Save shared link" : "Delete permanently" }));
      await expect(dialog.getByRole("button", { name: method === "PATCH" ? "Saving…" : "Deleting…" })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    } else {
      await expect(await canvas.findByRole("status")).toHaveTextContent("Loading shared links");
      await expect(canvas.getByRole("button", { name: "Refresh" })).toBeDisabled();
    }
    await waitFor(() => expect(calls.mock.calls.some(([, init]) => (init?.method ?? "GET") === method)).toBe(true));
    const signal = calls.mock.calls.find(([, init]) => (init?.method ?? "GET") === method)?.[1]?.signal;
    await fireEvent.click(canvas.getByText("Switch household"));
    await expect(await canvas.findByText("No shared links yet.")).toBeVisible();
    expect(signal?.aborted).toBe(true);
    await fireEvent.click(canvas.getByText("Resolve previous request"));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(canvas.queryByText("For grandparents")).toBeNull();
    await expect(canvas.getByText("No shared links yet.")).toBeVisible();
    expect(calls.mock.calls[calls.mock.calls.length - 1]?.[0]).toBe("/api/households/second/share-links");
  },
});
export const HouseholdSwitchDuringLoad = switchDuringRequest("GET");
export const HouseholdSwitchDuringEdit = switchDuringRequest("PATCH");
export const HouseholdSwitchDuringDelete = switchDuringRequest("DELETE");
