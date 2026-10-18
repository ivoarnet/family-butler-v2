import { useCallback, useEffect, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Alert, Box, Chip, CircularProgress, DialogTitle, Stack, Typography } from "@mui/material";
import { DialogActionsBar, DialogContentPanel, FormField, GlassDialog, GradientButton, SecondaryButton } from "../../shared/ui/GlassFormDialog";
import { createGroceryClient } from "./client";
import { syncLabel } from "./syncLabel";
import type { GroceryData } from "./types";
import { SettingsInfo } from "../settings/components/SettingsInfo";

interface Props {
  householdId: string;
  accessToken: string;
  connectionRevision: number;
}

export function GroceryListSettings({ householdId, accessToken, connectionRevision }: Props) {
  const [data, setData] = useState<GroceryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ id?: string; name: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useRef<{ controller: AbortController; api: ReturnType<typeof createGroceryClient> } | null>(null);
  const pending = useRef(false);
  const readVersion = useRef(0);

  const reload = useCallback(async () => {
    const current = session.current;
    if (!current || current.controller.signal.aborted) return;
    const version = ++readVersion.current;
    setLoading(true);
    setData(null);
    setError("");
    try {
      const next = await current.api.read();
      if (!current.controller.signal.aborted && version === readVersion.current) setData(next);
    } catch {
      if (!current.controller.signal.aborted && version === readVersion.current) {
        setError("Could not load grocery lists. Please retry.");
      }
    } finally {
      if (!current.controller.signal.aborted && version === readVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    session.current = { controller, api: createGroceryClient(householdId, accessToken, controller.signal) };
    return () => { controller.abort(); ++readVersion.current; };
  }, [householdId, accessToken]);

  useEffect(() => { void reload(); }, [householdId, accessToken, connectionRevision, reload]);

  const save = async () => {
    const current = session.current;
    if (!current || current.controller.signal.aborted || pending.current || !editor?.name.trim() || editor.name.trim().length > 160) return;
    pending.current = true;
    setBusy(true);
    setSaveError("");
    try {
      if (editor.id) await current.api.updateList(editor.id, { name: editor.name.trim() });
      else await current.api.createList(editor.name.trim());
      if (current.controller.signal.aborted) return;
      // The write has succeeded: a failed overview refresh must not offer to create it again.
      setEditor(null);
      await reload();
    } catch {
      if (!current.controller.signal.aborted) setSaveError("Could not save the grocery list. Your draft is kept. Please retry.");
    } finally {
      if (!current.controller.signal.aborted) {
        pending.current = false;
        setBusy(false);
      }
    }
  };

  const openEditor = (draft: { id?: string; name: string }) => { setSaveError(""); setEditor(draft); };
  return <section className="settings-card" aria-labelledby="grocery-lists-heading" style={{ minWidth: 0 }}>
    <Stack sx={{ gap: 2.5 }}>
      <div className="section-toolbar">
        <span className="section-title-info"><h2 id="grocery-lists-heading">Grocery lists</h2>
          <SettingsInfo label="Grocery list information" text="Create and rename household lists here or in the Shop & Cook workspace. Items stay unchanged. Local lists are not linked to Bring. Linked does not mean synced; status reflects the last recorded sync. Link, import and sync lists in the workspace." />
        </span>
        <button type="button" className="primary-pill no-wrap-button" disabled={busy} onClick={() => openEditor({ name: "" })}>
          <AddIcon fontSize="small" /> Create list
        </button>
      </div>
      {loading && <Stack direction="row" spacing={1} sx={{ alignItems: "center" }} role="status"><CircularProgress size={20} />Loading grocery lists…</Stack>}
      {error && <Alert severity="error" action={<SecondaryButton disabled={loading || busy} onClick={() => void reload()}>Retry lists</SecondaryButton>}>{error}</Alert>}
      {data && !data.lists.length && <Typography color="text.secondary">No grocery lists yet. Create your first list to get started.</Typography>}
      {data && data.lists.length > 0 && <div className="table-scroll">
        <table className="settings-table" aria-label="Grocery lists">
          <thead><tr><th scope="col">Name</th><th scope="col">Bring sync status</th><th scope="col">Last synced</th><th scope="col" className="actions-column">Actions</th></tr></thead>
          <tbody>{data.lists.map((list) => <tr key={list.id}>
            <td style={{ overflowWrap: "anywhere" }}>{list.name}</td>
            <td><Chip size="small" label={syncLabel(list, data.bringConfigured)} sx={{ color: "var(--text-primary)", bgcolor: "var(--dialog-field)" }} /></td>
            <td>{list.remoteId && list.lastSyncedAt && Number.isFinite(Date.parse(list.lastSyncedAt))
              ? <time dateTime={list.lastSyncedAt}>{new Date(list.lastSyncedAt).toLocaleString()}</time>
              : "—"}</td>
            <td className="actions-cell"><div className="icon-actions">
              <button type="button" className="icon-button compact-icon-button" aria-label={`Rename ${list.name}`} title="Rename list" disabled={busy}
                onClick={() => openEditor({ id: list.id, name: list.name })}><EditOutlinedIcon fontSize="small" /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Stack>
    <GlassDialog open={!!editor} onClose={() => { if (!busy) setEditor(null); }} aria-labelledby="grocery-list-editor-title">
      <Box component="form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <DialogTitle id="grocery-list-editor-title">{editor?.id ? "Rename grocery list" : "Create grocery list"}</DialogTitle>
        <DialogContentPanel>
          {saveError && <Alert severity="error">{saveError}</Alert>}
          <FormField autoFocus fullWidth required label="List name" value={editor?.name ?? ""} disabled={busy}
            slotProps={{ htmlInput: { maxLength: 160 } }}
            error={(editor?.name.trim().length ?? 0) > 160}
            helperText={(editor?.name.trim().length ?? 0) > 160 ? "Use 160 characters or fewer." : undefined}
            onChange={(event) => setEditor((previous) => previous ? { ...previous, name: event.target.value } : previous)} />
        </DialogContentPanel>
        <DialogActionsBar>
          <SecondaryButton disabled={busy} onClick={() => setEditor(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={busy || !editor?.name.trim() || editor.name.trim().length > 160}>{busy ? "Saving…" : "Save list"}</GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  </section>;
}
