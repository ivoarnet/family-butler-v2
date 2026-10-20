import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { ModuleNavigation } from "../features/app/components/ModuleNavigation";
import type { GroceryData, GroceryItem } from "../features/groceries/types";
import { BRING_ICON_ORIGIN, GroceryProductIcon, groceryIconUrl } from "../features/groceries/GroceryProductIcon";
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
  dark?: boolean; canonicalIcons?: boolean; failIcons?: boolean;
};
const addItemRequest = fn();
const updateItemRequest = fn();
const iconRequest = fn();

function installIconMock(fail = false) {
  iconRequest.mockClear();
  // Keep plays fully offline, including browser-native image requests (which bypass fetch).
  if (new URLSearchParams(window.location.search).get("realAssets") === "1") return () => undefined;
  const asset = URL.createObjectURL(new Blob([fail ? "invalid image" :
    '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><path fill="#69758c" d="M10 18h32l-4 25H14zM17 18l9-13 9 13h-5l-4-6-4 6z"/></svg>'],
  { type: "image/svg+xml" }));
  const originalAttribute = Element.prototype.setAttribute;
  const originalSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
  const source = (image: HTMLImageElement, value: string) => {
    if (!value.startsWith(`${BRING_ICON_ORIGIN}/`)) return value;
    iconRequest(value);
    originalAttribute.call(image, "data-bring-src", value);
    return asset;
  };
  Element.prototype.setAttribute = function (name, value) {
    originalAttribute.call(this, name, this instanceof HTMLImageElement && name === "src" ? source(this, value) : value);
  };
  Object.defineProperty(HTMLImageElement.prototype, "src", { ...originalSource,
    set(value: string) { originalSource.set!.call(this, source(this, value)); },
  });
  return () => {
    Element.prototype.setAttribute = originalAttribute;
    Object.defineProperty(HTMLImageElement.prototype, "src", originalSource);
    URL.revokeObjectURL(asset);
  };
}

function installMock(options: MockOptions = {}) {
  addItemRequest.mockClear();
  updateItemRequest.mockClear();
  const original = window.fetch;
  const data = structuredClone(initialData);
  if (options.canonicalIcons) {
    data.lists[0].items.forEach((item, index) => {
      item.name = ["Milk", "Getränke", "Bread"][index];
      item.specification = ["2 cartons", "2 bottles", "1 loaf"][index];
      item.iconId = ["milch", "getraenke", "brot"][index];
    });
  }
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
    const token = headers.get("x-supabase-auth-token");
    expect(["storybook-grocery-session", "storybook-refreshed-session"]).toContain(token);
    expect(headers.get("Authorization")).toBe(["Bearer", token].join(" "));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method === "POST" && url.pathname.endsWith("/items")) addItemRequest(body);
    if (method === "PUT" && url.pathname.endsWith("/items")) updateItemRequest(body);
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
    if (options.delayedMutation) await new Promise((resolve) => setTimeout(resolve, 700));
    if (failMutation) {
      failMutation = false;
      return response({ error: "Could not save grocery changes" }, 503);
    }
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
      if (method === "POST" && !list.items.some((item) => item.name.trim().toLowerCase() === body.name.trim().toLowerCase())) {
        list.items.push({ id: `item-${++sequence}`, name: body.name, specification: body.specification, checked: false });
      }
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
  allowTokenSwitch?: boolean;
  onNavigate: (path: string) => void;
  onOpenAccountSection: (section: "profile" | "households") => void;
  onSignOut: () => Promise<void>;
}

function GroceryStory({ allowSwitch = false, allowTokenSwitch = false, onNavigate, onOpenAccountSection, onSignOut }: GroceryStoryProps) {
  const [householdId, setHouseholdId] = useState("demo");
  const [accessToken, setAccessToken] = useState("storybook-grocery-session");
  const [settings, setSettings] = useState(false);
  return <div className="app-shell">
    {allowSwitch && <button type="button" onClick={() => setHouseholdId("other")}>Switch household</button>}
    {allowTokenSwitch && <button type="button" onClick={() => setAccessToken("storybook-refreshed-session")}>Refresh session</button>}
    {settings ? <GrocerySettingsPage householdId={householdId} householdName="The Riverstone household"
      accessToken="storybook-grocery-session" onBack={() => setSettings(false)} />
      : <GroceriesPage householdId={householdId} householdName={householdId === "demo" ? "The Riverstone household" : "Other household"}
        accessToken={accessToken} onOpenSettings={() => { onNavigate("/groceries/settings"); setSettings(true); }}
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
  beforeEach: ({ parameters }) => {
    const options = parameters.groceryMock as MockOptions | undefined;
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", options?.dark ? "dark" : "light");
    const restore = installMock(options);
    const restoreIcons = installIconMock(options?.failIcons);
    return () => {
      restore();
      restoreIcons();
      if (previousTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previousTheme);
    };
  },
};
export default meta;
type Story = StoryObj<typeof GroceryStory>;

export const GroceryLists: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("heading", { name: "Weekly shop" })).toBeVisible();
    await expect(canvas.getByText("Sync pending")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Check Sourdough bread" })).toHaveAttribute("aria-pressed", "true");
    await expect(within(canvas.getByRole("region", { name: "To buy" })).getByText("Oat milk")).toBeVisible();
    await expect(within(canvas.getByRole("region", { name: "Last used" })).getByText("Sourdough bread")).toBeVisible();
  },
};

export const DarkGroceryLists: Story = {
  parameters: { groceryMock: { dark: true, canonicalIcons: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(within(canvas.getByRole("region", { name: "To buy" })).getByText("Milk")).toBeVisible();
    await expect(within(canvas.getByRole("region", { name: "Last used" })).getByText("Bread")).toBeVisible();
  },
};

export const CardToggleInteractions: Story = {
  parameters: { groceryMock: { canonicalIcons: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(canvas.queryByRole("checkbox")).toBeNull();
    await expect(canvasElement.querySelector('input[type="checkbox"]')).toBeNull();
    const toggle = () => canvas.getByRole("button", { name: "Check Milk" });
    const assertState = async (checked: boolean) => {
      await waitFor(() => expect(toggle()).toHaveAttribute("aria-pressed", String(checked)));
      await expect(within(canvas.getByRole("region", { name: checked ? "Last used" : "To buy" }))
        .getByRole("button", { name: "Check Milk" })).toBeVisible();
    };
    await expect(toggle().tagName).toBe("BUTTON");
    await expect(toggle().querySelector("button")).toBeNull();
    await userEvent.click(canvas.getByText("Milk"));
    await assertState(true);
    await userEvent.click(canvas.getByText("2 cartons"));
    await assertState(false);
    await userEvent.click(toggle().querySelector(".grocery-product-icon")!);
    await assertState(true);
    // Hit-test real card padding, outside the primary content and action buttons.
    const tile = toggle().closest("li")!;
    tile.scrollIntoView({ block: "center" });
    const bounds = tile.getBoundingClientRect();
    const surface = canvasElement.ownerDocument.elementFromPoint(bounds.left + 3, bounds.top + 20)!;
    await expect(surface).toBe(toggle());
    await userEvent.click(surface);
    await assertState(false);
    toggle().focus();
    await expect(toggle()).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await assertState(true);
    toggle().focus();
    await userEvent.keyboard(" ");
    await assertState(false);
    await expect(updateItemRequest).toHaveBeenCalledTimes(6);
  },
};

export const CardActionIsolation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    for (const key of [null, "{Enter}", " "]) {
      const edit = canvas.getByRole("button", { name: "Edit item Oat milk" });
      await expect(edit.closest(".grocery-tile-toggle")).toBeNull();
      if (key) {
        edit.focus();
        await userEvent.keyboard(key);
      } else await userEvent.click(edit);
      const dialog = within(await page.findByRole("dialog", { name: "Edit grocery item" }));
      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
      await expect(canvas.getByRole("button", { name: "Check Oat milk" })).toHaveAttribute("aria-pressed", "false");
      await expect(updateItemRequest).not.toHaveBeenCalled();
    }
    for (const [name, key] of [["Oat milk", null], ["Cherry tomatoes", "{Enter}"], ["Sourdough bread", " "]] as const) {
      const remove = canvas.getByRole("button", { name: `Remove item ${name}` });
      await expect(remove.closest(".grocery-tile-toggle")).toBeNull();
      if (key) {
        remove.focus();
        await userEvent.keyboard(key);
      } else await userEvent.click(remove);
      await waitFor(() => expect(canvas.queryByRole("button", { name: `Check ${name}` })).toBeNull());
      await expect(updateItemRequest).not.toHaveBeenCalled();
    }
  },
};

export const CardToggleFailureAndRapidClicks: Story = {
  parameters: { groceryMock: { failMutation: true, delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const toggle = () => canvas.getByRole("button", { name: "Check Oat milk" });
    for (const attempt of [1, 2]) {
      const button = toggle();
      button.click();
      button.click();
      await waitFor(() => expect(button).toBeDisabled());
      await expect(canvas.getByRole("button", { name: "Check Sourdough bread" })).toBeDisabled();
      await expect(updateItemRequest).toHaveBeenCalledTimes(attempt);
      await expect(button).toHaveAttribute("aria-pressed", "false");
      if (attempt === 1) {
        await expect(await canvas.findByText("Could not save grocery changes")).toBeVisible();
        await waitFor(() => expect(toggle()).not.toBeDisabled());
        await expect(toggle()).toHaveAttribute("aria-pressed", "false");
        await expect(within(canvas.getByRole("region", { name: "To buy" })).getByText("Oat milk")).toBeVisible();
      }
    }
    await waitFor(() => expect(toggle()).toHaveAttribute("aria-pressed", "true"));
    await expect(within(canvas.getByRole("region", { name: "Last used" })).getByText("Oat milk")).toBeVisible();
    await expect(updateItemRequest).toHaveBeenCalledTimes(2);
  },
};

export const BringIconsAndFallback: Story = {
  parameters: { groceryMock: { canonicalIcons: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const images = [...canvasElement.querySelectorAll<HTMLImageElement>(".grocery-product-icon")];
    await expect(images).toHaveLength(3);
    const expected = ["milch", "getraenke", "brot"].map((id) => `${BRING_ICON_ORIGIN}/assets/images/items/${id}.png`);
    await expect(images.map((image) => image.dataset.bringSrc)).toEqual(expected);
    for (const image of images) {
      await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
      await expect(image).toHaveAttribute("crossorigin", "anonymous");
      await expect(image).toHaveAttribute("alt", "");
      await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
    }
    await expect(groceryIconUrl({ iconId: "milch" })).toBe(expected[0]);
    await expect(groceryIconUrl({ iconId: "getraenke" })).toBe(expected[1]);
    await expect(groceryIconUrl({ iconId: "brot" })).toBe(expected[2]);
    await expect(groceryIconUrl({})).toBeUndefined();
    const previousRequests = iconRequest.mock.calls.length;
    await fireEvent.change(canvas.getByRole("textbox", { name: "Item name" }), { target: { value: "Family secret / custom?" } });
    await userEvent.click(canvas.getByRole("button", { name: "Add item" }));
    const custom = (await canvas.findByText("Family secret / custom?")).closest("li")!;
    await expect(custom.querySelector("img")).toBeNull();
    await expect(custom.querySelector("svg.grocery-product-icon")).toBeVisible();
    await expect(iconRequest).toHaveBeenCalledTimes(previousRequests);
    await fireEvent.error(images[0]);
    await waitFor(() => expect(canvasElement.querySelectorAll("img.grocery-product-icon")).toHaveLength(2));
    await expect(canvas.getByText("Milk").closest("li")!.querySelector("svg.grocery-product-icon")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Check Milk" })).not.toBeDisabled();
  },
};

export const UnavailableIconAssets: Story = {
  parameters: { groceryMock: { canonicalIcons: true, failIcons: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await waitFor(() => expect(canvasElement.querySelectorAll("img.grocery-product-icon")).toHaveLength(0));
    await expect(canvasElement.querySelectorAll(".grocery-product-icon")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Check Bread" }));
    await waitFor(() => expect(within(canvas.getByRole("region", { name: "To buy" })).getByText("Bread")).toBeVisible());
    await expect(canvas.getByRole("button", { name: "Check Bread" })).toHaveAttribute("aria-pressed", "false");
  },
};

const rejectedImages = [
  "http://web.getbring.com/assets/images/items/milch.png",
  "https://evil.example/assets/images/items/milch.png",
  "https://web.getbring.com.evil.example/assets/images/items/milch.png",
  "https://user@web.getbring.com/assets/images/items/milch.png",
  "https://web.getbring.com:443/assets/images/items/milch.png",
  "https://web.getbring.com/assets/images/items/milch.png?tracking=1",
  "https://web.getbring.com/assets/images/items/milch.png#fragment",
  "https://web.getbring.com/assets/images/items/%6dilch.png",
  "https://web.getbring.com/assets/images/items/../milch.png",
  "https://web.getbring.com/assets/images/items/a/../milch.png",
  "https://web.getbring.com/assets/images/items/milch.png\n",
  "//web.getbring.com/assets/images/items/milch.png",
  "javascript:alert(1)",
  "data:image/svg+xml,<svg/>",
];

function MetadataIcons() {
  const [metadata, setMetadata] = useState({ imageUrl: `${BRING_ICON_ORIGIN}/assets/images/items/provider-custom.png`, iconId: "getraenke" });
  return <div>
    {["Milk", "Unrecognized provider product"].map((name) => <div key={name} data-testid={name}>
      {name}<GroceryProductIcon iconId="getraenke" />
    </div>)}
    <div data-testid="no-metadata">Milk<GroceryProductIcon /></div>
    <div data-testid="changing"><GroceryProductIcon {...metadata} /></div>
    <button onClick={() => setMetadata({ imageUrl: `${BRING_ICON_ORIGIN}/assets/images/items/provider-next.png`, iconId: "getraenke" })}>Refresh metadata</button>
    <button onClick={() => setMetadata({ imageUrl: `${BRING_ICON_ORIGIN}/assets/images/items/provider-custom.png`, iconId: "getraenke" })}>Restore metadata</button>
    <div data-testid="rejected">
      {rejectedImages.map((imageUrl) => <GroceryProductIcon key={imageUrl} imageUrl={imageUrl} />)}
      {["../milch", "Getränke", "MILCH", "two words", "a/b", "a%2fb", "a".repeat(161), "milch\n", ""]
        .map((iconId) => <GroceryProductIcon key={iconId} iconId={iconId} />)}
    </div>
  </div>;
}

export const ProviderMetadataValidation: Story = {
  render: () => <MetadataIcons />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const canonical = `${BRING_ICON_ORIGIN}/assets/images/items/getraenke.png`;
    for (const name of ["Milk", "Unrecognized provider product"]) {
      await expect(canvas.getByTestId(name).querySelector("img")).toHaveAttribute("data-bring-src", canonical);
    }
    await expect(canvas.getByTestId("no-metadata").querySelector("img")).toBeNull();
    await expect(canvas.getByTestId("rejected").querySelector("img")).toBeNull();
    for (const imageUrl of rejectedImages) {
      await expect(groceryIconUrl({ imageUrl })).toBeUndefined();
      await expect(groceryIconUrl({ imageUrl, iconId: "getraenke" })).toBe(canonical);
    }
    await expect(iconRequest).toHaveBeenCalledTimes(3);
    const changing = canvas.getByTestId("changing");
    const image = () => changing.querySelector("img")!;
    await expect(image()).toHaveAttribute("data-bring-src", `${BRING_ICON_ORIGIN}/assets/images/items/provider-custom.png`);
    await fireEvent.error(image());
    await waitFor(() => expect(image()).toHaveAttribute("data-bring-src", canonical));
    await fireEvent.error(image());
    await waitFor(() => expect(changing.querySelector("img")).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Refresh metadata" }));
    await expect(image()).toHaveAttribute("data-bring-src", `${BRING_ICON_ORIGIN}/assets/images/items/provider-next.png`);
    await userEvent.click(canvas.getByRole("button", { name: "Restore metadata" }));
    await expect(image()).toHaveAttribute("data-bring-src", `${BRING_ICON_ORIGIN}/assets/images/items/provider-custom.png`);
  },
};

export const ListActionsOnlyInSettings: Story = {
  parameters: { groceryMock: { configured: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(canvas.queryByRole("button", { name: /^Rename list / })).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Delete list / })).toBeNull();
    await expect(canvas.getByRole("button", { name: "Edit item Oat milk" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Remove item Oat milk" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await expect(await canvas.findByRole("button", { name: "Rename Weekly shop" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Delete Weekly shop" })).toBeVisible();
  },
};

export const DarkActionColors: Story = {
  parameters: { groceryMock: { dark: true, delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute("data-theme", "dark");
    for (const chip of canvasElement.querySelectorAll(".MuiChip-root")) {
      await expect(getComputedStyle(chip).color).toBe("rgb(243, 245, 255)");
    }
    const actions = canvas.getAllByRole("button", { name: /^(Rename list|Delete list|Edit item|Remove item) / });
    const toggles = canvas.getAllByRole("button", { name: /^Check / });
    for (const action of actions) {
      await expect(getComputedStyle(action).color).toBe("rgb(243, 245, 255)");
      await expect(getComputedStyle(action.querySelector("svg")!).color).toBe("rgb(243, 245, 255)");
    }
    for (const toggle of toggles) {
      await expect(toggle.tagName).toBe("BUTTON");
      await expect(getComputedStyle(toggle).color).toBe("rgb(243, 245, 255)");
    }
    await userEvent.click(canvas.getByRole("button", { name: "Check Oat milk" }));
    for (const action of [...actions, ...toggles]) {
      await expect(action).toBeDisabled();
      await expect(getComputedStyle(action).color).toBe("rgb(164, 169, 194)");
      if (actions.includes(action)) {
        await expect(getComputedStyle(action.querySelector("svg")!).color).toBe("rgb(164, 169, 194)");
      }
    }
    await waitFor(() => expect(actions[0]).not.toBeDisabled());
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
    await userEvent.click(canvas.getByRole("heading", { name: "Weekly shop" }));
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
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await canvas.findByRole("heading", { name: "Grocery lists" });
    await userEvent.click(canvas.getByRole("button", { name: "Create list" }));
    let dialog = within(await page.findByRole("dialog", { name: "Create grocery list" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "List name" }), { target: { value: "School snacks" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Go to groceries" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(await canvas.findByRole("button", { name: /School snacks/ }));
    await fireEvent.change(canvas.getByRole("textbox", { name: "Item name" }), { target: { value: " Apples " } });
    await fireEvent.change(canvas.getByRole("textbox", { name: "Quantity or details" }), { target: { value: " 6 green " } });
    await userEvent.click(canvas.getByRole("textbox", { name: "Item name" }));
    await userEvent.keyboard("{Enter}");
    await expect(page.queryByRole("dialog")).toBeNull();
    await expect(await canvas.findByText("6 green")).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Item name" })).toHaveValue("");
    await expect(canvas.getByRole("textbox", { name: "Quantity or details" })).toHaveValue("");
    await expect(addItemRequest).toHaveBeenCalledWith({ listId: expect.any(String), name: "Apples", specification: "6 green" });
    await userEvent.click(canvas.getByRole("button", { name: "Check Apples" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Check Apples" })).toHaveAttribute("aria-pressed", "true"));
    await expect(within(canvas.getByRole("region", { name: "Last used" })).getByText("Apples")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check Apples" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Check Apples" })).toHaveAttribute("aria-pressed", "false"));
    await expect(within(canvas.getByRole("region", { name: "To buy" })).getByText("Apples")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Edit item Apples" }));
    dialog = within(await page.findByRole("dialog", { name: "Edit grocery item" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "Item name" }), { target: { value: "Pears" } });
    await fireEvent.change(dialog.getByRole("textbox", { name: "Quantity or details" }), { target: { value: "4 ripe" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("4 ripe")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await canvas.findByRole("heading", { name: "Grocery lists" });
    await userEvent.click(canvas.getByRole("button", { name: "Rename School snacks" }));
    dialog = within(await page.findByRole("dialog", { name: "Rename grocery list" }));
    await fireEvent.change(dialog.getByRole("textbox", { name: "List name" }), { target: { value: "Lunch snacks" } });
    await userEvent.click(dialog.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Go to groceries" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: /Lunch snacks/ }));
    await expect(await canvas.findByRole("heading", { name: "Lunch snacks" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Remove item Pears" }));
    await waitFor(() => expect(canvas.queryByText("Pears")).toBeNull());
  },
};

export const InlineAddGuards: Story = {
  parameters: { groceryMock: { delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const name = canvas.getByRole("textbox", { name: "Item name" });
    const details = canvas.getByRole("textbox", { name: "Quantity or details" });
    const form = canvas.getByRole("form", { name: "Add grocery item" });
    await expect(name).toHaveAttribute("maxlength", "160");
    await expect(details).toHaveAttribute("maxlength", "500");
    await fireEvent.change(name, { target: { value: "   " } });
    await fireEvent.submit(form);
    await expect(addItemRequest).not.toHaveBeenCalled();
    await fireEvent.change(name, { target: { value: "a".repeat(161) } });
    await fireEvent.submit(form);
    await expect(addItemRequest).not.toHaveBeenCalled();
    await fireEvent.change(name, { target: { value: "Rice" } });
    await fireEvent.change(details, { target: { value: "a".repeat(501) } });
    await fireEvent.submit(form);
    await expect(addItemRequest).not.toHaveBeenCalled();
    await fireEvent.change(details, { target: { value: "1 bag" } });
    // Repeated submit events model rapid Enter presses before React can paint the busy state.
    await fireEvent.submit(form);
    await fireEvent.submit(form);
    await fireEvent.submit(form);
    await expect(addItemRequest).toHaveBeenCalledTimes(1);
    await expect(name).toBeDisabled();
    await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).toBeNull();
    await expect(await canvas.findByText("Rice")).toBeVisible();
    await expect(canvas.getAllByText("Rice")).toHaveLength(1);
    await expect(name).toHaveValue("");
    await expect(details).toHaveValue("");
  },
};

export const InlineDraftIsolation: Story = {
  args: { allowSwitch: true, allowTokenSwitch: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const fillDraft = async () => {
      await fireEvent.change(canvas.getByRole("textbox", { name: "Item name" }), { target: { value: "Private draft" } });
      await fireEvent.change(canvas.getByRole("textbox", { name: "Quantity or details" }), { target: { value: "For this list only" } });
    };
    const expectEmpty = async () => {
      await expect(canvas.getByRole("textbox", { name: "Item name" })).toHaveValue("");
      await expect(canvas.getByRole("textbox", { name: "Quantity or details" })).toHaveValue("");
    };
    await fillDraft();
    await userEvent.click(canvas.getByRole("button", { name: /Weekend cooking 1/ }));
    await expectEmpty();
    await userEvent.click(canvas.getByRole("button", { name: /Weekly shop 2/ }));
    await expectEmpty();
    await fillDraft();
    await userEvent.click(canvas.getByRole("button", { name: "Refresh session" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expectEmpty();
    await fillDraft();
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await canvas.findByRole("heading", { name: "Other household list" });
    await expectEmpty();
    await expect(addItemRequest).not.toHaveBeenCalled();
  },
};

export const ReaddLastUsedInline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    const name = canvas.getByRole("textbox", { name: "Item name" });
    const details = canvas.getByRole("textbox", { name: "Quantity or details" });
    const toBuy = within(canvas.getByRole("region", { name: "To buy" }));
    const lastUsed = within(canvas.getByRole("region", { name: "Last used" }));
    for (const specification of ["", "2 loaves"]) {
      await expect(lastUsed.getByRole("button", { name: "Check Sourdough bread" })).toHaveAttribute("aria-pressed", "true");
      await fireEvent.change(name, { target: { value: "  sourDOUGH bread  " } });
      await fireEvent.change(details, { target: { value: specification ? ` ${specification} ` : "   " } });
      await userEvent.click(name);
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(toBuy.getByRole("button", { name: "Check Sourdough bread" })).toHaveAttribute("aria-pressed", "false"));
      await expect(toBuy.getByText(specification || "1 loaf")).toBeVisible();
      await expect(lastUsed.queryByText("Sourdough bread")).toBeNull();
      await expect(updateItemRequest).toHaveBeenLastCalledWith({
        listId: "weekly", id: "bread", checked: false, ...(specification ? { specification } : {}),
      });
      await expect(canvas.getAllByText("Sourdough bread")).toHaveLength(1);
      await expect(name).toHaveValue("");
      await expect(details).toHaveValue("");
      if (!specification) {
        await userEvent.click(toBuy.getByRole("button", { name: "Check Sourdough bread" }));
        await waitFor(() => expect(lastUsed.getByRole("button", { name: "Check Sourdough bread" })).toHaveAttribute("aria-pressed", "true"));
      }
    }
    // An already-active item also reuses its id without erasing its quantity.
    await fireEvent.change(name, { target: { value: "Sourdough bread" } });
    await userEvent.click(canvas.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(name).toHaveValue(""));
    await expect(canvas.getAllByText("Sourdough bread")).toHaveLength(1);
    await expect(toBuy.getByText("2 loaves")).toBeVisible();
    await expect(updateItemRequest).toHaveBeenLastCalledWith({ listId: "weekly", id: "bread", checked: false });
    await expect(addItemRequest).not.toHaveBeenCalled();
  },
};

export const BringLinkImportAndSync: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(canvas.queryByRole("heading", { name: "Groceries, together" })).toBeNull();
    await expect(canvas.queryByText(/\d+ to buy · \d+ checked/)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Sync now" }));
    await expect(await canvas.findByText(/^Last synced:/)).toBeVisible();
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: /Weekend cooking/ }));
    await expect(canvas.queryByRole("button", { name: "Sync now" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Link Bring list" }));
    let dialog = within(await page.findByRole("dialog", { name: "Link Bring list" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Bring weekly" }));
    await userEvent.click(dialog.getByRole("button", { name: "Link list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await canvas.findByRole("heading", { name: "Grocery lists" });
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Dinner party" }));
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Go to groceries" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: /Dinner party/ }));
    await expect(await canvas.findByRole("heading", { name: "Dinner party" })).toBeVisible();
    await expect(await canvas.findByText("Fresh basil")).toBeVisible();
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
  },
};

export const UnavailableAndRetry: Story = {
  parameters: { groceryMock: { configured: false, failRead: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Grocery service temporarily unavailable")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await expect(canvas.getByRole("button", { name: "Sync now" })).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "Item name" })).not.toBeDisabled();
  },
};

export const FailedSaveAndBringRetry: Story = {
  parameters: { groceryMock: { failMutation: true, failBring: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await fireEvent.change(canvas.getByRole("textbox", { name: "Item name" }), { target: { value: "Bananas" } });
    await fireEvent.change(canvas.getByRole("textbox", { name: "Quantity or details" }), { target: { value: "3 ripe" } });
    await userEvent.click(canvas.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(canvas.getByText("Could not save grocery changes")).toBeVisible());
    await expect(canvas.getByRole("textbox", { name: "Item name" })).toHaveValue("Bananas");
    await expect(canvas.getByRole("textbox", { name: "Quantity or details" })).toHaveValue("3 ripe");
    await userEvent.click(canvas.getByRole("button", { name: "Add item" }));
    await expect(await canvas.findByText("Bananas")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await canvas.findByRole("heading", { name: "Grocery lists" });
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    const dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await waitFor(() => expect(dialog.getByText("Could not load Bring lists. Please retry.")).toBeVisible());
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
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await canvas.findByRole("heading", { name: "Grocery lists" });
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    const dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Dinner party" }));
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(dialog.getByText("Could not import the Bring list. Your local list is kept. Please retry.")).toBeVisible());
    await waitFor(() => expect(dialog.getByRole("button", { name: "Import list" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await expect(await canvas.findByText("Dinner party")).toBeVisible();
    await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Go to groceries" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: /Dinner party/ }));
    await expect(await canvas.findByRole("heading", { name: "Dinner party" })).toBeVisible();
    await expect(within(canvas.getByRole("navigation", { name: "Grocery lists" })).getAllByRole("button", { name: /Dinner party/ })).toHaveLength(1);
    await expect(canvas.queryByText("Synced with Bring")).toBeNull();
  },
};

export const HouseholdSwitchIgnoresStaleMutation: Story = {
  args: { allowSwitch: true },
  parameters: { groceryMock: { delayedMutation: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "Check Oat milk" }));
    await expect(await canvas.findByText("Saving grocery changes…")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Switch household" }));
    await expect(await canvas.findByRole("heading", { name: "Other household list" })).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 850));
    await expect(canvas.queryByText("Weekly shop")).toBeNull();
    await expect(canvas.queryByText("Saving grocery changes…")).toBeNull();
    await expect(canvas.getByRole("textbox", { name: "Item name" })).not.toBeDisabled();
  },
};

export const ImportUnavailableKeepsLocalLink: Story = {
  parameters: { groceryMock: { failSync: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: "Open settings" }));
    await canvas.findByRole("heading", { name: "Grocery lists" });
    await userEvent.click(canvas.getByRole("button", { name: "Import from Bring" }));
    const dialog = within(await page.findByRole("dialog", { name: "Import from Bring" }));
    await userEvent.click(await dialog.findByRole("combobox", { name: "Bring list" }));
    await userEvent.click(await page.findByRole("option", { name: "Dinner party" }));
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await expect(await dialog.findByText("Could not import the Bring list. Your local list is kept. Please retry.")).toBeVisible();
    await expect(canvas.getByText("Dinner party").closest("tr")).toHaveTextContent("Bring unavailable");
    await waitFor(() => expect(dialog.getByRole("button", { name: "Import list" })).toBeEnabled());
    await userEvent.click(dialog.getByRole("button", { name: "Import list" }));
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    await userEvent.click(within(canvas.getByRole("banner")).getByRole("button", { name: "Go to groceries" }));
    await canvas.findByRole("heading", { name: "Weekly shop" });
    await userEvent.click(canvas.getByRole("button", { name: /Dinner party/ }));
    await expect(await canvas.findByText("Fresh basil")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Sync now" })).toBeEnabled();
  },
};
