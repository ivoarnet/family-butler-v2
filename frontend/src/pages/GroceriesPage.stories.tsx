import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { ModuleNavigation } from "../features/app/components/ModuleNavigation";
import type { GroceryData, GroceryItem } from "../features/groceries/types";
import { GroceriesPage } from "./GroceriesPage";
import { GrocerySettingsPage } from "./GrocerySettingsPage";

const initialData: GroceryData = {
  bringConfigured: true,
  lists: [
    { id: "weekly", name: "Weekly shop", remoteId: "bring-weekly", syncStatus: "pending", lastSyncedAt: "2026-10-18T10:30:00Z",
      items: [
        { id: "milk", name: "Oat milk", specification: "2 cartons", checked: false },
        { id: "tomatoes", name: "Cherry tomatoes", specification: "500 g", checked: false },
        { id: "bread", name: "Sourdough bread", specification: "1 loaf", checked: true },
      ] },
    { id: "weekend", name: "Weekend cooking", remoteId: null, syncStatus: "local", lastSyncedAt: null,
      items: [{ id: "pasta", name: "Pasta", specification: "For Saturday dinner", checked: false }] },
  ],
};

type MockOptions = {
  configured?: boolean; failRead?: boolean; failMutation?: boolean; delayed?: boolean;
  failBring?: boolean; failLink?: boolean; delayedMutation?: boolean; failSync?: boolean;
};
function installMock(options: MockOptions = {}) {
  const original = window.fetch;
  const data = structuredClone(initialData);
  data.bringConfigured = options.configured ?? true;
  let failRead = options.failRead;
  let failMutation = options.failMutation;
  let failBring = options.failBring;
  let failLink = options.failLink;
  let failSync = options.failSync;
  let sequence = 0;
  const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes("/groceries")) return original(input, init);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(["Bearer", "storybook-grocery-session"].join(" "));
    expect(headers.get("x-supabase-auth-token")).toBe("storybook-grocery-session");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.endsWith("/connection")) return response({ configured: data.bringConfigured, source: data.bringConfigured ? "stored" : null, canConfigure: true });
    if (url.pathname.endsWith("/groceries")) {
      if (failRead) {
        failRead = false;
        return response({ error: "Grocery service temporarily unavailable" }, 503);
      }
      if (options.delayed && url.pathname.includes("/demo/")) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (url.pathname.includes("/other/")) {
        return response({ bringConfigured: false, lists: [{ id: "other-list", name: "Other household list", remoteId: null, syncStatus: "local", lastSyncedAt: null, items: [] }] });
      }
      return response(data);
    }
    if (url.pathname.endsWith("/bring-lists")) {
      if (failBring) {
        failBring = false;
        return response({ error: "Bring is temporarily unreachable" }, 503);
      }
      return response({ lists: [{ id: "bring-weekly", name: "Bring weekly" }, { id: "bring-party", name: "Dinner party" }] });
    }
    if (failMutation) {
      failMutation = false;
      return response({ error: "Could not save grocery changes" }, 503);
    }
    if (options.delayedMutation) await new Promise((resolve) => setTimeout(resolve, 700));
    if (failLink && method === "PUT" && body.remoteId) {
      failLink = false;
      return response({ error: "Bring link failed. Please retry." }, 503);
    }
    if (url.pathname.endsWith("/lists")) {
      if (method === "POST") {
        const list = { id: `new-${++sequence}`, name: body.name, remoteId: null, syncStatus: "local", lastSyncedAt: null, items: [] };
        data.lists.push(list);
        return response({ list });
      }
      const list = data.lists.find(({ id }) => id === body.id)!;
      Object.assign(list, body);
      list.syncStatus = list.remoteId ? "pending" : "local";
    }
    if (url.pathname.endsWith("/items")) {
      const list = data.lists.find(({ id }) => id === body.listId)!;
      if (method === "POST") list.items.push({ id: `item-${++sequence}`, name: body.name, specification: body.specification, checked: false });
      if (method === "PUT") Object.assign(list.items.find(({ id }) => id === body.id)!, body as GroceryItem);
      if (method === "DELETE") list.items = list.items.filter(({ id }) => id !== body.id);
      list.syncStatus = list.remoteId ? "pending" : "local";
    }
    if (url.pathname.endsWith("/sync")) {
      const list = data.lists.find(({ id }) => id === body.listId)!;
      if (failSync) {
        failSync = false;
        list.syncStatus = "unavailable";
        return response({ error: "Bring is unavailable; your list remains linked" }, 503);
      }
      list.syncStatus = "synced";
      list.lastSyncedAt = "2026-10-18T11:00:00Z";
      if (!list.items.length) list.items = [{ id: "remote-item", name: "Fresh basil", specification: "1 bunch", checked: false }];
    }
    return response({ ok: true });
  };
  return () => { window.fetch = original; };
}

interface GroceryStoryProps {
  allowSwitch?: boolean;
  onNavigate: (path: string) => void;
  onOpenAccountSection: (section: "profile" | "households") => void;
  onSignOut: () => Promise<void>;
}

function GroceryStory({ allowSwitch = false, onNavigate, onOpenAccountSection, onSignOut }: GroceryStoryProps) {
  const [householdId, setHouseholdId] = useState("demo");
  const [settings, setSettings] = useState(false);
  return <div className="app-shell">
    {allowSwitch && <button type="button" onClick={() => setHouseholdId("other")}>Switch household</button>}
    {settings ? <GrocerySettingsPage householdId={householdId} householdName="The Riverstone household"
      accessToken="storybook-grocery-session" onBack={() => setSettings(false)} />
      : <GroceriesPage householdId={householdId} householdName={householdId === "demo" ? "The Riverstone household" : "Other household"}
        accessToken="storybook-grocery-session" onOpenSettings={() => { onNavigate("/groceries/settings"); setSettings(true); }}
        currentUserLabel="Alex Riverstone" currentUserEmail="alex@example.com" currentUserInitials="AR" currentUserAvatarUrl={null}
        onOpenAccountSection={onOpenAccountSection} onSignOut={onSignOut}
        moduleNavigation={<ModuleNavigation activeId="shop-cook" onNavigate={(destination) => onNavigate(destination.path!)} />} />}
  </div>;
}

const meta: Meta<typeof GroceryStory> = {
  title: "Shop & Cook/Groceries",
  component: GroceryStory,
  parameters: { layout: "fullscreen" },
  args: { onNavigate: fn(), onOpenAccountSection: fn(), onSignOut: fn(async () => undefined) },
  beforeEach: ({ parameters }) => installMock(parameters.groceryMock as MockOptions | undefined),
};
export default meta;
type Story = StoryObj<typeof GroceryStory>;

export const GroceryLists: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("heading", { name: "Weekly shop" })).toBeVisible();
    await expect(canvas.getByText("Sync pending")).toBeVisible();
    await expect(canvas.getByRole("checkbox", { name: "Check Sourdough bread" })).toBeChecked();
  },
};

export const HeaderNavigation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const header = within(canvas.getByRole("banner"));
    await expect(header.getByRole("heading", { name: "Shop & Cook" })).toBeVisible();
    await expect(header.queryByRole("button", { name: /back|home|calendar/i })).toBeNull();
    await expect(header.getAllByRole("button")).toHaveLength(3);
    await expect(header.getByRole("button", { name: "Open settings" }).textContent).toBe("");
    await expect(canvas.queryByRole("button", { name: "Settings" })).toBeNull();
    await userEvent.click(header.getByRole("button", { name: "Open module menu" }));
    const menu = within(await page.findByRole("dialog", { name: "Modules" }));
    await expect(menu.getByRole("button", { name: "Shop & Cook" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(menu.getByRole("button", { name: "Calendar" }));
    await expect(args.onNavigate).toHaveBeenCalledTimes(1);
    await expect(args.onNavigate).toHaveBeenCalledWith("/");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Modules" })).toBeNull());
  },
};

export const AccountMenuActions: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const avatar = canvas.getByRole("button", { name: "Alex Riverstone · Open account menu" });
    await expect(avatar).toHaveTextContent("AR");
    await expect(avatar).toHaveAttribute("aria-haspopup", "menu");
    for (const [label, section] of [["My profile", "profile"], ["My households", "households"]] as const) {
      await userEvent.click(avatar);
      await expect(avatar).toHaveAttribute("aria-expanded", "true");
      const menu = within(canvas.getByRole("menu", { name: "Account menu" }));
      await expect(menu.getByText("Alex Riverstone")).toBeVisible();
      await expect(menu.getByText("alex@example.com")).toBeVisible();
      await expect(menu.getByText("AR")).toBeVisible();
      await userEvent.click(menu.getByRole("button", { name: label }));
      await expect(args.onOpenAccountSection).toHaveBeenLastCalledWith(section);
      await expect(canvas.queryByRole("menu")).toBeNull();
      await expect(avatar).toHaveAttribute("aria-expanded", "false");
    }
    await expect(args.onOpenAccountSection).toHaveBeenCalledTimes(2);
    await userEvent.click(avatar);
    await userEvent.click(canvas.getByRole("button", { name: "Logout" }));
    await expect(args.onSignOut).toHaveBeenCalledTimes(1);
    await expect(args.onSignOut).toHaveBeenCalledWith();
    await expect(canvas.queryByRole("menu")).toBeNull();
    await expect(avatar).toHaveAttribute("aria-expanded", "false");
  },
};

export const AccountMenuDismissal: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const avatar = canvas.getByRole("button", { name: "Alex Riverstone · Open account menu" });
    await userEvent.click(avatar);
    await expect(canvas.getByRole("menu", { name: "Account menu" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("menu")).toBeNull();
    await expect(avatar).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(avatar);
    await expect(canvas.getByRole("menu", { name: "Account menu" })).toBeVisible();
    await userEvent.click(canvas.getByRole("heading", { name: "Groceries, together" }));
    await expect(canvas.queryByRole("menu")).toBeNull();
    await expect(avatar).toHaveAttribute("aria-expanded", "false");
    await expect(args.onOpenAccountSection).not.toHaveBeenCalled();
    await expect(args.onSignOut).not.toHaveBeenCalled();
  },
};

export const OpenConnectionSettings: Story = {
  parameters: { groceryMock: { configured: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    for (const name of ["Go back", "Go to groceries"]) {
      await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Open settings" }));
      await expect(args.onNavigate).toHaveBeenCalledWith("/groceries/settings");
      await expect(await canvas.findByRole("heading", { name: "Bring connection" })).toBeVisible();
      await expect(canvas.getByLabelText(/Bring email/)).toHaveValue("");
      await expect(canvas.getByLabelText(/Bring password/)).toHaveValue("");
      await expect(within(canvas.getByRole("main")).queryByRole("button", { name: /back|groceries/i })).toBeNull();
      await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name }));
      await expect(await canvas.findByRole("heading", { name: "Weekly shop" })).toBeVisible();
    }
    await expect(args.onNavigate).toHaveBeenCalledTimes(2);
  },
};

export const LocalListAndItems: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "New list" }));
    let dialog = within(await page.findByRole("dialog", { name: "New grocery list" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "List name" }), { target: { value: "School snacks" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(await canvas.findByRole("button", { name: /School snacks/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Add item" }));
    dialog = within(await page.findByRole("dialog", { name: "Add grocery item" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "Item name" }), { target: { value: "Apples" } });
    await fireEvent.change(dialog.getByRole("textbox", { name: "Quantity or details" }), { target: { value: "6 green" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("6 green")).toBeVisible();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Check Apples" }));
    await waitFor(() => expect(canvas.getByRole("checkbox", { name: "Check Apples" })).toBeChecked());
    await userEvent.click(canvas.getByRole("checkbox", { name: "Check Apples" }));
    await waitFor(() => expect(canvas.getByRole("checkbox", { name: "Check Apples" })).not.toBeChecked());
    await userEvent.click(canvas.getByRole("button", { name: "Edit item Apples" }));
    dialog = within(await page.findByRole("dialog", { name: "Edit grocery item" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "Item name" }), { target: { value: "Pears" } });
    await fireEvent.change(dialog.getByRole("textbox", { name: "Quantity or details" }), { target: { value: "4 ripe" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("4 ripe")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Rename list School snacks" }));
    dialog = within(await page.findByRole("dialog", { name: "Rename list" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "List name" }), { target: { value: "Lunch snacks" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByRole("heading", { name: "Lunch snacks" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Remove item Pears" }));
    await waitFor(() => expect(canvas.queryByText("Pears")).toBeNull());
  },
};

export const BringLinkImportAndSync: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "Sync now" }));
    await expect(await canvas.findByText("Synced with Bring")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect Bring" }));
    await expect(await canvas.findByText("Local list")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Link Bring list" }));
    let dialog = within(await page.findByRole("dialog", { name: "Link Bring list" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Bring weekly" }));
    await userEvent.click(dialog.getByRole("button", { name: "Link list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("Synced with Bring")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Dinner party" }));
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByRole("heading", { name: "Dinner party" })).toBeVisible();
    await expect(await canvas.findByText("Fresh basil")).toBeVisible();
  },
};

export const UnavailableAndRetry: Story = {
  parameters: { groceryMock: { configured: false, failRead: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Grocery service temporarily unavailable")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(canvas.getByText("Bring unavailable")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Import from Bring" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Sync now" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Add item" })).not.toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Disconnect Bring" })).not.toBeDisabled();
  },
};

export const FailedSaveAndBringRetry: Story = {
  parameters: { groceryMock: { failMutation: true, failBring: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "Add item" }));
    let dialog = within(await page.findByRole("dialog", { name: "Add grocery item" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "Item name" }), { target: { value: "Bananas" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog.getByText("Could not save grocery changes")).toBeVisible());
    await expect(dialog.getByRole("textbox", { name: "Item name" })).toHaveValue("Bananas");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("Bananas")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await waitFor(() => expect(dialog.getByText("Bring is temporarily unreachable")).toBeVisible());
    await userEvent.click(dialog.getByRole("button", { name: "Retry" }));
    await expect(await dialog.findByRole("combobox", { name: "Bring list" })).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const HouseholdSwitchIgnoresStaleRead: Story = {
  args: { allowSwitch: true },
  parameters: { groceryMock: { delayed: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await expect(await canvas.findByRole("heading", { name: "Other household list" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 850));
    await expect(canvas.queryByText("Weekly shop")).toBeNull();
    await expect(canvas.getByRole("heading", { name: "Other household list" })).toBeVisible();
  },
};

export const ImportRetryKeepsCreatedList: Story = {
  parameters: { groceryMock: { failLink: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    const dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Dinner party" }));
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(dialog.getByText("Bring link failed. Please retry.")).toBeVisible());
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByRole("heading", { name: "Dinner party" })).toBeVisible();
    await expect(canvas.getAllByRole("button", { name: /Dinner party/ })).toHaveLength(2);
    await expect(await canvas.findByText("Synced with Bring")).toBeVisible();
  },
};

export const HouseholdSwitchIgnoresStaleMutation: Story = {
  args: { allowSwitch: true },
  parameters: { groceryMock: { delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("checkbox", { name: "Check Oat milk" }));
    await expect(await canvas.findByText("Saving grocery changes…")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await expect(await canvas.findByRole("heading", { name: "Other household list" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 850));
    await expect(canvas.queryByText("Weekly shop")).toBeNull();
    await expect(canvas.queryByText("Saving grocery changes…")).toBeNull();
    await expect(canvas.getByRole("button", { name: "Add item" })).not.toBeDisabled();
  },
};

export const ImportUnavailableKeepsLocalLink: Story = {
  parameters: { groceryMock: { failSync: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    const dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Dinner party" }));
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByRole("heading", { name: "Dinner party" })).toBeVisible();
    await expect(await canvas.findByText("Bring unavailable")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Disconnect Bring" })).not.toBeDisabled();
    await expect(canvas.getByText("Bring is unavailable; your list remains linked")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Sync now" }));
    await expect(await canvas.findByText("Fresh basil")).toBeVisible();
  },
};
