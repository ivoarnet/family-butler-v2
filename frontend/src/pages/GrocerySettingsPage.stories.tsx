import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { ModuleNavigation } from "../features/app/components/ModuleNavigation";
import type { BringConnection } from "../features/groceries/types";
import { GrocerySettingsPage } from "./GrocerySettingsPage";

type Options = { configured?: boolean; missingKey?: boolean; failRead?: boolean; failSave?: boolean; failTest?: boolean; delayed?: boolean; delayedSave?: boolean; forbidden?: boolean };
const sampleMail = "owner@example.invalid";
const samplePassword = "storybook-example-only";

function installMock(options: Options = {}) {
  const original = window.fetch;
  const originalSetItem = Storage.prototype.setItem;
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
    expect(new Headers(init?.headers).get("Authorization")).toBe(["Bearer", "storybook-connection-session"].join(" "));
    const respond = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
    const method = init?.method ?? "GET";
    expect(["/connection", "/connection-test"].some((path) => url.pathname.endsWith(path))).toBe(true);
    if (options.delayed && url.pathname.includes("/demo/")) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(init?.signal?.aborted).toBe(true);
    }
    if (url.pathname.includes("/other/")) return respond({ configured: false, source: null, canConfigure: true });
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
    // Include unexpected legacy secret fields to prove the UI never reads them back.
    return respond({ ...state, mail: "legacy@example.invalid", password: "never-read-this" });
  };
  return () => { window.fetch = original; Storage.prototype.setItem = originalSetItem; };
}

function SettingsStory({ allowSwitch = false, allowNavigation = false }: { allowSwitch?: boolean; allowNavigation?: boolean }) {
  const [householdId, setHouseholdId] = useState("demo");
  const [settings, setSettings] = useState(true);
  return <div className="app-shell">
    {allowSwitch && <button onClick={() => setHouseholdId("other")}>Switch household</button>}
    {settings ? <GrocerySettingsPage householdId={householdId} householdName={householdId === "demo" ? "The Riverstone household" : "Other household"}
      accessToken="storybook-connection-session" onBack={() => { if (allowNavigation) setSettings(false); }}
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
