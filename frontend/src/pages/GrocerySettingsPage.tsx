import { useEffect, useRef, useState, type ReactNode } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Alert, Box, Chip, CircularProgress, DialogTitle, Stack, Typography } from "@mui/material";
import { createGroceryClient } from "../features/groceries/client";
import type { BringConnection } from "../features/groceries/types";
import { DialogActionsBar, DialogContentPanel, FormField, GlassDialog, GradientButton, SecondaryButton } from "../shared/ui/GlassFormDialog";

interface Props {
  householdId: string;
  householdName: string;
  accessToken: string;
  onBack: () => void;
  moduleNavigation?: ReactNode;
}

export function GrocerySettingsPage(props: Props) {
  return <ConnectionSession key={`${props.householdId}:${props.accessToken}`} {...props} />;
}

function ConnectionSession({ householdId, householdName, accessToken, onBack, moduleNavigation }: Props) {
  const [connection, setConnection] = useState<BringConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const passwordInput = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const client = useRef<ReturnType<typeof createGroceryClient> | null>(null);
  const pending = useRef(false);

  const clearCredentials = () => {
    if (passwordInput.current) passwordInput.current.value = "";
    setPassword("");
    setMail("");
  };

  const load = async () => {
    const controller = active.current;
    const api = client.current;
    if (!controller || !api || pending.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.connection();
      if (!controller.signal.aborted) setConnection(result);
    } catch {
      if (!controller.signal.aborted) setError("Could not load Bring connection settings. Please retry.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    client.current = createGroceryClient(householdId, accessToken, controller.signal);
    void load();
    const input = passwordInput.current;
    return () => {
      controller.abort();
      if (input) input.value = "";
    };
  }, [householdId, accessToken]);

  const run = async (operation: "save" | "test" | "disconnect") => {
    const controller = active.current;
    const api = client.current;
    if (!controller || !api || pending.current || loading || !connection) return;
    if (operation !== "test" && !connection.canConfigure) return;
    if (operation === "save" && (!mail.trim() || !password)) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const request = operation === "save" ? api.saveConnection(mail.trim(), password)
        : operation === "disconnect" ? api.disconnectConnection() : api.testConnection();
      clearCredentials();
      const result = await request;
      if (controller.signal.aborted) return;
      if (operation === "test") {
        if ((result as { connected: boolean }).connected) setNotice("Current Bring connection works.");
        else setError("Bring is currently unavailable. Please try again.");
      } else {
        setConnection(result as BringConnection);
        setConfirmDisconnect(false);
        setNotice(operation === "save"
          ? "Bring connection tested and saved. Link or import your Bring lists again."
          : "Bring disconnected. All local lists and items have been kept.");
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        // Only the client's fixed, secret-safe messages are eligible for display.
        setError(failure instanceof Error && failure.message === "Only the household owner can manage the Bring connection."
          ? failure.message : "Bring connection request failed. Check availability and try again.");
      }
    } finally {
      clearCredentials();
      if (!controller.signal.aborted) {
        pending.current = false;
        setBusy(false);
      }
    }
  };

  const back = () => { clearCredentials(); active.current?.abort(); onBack(); };
  const disabled = loading || busy || !connection?.canConfigure;
  return <div className="dashboard-page settings-page">
    <header className="dashboard-header settings-header" role="banner">
      <button type="button" className="icon-button" onClick={back} aria-label="Back to Shop & Cook"><ArrowBackIcon fontSize="small" /></button>
      <div className="header-branding">{moduleNavigation}<div><h1>Shop &amp; Cook settings</h1><p>{householdName}</p></div></div>
    </header>
    <Box component="main" className="settings-main" sx={{ gap: 3, maxWidth: 880, width: "100%", boxSizing: "border-box", mx: "auto" }}>
      <SecondaryButton onClick={back} startIcon={<ArrowBackIcon />} sx={{ justifySelf: "start" }}>Back to groceries</SecondaryButton>
      <section className="settings-card">
        <Stack sx={{ gap: 2.5 }}>
          <Box><Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>Bring connection</Typography>
            <Typography color="text.secondary">Connect one Bring account for this household. Only the household owner can save or disconnect it.</Typography></Box>
          {loading && <Stack direction="row" spacing={1} sx={{ alignItems: "center" }} role="status"><CircularProgress size={20} />Loading connection settings…</Stack>}
          {error && <Alert severity="error" action={!connection && !loading ? <SecondaryButton onClick={() => void load()}>Retry</SecondaryButton> : undefined}>{error}</Alert>}
          {notice && <Alert severity="success" role="status">{notice}</Alert>}
          {connection && <>
            <Box><Chip label={connection.configured ? "Account configured" : "No account configured"} color={connection.configured ? "success" : "default"} />
              <Typography sx={{ mt: 1 }} color="text.secondary">Source: {connection.source === "stored" ? "Saved household account" : connection.source === "environment" ? "Managed by server configuration" : "None"}</Typography></Box>
            {!connection.canConfigure && <Alert severity="info">Connection changes are disabled because the server encryption key is missing. Ask your administrator to configure it. A configured account can still be tested. Disconnect also needs this key to persist an override of any server environment account.</Alert>}
            <Alert severity="warning">Saving replaces the household’s Bring account and unlinks all current Bring list mappings. Local lists and items are kept. Link or import Bring lists again after saving.</Alert>
          </>}
          <Box component="form" autoComplete="off" onSubmit={(event) => { event.preventDefault(); void run("save"); }} sx={{ display: "grid", gap: 2 }}>
            <Typography component="h3" sx={{ fontWeight: 700 }}>Save a Bring account</Typography>
            <Typography color="text.secondary" variant="body2">Credentials are write-only: existing email and password are never shown. Saving tests the account before storing it securely on the server.</Typography>
            <FormField label="Bring email" name="bring-mail" type="email" autoComplete="off" required fullWidth disabled={disabled}
              value={mail} onChange={(event) => setMail(event.target.value)} />
            <FormField label="Bring password" name="bring-password" type="password" autoComplete="new-password" required fullWidth disabled={disabled}
              inputRef={passwordInput} value={password} onChange={(event) => setPassword(event.target.value)} />
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              <GradientButton type="submit" disabled={disabled || !mail.trim() || !password}>Test and save account</GradientButton>
              <SecondaryButton type="button" disabled={!mail && !password} onClick={clearCredentials}>Cancel entry</SecondaryButton>
            </Stack>
          </Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <SecondaryButton disabled={loading || busy || !connection?.configured} onClick={() => void run("test")}>Test current connection</SecondaryButton>
            <SecondaryButton disabled={disabled || !connection?.configured} onClick={() => { clearCredentials(); setConfirmDisconnect(true); }}>Disconnect account</SecondaryButton>
          </Stack>
          <Typography role="status" aria-live="polite">{busy ? "Working on Bring connection…" : ""}</Typography>
        </Stack>
      </section>
    </Box>
    <GlassDialog open={confirmDisconnect} onClose={() => { if (!busy) setConfirmDisconnect(false); }} aria-labelledby="disconnect-bring-title">
      <DialogTitle id="disconnect-bring-title">Disconnect Bring account?</DialogTitle>
      <DialogContentPanel>
        <Typography>This disconnects Bring for the entire household, including any server environment account, and unlinks all Bring lists. Your local lists and items are preserved. You can connect and link lists again later.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy} onClick={() => setConfirmDisconnect(false)}>Cancel</SecondaryButton>
        <GradientButton disabled={busy} onClick={() => void run("disconnect")}>Disconnect Bring</GradientButton>
      </DialogActionsBar>
    </GlassDialog>
  </div>;
}
