import { useCallback, useEffect, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { Alert, Box, Chip, CircularProgress, DialogTitle, MenuItem, Stack, Typography } from "@mui/material";
import { DialogActionsBar, DialogContentPanel, FormField, GlassDialog, GradientButton, SecondaryButton } from "../../shared/ui/GlassFormDialog";
import { createGroceryClient } from "./client";
import { syncLabel } from "./syncLabel";
import type { BringList, GroceryData, GroceryList } from "./types";
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
  const [deleteList, setDeleteList] = useState<GroceryList | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bringPicker, setBringPicker] = useState<{ remoteId: string; localId?: string } | null>(null);
  const [bringLists, setBringLists] = useState<BringList[]>([]);
  const [bringLoading, setBringLoading] = useState(false);
  const [bringError, setBringError] = useState("");
  const [importError, setImportError] = useState("");
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
  const remove = async () => {
    const current = session.current;
    if (!current || current.controller.signal.aborted || pending.current || !deleteList) return;
    pending.current = true;
    setBusy(true);
    setDeleteError("");
    try {
      await current.api.removeList(deleteList.id);
      if (current.controller.signal.aborted) return;
      setDeleteList(null);
      await reload();
    } catch {
      if (!current.controller.signal.aborted) setDeleteError("Could not delete the grocery list. Please retry.");
    } finally {
      if (!current.controller.signal.aborted) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const openImport = async () => {
    const current = session.current;
    if (!current || pending.current || !data?.bringConfigured) return;
    setBringPicker({ remoteId: "" });
    setBringLists([]);
    setBringError("");
    setImportError("");
    setBringLoading(true);
    try {
      const result = await current.api.bringLists();
      if (!current.controller.signal.aborted) setBringLists(result.lists);
    } catch {
      if (!current.controller.signal.aborted) setBringError("Could not load Bring lists. Please retry.");
    } finally {
      if (!current.controller.signal.aborted) setBringLoading(false);
    }
  };
  const importList = async () => {
    const current = session.current;
    const picker = bringPicker;
    const remote = bringLists.find(({ id }) => id === picker?.remoteId);
    if (!current || !picker || !remote || pending.current) return;
    pending.current = true;
    setBusy(true);
    setImportError("");
    try {
      let localId = picker.localId;
      if (!localId) {
        const previousIds = new Set(data?.lists.map(({ id }) => id) ?? []);
        const created = await current.api.createList(remote.name);
        localId = created?.id ?? created?.list?.id;
        if (!localId) {
          const refreshed = await current.api.read();
          if (current.controller.signal.aborted) return;
          setData(refreshed);
          localId = refreshed.lists.find(({ id, name }) => !previousIds.has(id) && name === remote.name)?.id;
        }
        if (!localId) throw new Error("Could not identify the imported list.");
        if (current.controller.signal.aborted) return;
        setBringPicker({ ...picker, localId });
      }
      await current.api.updateList(localId, { remoteId: picker.remoteId });
      await current.api.sync(localId);
      if (current.controller.signal.aborted) return;
      setBringPicker(null);
      await reload();
    } catch {
      if (!current.controller.signal.aborted) {
        setImportError("Could not import the Bring list. Your local list is kept. Please retry.");
        await reload();
      }
    } finally {
      if (!current.controller.signal.aborted) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return <section className="settings-card" aria-labelledby="grocery-lists-heading" style={{ minWidth: 0 }}>
    <Stack sx={{ gap: 2.5 }}>
      <div className="section-toolbar">
        <span className="section-title-info"><h2 id="grocery-lists-heading">Grocery lists</h2>
          <SettingsInfo label="Grocery list information" text="Create, rename and delete household lists here. Items stay unchanged. Local lists are not linked to Bring. Linked does not mean synced; status reflects the last recorded sync. Import lists here; link and sync lists in the workspace." />
        </span>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          <SecondaryButton startIcon={<FileDownloadOutlinedIcon />} disabled={busy || loading || !data?.bringConfigured} onClick={() => void openImport()}>
            Import from Bring
          </SecondaryButton>
          <button type="button" className="primary-pill no-wrap-button" disabled={busy} onClick={() => openEditor({ name: "" })}>
            <AddIcon fontSize="small" /> Create list
          </button>
        </Stack>
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
             <button type="button" className="icon-button compact-icon-button" aria-label={`Delete ${list.name}`} title="Delete list" disabled={busy}
               onClick={() => { setDeleteError(""); setDeleteList(list); }}><DeleteOutlineIcon fontSize="small" /></button>
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
    <GlassDialog open={!!deleteList} onClose={() => { if (!busy) setDeleteList(null); }}
      aria-labelledby="grocery-list-delete-title" aria-describedby="grocery-list-delete-description" maxWidth="sm" fullWidth>
      <DialogTitle id="grocery-list-delete-title">Delete grocery list?</DialogTitle>
      <DialogContentPanel>
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
        <Typography id="grocery-list-delete-description">
          “{deleteList?.name}” and its items will be removed here. Any linked Bring list and its items will NOT be deleted.
        </Typography>
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy} onClick={() => setDeleteList(null)}>Cancel</SecondaryButton>
        <GradientButton disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete list"}</GradientButton>
      </DialogActionsBar>
    </GlassDialog>
    <GlassDialog open={!!bringPicker} onClose={() => { if (!busy) setBringPicker(null); }} aria-labelledby="grocery-import-title" maxWidth="sm" fullWidth>
      <DialogTitle id="grocery-import-title">Import from Bring</DialogTitle>
      <DialogContentPanel>
        <Typography color="text.secondary">Choose an existing Bring list. Import creates a local list and links it; no new Bring list is created.</Typography>
        {bringLoading && <Typography role="status">Loading Bring lists…</Typography>}
        {bringError && <Alert severity="error" action={<SecondaryButton onClick={() => void openImport()}>Retry</SecondaryButton>}>{bringError}</Alert>}
        {importError && <Alert severity="error">{importError}</Alert>}
        {!bringLoading && !bringError && !bringLists.length && <Alert severity="info">No Bring lists found. Create a list in Bring first.</Alert>}
        {!!bringLists.length && <FormField select fullWidth label="Bring list" value={bringPicker?.remoteId ?? ""} disabled={busy || bringLoading}
          onChange={(event) => { setImportError(""); setBringPicker((current) => current ? { remoteId: event.target.value } : null); }}>
          {bringLists.map((list) => <MenuItem key={list.id} value={list.id}>{list.name}</MenuItem>)}
        </FormField>}
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy} onClick={() => setBringPicker(null)}>Cancel</SecondaryButton>
        <GradientButton disabled={busy || bringLoading || !!bringError || !bringPicker?.remoteId} onClick={() => void importList()}>
          {busy ? "Importing…" : "Import list"}
        </GradientButton>
      </DialogActionsBar>
    </GlassDialog>
  </section>;
}
