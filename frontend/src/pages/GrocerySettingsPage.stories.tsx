import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { ModuleNavigation } from "../features/app/components/ModuleNavigation";
import type { BringConnection, GroceryData } from "../features/groceries/types";
import { GrocerySettingsPage } from "./GrocerySettingsPage";

type Options = { configured?: boolean; missingKey?: boolean; failRead?: boolean; failSave?: boolean; failTest?: boolean; delayed?: boolean; delayedSave?: boolean; forbidden?: boolean;
  failLists?: boolean; failListSave?: boolean; failRefresh?: boolean; emptyLists?: boolean; statusMatrix?: boolean; delayedListSave?: boolean; delayedLists?: boolean; dark?: boolean };
const sampleMail = "owner@example.invalid";
const samplePassword = "storybook-example-only";
const listWrites = fn();
const listReads = fn();
const abortedRequests = fn();

function installMock(options: Options = {}) {
  const original = window.fetch;
  const originalSetItem = Storage.prototype.setItem;
  const previousTheme = document.documentElement.dataset.theme;
  if (options.dark) document.documentElement.dataset.theme = "dark";
  listWrites.mockClear();
  listReads.mockClear();
  abortedRequests.mockClear();
  const data: GroceryData = { bringConfigured: options.configured ?? true, lists: options.emptyLists ? [] : [
    { id: "weekly", name: "Weekly shop", remoteId: "bring-weekly", syncStatus: "synced", lastSyncedAt: "2026-10-18T10:30:00Z",
      items: [{ id: "milk", name: "Milk", specification: "2 cartons", checked: false }] },
    { id: "weekend", name: "Weekend cooking", remoteId: null, syncStatus: "local", lastSyncedAt: null, items: [] },
    ...(options.statusMatrix ? ["linked", "pending", "unavailable", "failed", "error"].map((syncStatus) => ({
      id: syncStatus, name: `${syncStatus} list`, remoteId: `bring-${syncStatus}`, syncStatus, lastSyncedAt: null, items: [],
    })) : []),
  ] };
  const originalItems = JSON.stringify(data.lists.map(({ items }) => items));
  const originalListIds = new Set(data.lists.map(({ id }) => id));
  let failLists = options.failLists;
  let failListSave = options.failListSave;
  let failRefresh = false;
  let state: BringConnection = {
    configured: options.configured ?? true,
    source: options.configured === false ? null : options.missingKey ? "environment" : "stored",
    canConfigure: !options.missingKey,
  };
  let failRead = options.failRead;
  Storage.prototype.setItem = function (key, value) {
    expect(`${key}:${value}`).not.toContain(sampleMail);
    expect(`${key}:${value}`).not.toContain(samplePassword);
    originalSetItem.call(this, key, value);
  };
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes("/groceries")) return original(input, init);
    expect(url.search).toBe("");
    expect(url.href).not.toContain(sampleMail);
    expect(url.href).not.toContain(samplePassword);
    const token = new Headers(init?.headers).get("x-supabase-auth-token");
    expect(["storybook-connection-session", "storybook-refreshed-session"]).toContain(token);
    expect(new Headers(init?.headers).get("Authorization")).toBe(["Bearer", token].join(" "));
    const respond = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
    const method = init?.method ?? "GET";
    expect(["/connection", "/connection-test", "/groceries", "/lists"].some((path) => url.pathname.endsWith(path))).toBe(true);
    const otherSession = url.pathname.includes("/other/") || token === "storybook-refreshed-session";
    if (url.pathname.endsWith("/groceries")) {
      listReads({ household: url.pathname, token });
      const snapshot = structuredClone(data);
      if (options.delayed || options.delayedLists) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (init?.signal?.aborted) abortedRequests("read");
      }
      if (otherSession) return respond({ bringConfigured: false, lists: [{ id: "other-list", name: "Other session list", remoteId: null, syncStatus: "local", lastSyncedAt: null, items: [] }] });
      if (failLists || failRefresh) {
        failLists = false;
        failRefresh = false;
        return respond({ error: "Unavailable" }, 503);
      }
      return respond(snapshot);
    }
    if (url.pathname.endsWith("/lists")) {
      const body = JSON.parse(String(init?.body));
      expect(Object.keys(body).sort()).toEqual(method === "POST" ? ["name"] : ["id", "name"]);
      expect(["POST", "PUT"]).toContain(method);
      listWrites({ method, body });
      await new Promise((resolve) => setTimeout(resolve, options.delayedListSave ? 800 : 200));
      if (init?.signal?.aborted) { abortedRequests("write"); return respond({ ok: true }); }
      if (failListSave) { failListSave = false; return respond({ error: "Unavailable" }, 503); }
      if (method === "POST") data.lists.push({ id: `new-${data.lists.length}`, name: body.name, remoteId: null, syncStatus: "local", lastSyncedAt: null, items: [] });
      else {
        const list = data.lists.find(({ id }) => id === body.id)!;
        list.name = body.name;
        expect(JSON.stringify(data.lists.filter(({ id }) => originalListIds.has(id)).map(({ items }) => items))).toBe(originalItems);
      }
      if (options.failRefresh) failRefresh = true;
      return respond({ ok: true });
    }
    if (options.delayed && url.pathname.includes("/demo/")) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(init?.signal?.aborted).toBe(true);
    }
    if (otherSession) return respond({ configured: false, source: null, canConfigure: true });
    if (failRead && method === "GET") {
      failRead = false;
      return respond({ error: "Unavailable" }, 503);
    }
    if (options.forbidden && method !== "GET") return respond({ error: "Forbidden" }, 403);
    if (url.pathname.endsWith("/connection-test")) {
      expect(method).toBe("POST");
      expect(init?.body).toBeUndefined();
      return options.failTest ? respond({ error: `Provider error ${sampleMail} ${samplePassword}` }, 503) : respond({ connected: true });
    }
    if (method === "PUT") {
      expect(JSON.parse(String(init?.body))).toEqual({ mail: sampleMail, password: samplePassword });
      await new Promise((resolve) => setTimeout(resolve, options.delayedSave ? 900 : 200));
      if (options.delayedSave) expect(init?.signal?.aborted).toBe(true);
      if (options.failSave) return respond({ error: `Provider error ${sampleMail} ${samplePassword}` }, 503);
      state = { configured: true, source: "stored", canConfigure: true };
    }
    if (method === "DELETE") {
      expect(init?.body).toBeUndefined();
      state = { configured: false, source: null, canConfigure: true };
    }
    if (method === "PUT" || method === "DELETE") {
      data.bringConfigured = state.configured;
      data.lists.forEach((list) => { list.remoteId = null; list.syncStatus = "local"; list.lastSyncedAt = null; });
    }
    // Include unexpected legacy secret fields to prove the UI never reads them back.
    return respond({ ...state, mail: "legacy@example.invalid", password: "never-read-this" });
  };
  return () => {
    window.fetch = original; Storage.prototype.setItem = originalSetItem;
    if (previousTheme === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = previousTheme;
  };
}

function SettingsStory({ allowSwitch = false, allowNavigation = false, allowTokenSwitch = false }: { allowSwitch?: boolean; allowNavigation?: boolean; allowTokenSwitch?: boolean }) {
  const [householdId, setHouseholdId] = useState("demo");
  const [accessToken, setAccessToken] = useState("storybook-connection-session");
  const [settings, setSettings] = useState(true);
  return <div className="app-shell">
    {allowSwitch && <button onClick={() => setHouseholdId("other")}>Switch household</button>}
    {allowTokenSwitch && <button onClick={() => setAccessToken("storybook-refreshed-session")}>Refresh token</button>}
    {settings ? <GrocerySettingsPage householdId={householdId} householdName={householdId === "demo" ? "The Riverstone household" : "Other household"}
      accessToken={accessToken} onBack={() => { if (allowNavigation) setSettings(false); }}
      moduleNavigation={<ModuleNavigation activeId="shop-cook" onNavigate={() => undefined} />} />
      : <button onClick={() => setSettings(true)}>Reopen settings</button>}
  </div>;
}

const meta: Meta<typeof SettingsStory> = {
  title: "Shop & Cook/Connection settings",
  component: SettingsStory,
  parameters: { layout: "fullscreen" },
  beforeEach: ({ parameters }) => installMock(parameters.connectionMock as Options | undefined),
};
export default meta;
type Story = StoryObj<typeof SettingsStory>;

async function enterAccount(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await canvas.findByText(/Source:/);
  await fireEvent.change(canvas.getByLabelText(/Bring email/), { target: { value: sampleMail } });
  await fireEvent.change(canvas.getByLabelText(/Bring password/), { target: { value: samplePassword } });
}

async function expectBlank(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await expect(canvas.getByLabelText(/Bring email/)).toHaveValue("");
  await expect(canvas.getByLabelText(/Bring password/)).toHaveValue("");
  await expect(canvasElement).not.toHaveTextContent(sampleMail);
  await expect(canvasElement).not.toHaveTextContent(samplePassword);
  await expect(canvasElement).not.toHaveTextContent("legacy@example.invalid");
  await expect(canvasElement).not.toHaveTextContent("never-read-this");
}

export const ConfiguredAccount: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Account configured")).toBeVisible();
    const header = within(canvas.getByRole("banner"));
    for (const name of ["Go back", "Go to groceries"]) {
      await expect(header.getByRole("button", { name })).toBeVisible();
      await expect(header.getByRole("button", { name })).toHaveAttribute("title", name);
    }
    await expect(within(canvas.getByRole("main")).queryByRole("button", { name: /back|groceries/i })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Back to groceries" })).toBeNull();
    await expectBlank(canvasElement);
  },
};

export const UnconfiguredSaveAndTest: Story = {
  parameters: { connectionMock: { configured: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No account configured")).toBeVisible();
    await expectBlank(canvasElement);
    await expect(canvas.getByRole("button", { name: "Test current connection" })).toBeDisabled();
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Test and save account" }));
    await expectBlank(canvasElement);
    await expect(await canvas.findByText(/Bring connection tested and saved/)).toBeVisible();
    await expect(canvas.getByText("Account configured")).toBeVisible();
    await waitFor(() => expect(canvas.getAllByText("Local list")).toHaveLength(2));
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
    await expect(listReads).toHaveBeenCalledTimes(2);
    await userEvent.click(canvas.getByRole("button", { name: "Test current connection" }));
    await expect(await canvas.findByText("Current Bring connection works.")).toBeVisible();
    await expectBlank(canvasElement);
  },
};

export const DisconnectPreservesLocalContent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Account configured");
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect account" }));
    let dialog = within(await page.findByRole("dialog", { name: "Disconnect Bring account?" }));
    await waitFor(() => expect(dialog.getByText(/Your local lists and items are preserved/)).toBeVisible());
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(canvas.getByText("Account configured")).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect account" }));
    dialog = within(await page.findByRole("dialog", { name: "Disconnect Bring account?" }));
    await userEvent.click(dialog.getByRole("button", { name: "Disconnect Bring" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("No account configured")).toBeVisible();
    await expect(canvas.getByText("Bring disconnected. All local lists and items have been kept.")).toBeVisible();
    await waitFor(() => expect(canvas.getAllByText("Local list")).toHaveLength(2));
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
    await expect(listReads).toHaveBeenCalledTimes(2);
  },
};

export const MissingServerKey: Story = {
  parameters: { connectionMock: { missingKey: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Source: Managed by server configuration/)).toBeVisible();
    await expect(canvas.getByText(/server encryption key is missing/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Test and save account" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Disconnect account" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Test current connection" }));
    await expect(await canvas.findByText("Current Bring connection works.")).toBeVisible();
  },
};

export const ReadErrorAndRetry: Story = {
  parameters: { connectionMock: { failRead: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Could not load Bring connection settings. Please retry.");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(await canvas.findByText("Account configured")).toBeVisible();
    await expectBlank(canvasElement);
  },
};

export const SecretSafeSaveError: Story = {
  parameters: { connectionMock: { failSave: true, failTest: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Test and save account" }));
    await expectBlank(canvasElement);
    await expect(await canvas.findByText("Bring connection request failed. Check availability and try again.")).toBeVisible();
    await expectBlank(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Test current connection" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Test current connection" })).toBeEnabled());
    await expectBlank(canvasElement);
  },
};

export const OwnerAuthorization: Story = {
  parameters: { connectionMock: { forbidden: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Test and save account" }));
    await expect(await canvas.findByText("Only the household owner can manage the Bring connection.")).toBeVisible();
    await expectBlank(canvasElement);
  },
};

export const HouseholdAbort: Story = {
  args: { allowSwitch: true },
  parameters: { connectionMock: { delayed: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Loading connection settings…");
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await expect(await canvas.findByText("No account configured")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 850));
    await expect(canvas.queryByText("Account configured")).toBeNull();
    await expect(canvas.getByText("Other session list")).toBeVisible();
    await expect(canvas.queryByText("Weekly shop")).toBeNull();
    await expect(abortedRequests).toHaveBeenCalledWith("read");
    await expectBlank(canvasElement);
  },
};

export const CancelAndNavigationClearSecrets: Story = {
  args: { allowSwitch: true, allowNavigation: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Cancel entry" }));
    await expectBlank(canvasElement);
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await canvas.findByText("No account configured");
    await expectBlank(canvasElement);
    for (const name of ["Go back", "Go to groceries"]) {
      await enterAccount(canvasElement);
      await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name }));
      await userEvent.click(canvas.getByRole("button", { name: "Reopen settings" }));
      await canvas.findByText("No account configured");
      await expectBlank(canvasElement);
    }
  },
};

export const InFlightSaveNavigationAbort: Story = {
  args: { allowNavigation: true },
  parameters: { connectionMock: { delayedSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["Go back", "Go to groceries"]) {
      await enterAccount(canvasElement);
      const password = canvas.getByLabelText(/Bring password/);
      await userEvent.click(canvas.getByRole("button", { name: "Test and save account" }));
      await expect(canvas.getByText("Working on Bring connection…")).toBeVisible();
      await expectBlank(canvasElement);
      const navigation = within(canvas.getByRole("banner")).getByRole("button", { name });
      await expect(navigation).toBeEnabled();
      await userEvent.click(navigation);
      await expect(password).toHaveValue("");
      await expect(canvas.queryByRole("main")).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await expect(canvas.queryByText(/Bring connection tested and saved/)).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Reopen settings" }));
      await canvas.findByText("Account configured");
      await expectBlank(canvasElement);
    }
  },
};

export const InFlightSaveHouseholdAbort: Story = {
  args: { allowSwitch: true },
  parameters: { connectionMock: { delayedSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Test and save account" }));
    await expectBlank(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await canvas.findByText("No account configured");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await expect(canvas.queryByText(/Bring connection tested and saved/)).toBeNull();
    await expect(canvas.getByText("No account configured")).toBeVisible();
    await expectBlank(canvasElement);
  },
};

export const KeyboardSaveAndEscape: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await enterAccount(canvasElement);
    canvas.getByLabelText(/Bring password/).focus();
    await userEvent.keyboard("{Enter}");
    await expectBlank(canvasElement);
    await canvas.findByText(/Bring connection tested and saved/);
    canvas.getByRole("button", { name: "Disconnect account" }).focus();
    await userEvent.keyboard("{Enter}");
    await page.findByRole("dialog", { name: "Disconnect Bring account?" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByText("Account configured")).toBeVisible();
  },
};

async function editList(canvasElement: HTMLElement, name: string, rename?: string) {
  const canvas = within(canvasElement);
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: rename ? `Rename ${rename}` : "Create list" }));
  const dialog = within(await page.findByRole("dialog", { name: rename ? "Rename grocery list" : "Create grocery list" }));
  await fireEvent.change(dialog.getByLabelText(/List name/), { target: { value: name } });
  return dialog;
}

export const ListOverviewStatuses: Story = {
  parameters: { connectionMock: { statusMatrix: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Weekly shop");
    const table = within(canvas.getByRole("table", { name: "Grocery lists" }));
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Name", "Bring sync status", "Last synced", "Actions"]);
    await expect(table.getAllByRole("row")).toHaveLength(8);
    const weekly = within(table.getByRole("row", { name: /Weekly shop/ }));
    await expect(weekly.getByText("Synced with Bring")).toBeVisible();
    await expect(weekly.getByRole("button", { name: "Rename Weekly shop" })).toHaveAttribute("title", "Rename list");
    await expect(weekly.getAllByRole("cell")[2].querySelector("time")).toHaveAttribute("datetime", "2026-10-18T10:30:00Z");
    const local = within(table.getByRole("row", { name: /Weekend cooking/ }));
    await expect(local.getAllByRole("cell")[2]).toHaveTextContent("—");
    for (const row of table.getAllByRole("row").slice(1)) {
      await expect(within(row).getByRole("button", { name: /^Rename / })).toBeEnabled();
      await expect(within(row).getAllByRole("cell")).toHaveLength(4);
    }
    for (const label of ["Local list", "Synced with Bring", "Linked to Bring", "Sync pending", "Bring unavailable"]) {
      await expect(canvas.getByText(label)).toBeVisible();
    }
    await expect(canvas.getAllByText("Sync failed")).toHaveLength(2);
    await expect(table.getByRole("columnheader", { name: "Last synced" })).toBeVisible();
  },
};

export const SettingsInformationTooltips: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Weekly shop");
    const information = [
      { name: "Grocery list information", text: /Create and rename household lists here/ },
      { name: "Bring connection information", text: /Connect one Bring account for this household/ },
      { name: "Bring account credential information", text: /Credentials are write-only/ },
    ];
    for (const { name, text } of information) {
      await expect(page.queryByText(text)).toBeNull();
      const button = canvas.getByRole("button", { name });
      button.focus();
      await userEvent.tab({ shift: true });
      await userEvent.tab();
      await expect(button).toHaveFocus();
      await userEvent.hover(button);
      await expect(await page.findByRole("tooltip")).toHaveTextContent(text);
      if (name === "Grocery list information") {
        await expect(page.getByRole("tooltip")).toHaveTextContent("Items stay unchanged.");
        await expect(page.getByRole("tooltip")).toHaveTextContent("Local lists are not linked to Bring. Linked does not mean synced; status reflects the last recorded sync.");
        await expect(page.getByRole("tooltip")).toHaveTextContent("Link, import and sync lists in the workspace.");
      }
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
      await userEvent.unhover(button);
      await userEvent.tab();
    }
    await expect(canvas.getByText(/Saving replaces the household/)).toBeVisible();
    await expect(listWrites).not.toHaveBeenCalled();
  },
};

export const UnconfiguredLinkedLists: Story = {
  parameters: { connectionMock: { configured: false, statusMatrix: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Weekly shop");
    await expect(canvas.getAllByText("Bring unavailable")).toHaveLength(6);
    await expect(canvas.getByText("Local list")).toBeVisible();
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
  },
};

export const CreateAndRenameLists: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Weekly shop");
    await userEvent.click(canvas.getByRole("button", { name: "Create list" }));
    let dialog = within(await page.findByRole("dialog", { name: "Create grocery list" }));
    await expect(dialog.getByRole("button", { name: "Save list" })).toBeDisabled();
    await fireEvent.change(dialog.getByLabelText(/List name/), { target: { value: "   " } });
    await expect(dialog.getByRole("button", { name: "Save list" })).toBeDisabled();
    await expect(dialog.getByLabelText(/List name/)).toHaveAttribute("maxlength", "160");
    await fireEvent.change(dialog.getByLabelText(/List name/), { target: { value: "x".repeat(161) } });
    await expect(dialog.getByRole("button", { name: "Save list" })).toBeDisabled();
    await waitFor(() => expect(dialog.getByText("Use 160 characters or fewer.")).toBeVisible());
    await fireEvent.submit(dialog.getByLabelText(/List name/).closest("form")!);
    await expect(listWrites).not.toHaveBeenCalled();
    await fireEvent.change(dialog.getByLabelText(/List name/), { target: { value: "x".repeat(160) } });
    await expect(dialog.getByRole("button", { name: "Save list" })).toBeEnabled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(listWrites).not.toHaveBeenCalled();
    dialog = await editList(canvasElement, "  Holiday food  ");
    const form = dialog.getByLabelText(/List name/).closest("form")!;
    await fireEvent.submit(form);
    await fireEvent.submit(form);
    await expect(await dialog.findByRole("button", { name: "Saving…" })).toBeDisabled();
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("Holiday food")).toBeVisible();
    await expect(listWrites).toHaveBeenCalledTimes(1);
    await expect(listWrites).toHaveBeenLastCalledWith({ method: "POST", body: { name: "Holiday food" } });
    dialog = await editList(canvasElement, "  Weekly essentials  ", "Weekly shop");
    dialog.getByLabelText(/List name/).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("Weekly essentials")).toBeVisible();
    await expect(canvas.queryByText("Weekly shop")).toBeNull();
    await expect(listWrites).toHaveBeenLastCalledWith({ method: "PUT", body: { id: "weekly", name: "Weekly essentials" } });
    await expect(canvas.getByText("Synced with Bring")).toBeVisible();
  },
};

export const EmptyLists: Story = {
  parameters: { connectionMock: { emptyLists: true, configured: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No grocery lists yet. Create your first list to get started.")).toBeVisible();
    const dialog = await editList(canvasElement, "First grocery list");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await expect(await canvas.findByText("First grocery list")).toBeVisible();
    await expect(canvas.getByText("Local list")).toBeVisible();
  },
};

export const ListReadErrorAndRetry: Story = {
  parameters: { connectionMock: { failLists: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Could not load grocery lists. Please retry.");
    await expect(canvas.getByText("Account configured")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Create list" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Retry lists" }));
    await expect(await canvas.findByText("Weekly shop")).toBeVisible();
  },
};

export const ListSaveErrorKeepsDraft: Story = {
  parameters: { connectionMock: { failListSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await editList(canvasElement, "Dinner party");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await expect(await dialog.findByText("Could not save the grocery list. Your draft is kept. Please retry.")).toBeVisible();
    await expect(dialog.getByLabelText(/List name/)).toHaveValue("Dinner party");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await expect(await canvas.findByText("Dinner party")).toBeVisible();
    await expect(listWrites).toHaveBeenCalledTimes(2);
  },
};

export const RenameErrorKeepsDraft: Story = {
  parameters: { connectionMock: { failListSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Weekly shop");
    const dialog = await editList(canvasElement, "Renamed weekly shop", "Weekly shop");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await dialog.findByText("Could not save the grocery list. Your draft is kept. Please retry.");
    await expect(dialog.getByLabelText(/List name/)).toHaveValue("Renamed weekly shop");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await expect(await canvas.findByText("Renamed weekly shop")).toBeVisible();
    await expect(listWrites).toHaveBeenCalledTimes(2);
  },
};

export const SavedListRefreshErrorDoesNotDuplicate: Story = {
  parameters: { connectionMock: { failRefresh: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await editList(canvasElement, "Saved once");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await canvas.findByText("Could not load grocery lists. Please retry.");
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Retry lists" }));
    await expect(await canvas.findByText("Saved once")).toBeVisible();
    await expect(listWrites).toHaveBeenCalledTimes(1);
  },
};

export const ListsWorkWithoutConnectionSettings: Story = {
  parameters: { connectionMock: { failRead: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Could not load Bring connection settings. Please retry.");
    const dialog = await editList(canvasElement, "Independent local list");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await expect(await canvas.findByText("Independent local list")).toBeVisible();
    await expect(canvas.getByText("Could not load Bring connection settings. Please retry.")).toBeVisible();
  },
};

export const ListsWorkWithoutEncryptionKey: Story = {
  parameters: { connectionMock: { missingKey: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Weekly shop");
    const dialog = await editList(canvasElement, "Local lists still work", "Weekly shop");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await expect(await canvas.findByText("Local lists still work")).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Test and save account" })).toBeDisabled());
  },
};

async function switchDuringListWrite(canvasElement: HTMLElement, action: string) {
  const canvas = within(canvasElement);
  const page = within(canvasElement.ownerDocument.body);
  const dialog = await editList(canvasElement, "Old session draft");
  await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
  // Dialogs intentionally block background controls; simulate an external session update.
  await fireEvent.click(canvas.getByRole("button", { name: action, hidden: true }));
  await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
  await expect(await canvas.findByText("Other session list")).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 900));
  await expect(abortedRequests).toHaveBeenCalledWith("write");
  await expect(canvas.queryByText("Old session draft")).toBeNull();
}

export const ListWriteHouseholdAbort: Story = {
  args: { allowSwitch: true },
  parameters: { connectionMock: { delayedListSave: true } },
  play: async ({ canvasElement }) => switchDuringListWrite(canvasElement, "Switch household"),
};

export const ListWriteTokenAbort: Story = {
  args: { allowTokenSwitch: true },
  parameters: { connectionMock: { delayedListSave: true } },
  play: async ({ canvasElement }) => switchDuringListWrite(canvasElement, "Refresh token"),
};

export const ListReadTokenAbort: Story = {
  args: { allowTokenSwitch: true },
  parameters: { connectionMock: { delayedLists: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Loading grocery lists…");
    await userEvent.click(canvas.getByRole("button", { name: "Refresh token" }));
    await expect(await canvas.findByText("Other session list")).toBeVisible();
    await expect(abortedRequests).toHaveBeenCalledWith("read");
    await expect(canvas.queryByText("Weekly shop")).toBeNull();
  },
};

export const ListWriteUnmountAbort: Story = {
  args: { allowNavigation: true },
  parameters: { connectionMock: { delayedListSave: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await editList(canvasElement, "Abandoned list");
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await fireEvent.click(canvas.getByRole("button", { name: "Go back", hidden: true }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 900));
    await expect(abortedRequests).toHaveBeenCalledWith("write");
    await userEvent.click(canvas.getByRole("button", { name: "Reopen settings" }));
    await canvas.findByText("Weekly shop");
    await expect(canvas.queryByText("Abandoned list")).toBeNull();
  },
};

export const DarkListSettings: Story = {
  parameters: { connectionMock: { dark: true } },
  play: ConfiguredAccount.play,
};

export const AccountSaveIgnoresStaleOverview: Story = {
  parameters: { connectionMock: { delayedLists: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterAccount(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Test and save account" }));
    await canvas.findByText(/Bring connection tested and saved/);
    await expect(canvas.getByText("Loading grocery lists…")).toBeVisible();
    await waitFor(() => expect(canvas.getAllByText("Local list")).toHaveLength(2), { timeout: 2000 });
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
    await expect(listReads).toHaveBeenCalledTimes(2);
  },
};
