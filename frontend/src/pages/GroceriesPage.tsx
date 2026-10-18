import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import SettingsIcon from "@mui/icons-material/Settings";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import SyncIcon from "@mui/icons-material/Sync";
import { Alert, Box, Checkbox, Chip, CircularProgress, DialogTitle, IconButton, MenuItem, Stack, Typography } from "@mui/material";
import { createGroceryClient } from "../features/groceries/client";
import type { BringList, GroceryData, GroceryItem, GroceryList } from "../features/groceries/types";
import { DialogActionsBar, DialogContentPanel, FormField, GlassDialog, GradientButton, SecondaryButton } from "../shared/ui/GlassFormDialog";
import { AvatarContextMenu } from "../shared/ui/AvatarContextMenu";

interface GroceriesPageProps {
  householdId: string;
  householdName: string;
  accessToken: string;
  onOpenSettings?: () => void;
  currentUserLabel: string;
  currentUserEmail: string;
  currentUserInitials: string;
  currentUserAvatarUrl: string | null;
  onOpenAccountSection: (section: "profile" | "households") => void;
  onSignOut: () => Promise<void>;
  moduleNavigation?: ReactNode;
}

type Editor = { kind: "list"; id?: string; name: string } |
  { kind: "item"; id?: string; name: string; specification: string };
type BringPicker = { mode: "import" | "link"; localId?: string; remoteId: string };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
const syncLabel = (list: GroceryList, configured: boolean) => {
  if (!list.remoteId) return "Local list";
  if (!configured || list.syncStatus === "unavailable") return "Bring unavailable";
  if (list.syncStatus === "pending") return "Sync pending";
  if (list.syncStatus === "error" || list.syncStatus === "failed") return "Sync failed";
  return list.syncStatus === "synced" ? "Synced with Bring" : "Linked to Bring";
};

// A new household or token gets isolated state and aborts the old session's requests.
export function GroceriesPage(props: GroceriesPageProps) {
  return <GrocerySession key={`${props.householdId}:${props.accessToken}`} {...props} />;
}

function GrocerySession({ householdId, householdName, accessToken, onOpenSettings, moduleNavigation,
  currentUserLabel, currentUserEmail, currentUserInitials, currentUserAvatarUrl, onOpenAccountSection, onSignOut }: GroceriesPageProps) {
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<GroceryData>({ lists: [], bringConfigured: false });
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [bringPicker, setBringPicker] = useState<BringPicker | null>(null);
  const [bringLists, setBringLists] = useState<BringList[]>([]);
  const [bringLoading, setBringLoading] = useState(false);
  const [bringError, setBringError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const client = useRef<ReturnType<typeof createGroceryClient> | null>(null);
  const busyRef = useRef(false);
  const readVersion = useRef(0);
  const bringVersion = useRef(0);

  useEffect(() => {
    if (!isAvatarMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!avatarMenuRef.current?.contains(event.target as Node)) setIsAvatarMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAvatarMenuOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAvatarMenuOpen]);

  const refresh = useCallback(async () => {
    const currentClient = client.current;
    const currentController = controller.current;
    if (!currentClient || !currentController) return;
    const version = ++readVersion.current;
    const next = await currentClient.read();
    if (currentController.signal.aborted || version !== readVersion.current) return;
    setData(next);
    setSelectedId((previous) => next.lists.some(({ id }) => id === previous) ? previous : next.lists[0]?.id ?? "");
    return next;
  }, []);

  const reload = useCallback(async () => {
    const active = controller.current;
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      await refresh();
    } catch (failure) {
      if (!active.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    client.current = createGroceryClient(householdId, accessToken, active.signal);
    void reload();
    return () => {
      active.abort();
      ++readVersion.current;
      ++bringVersion.current;
    };
  }, [householdId, accessToken, reload]);

  const selected = data.lists.find(({ id }) => id === selectedId);
  const disabled = loading || busy;

  const mutate = async (action: (api: ReturnType<typeof createGroceryClient>) => Promise<unknown>, close?: () => void) => {
    const api = client.current;
    const active = controller.current;
    if (busyRef.current || !api || !active) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      await action(api);
      if (active.signal.aborted) return;
      close?.();
      await refresh();
    } catch (failure) {
      if (active.signal.aborted) return;
      setError(errorMessage(failure));
      setDialogError(errorMessage(failure));
    } finally {
      if (!active.signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const loadBring = async () => {
    const api = client.current;
    const active = controller.current;
    if (!api || !active) return;
    const version = ++bringVersion.current;
    setBringLoading(true);
    setBringError(null);
    try {
      const next = await api.bringLists();
      if (!active.signal.aborted && version === bringVersion.current) setBringLists(next.lists);
    } catch (failure) {
      if (!active.signal.aborted && version === bringVersion.current) setBringError(errorMessage(failure));
    } finally {
      if (!active.signal.aborted && version === bringVersion.current) setBringLoading(false);
    }
  };

  const openBring = (mode: BringPicker["mode"]) => {
    setBringPicker({ mode, remoteId: "", localId: mode === "link" ? selectedId : undefined });
    setBringLists([]);
    setDialogError(null);
    void loadBring();
  };

  const saveBring = () => {
    if (!bringPicker?.remoteId) return;
    const picker = { ...bringPicker };
    void mutate(async (api) => {
      let localId = picker.localId;
      if (!localId) {
        const remote = bringLists.find(({ id }) => id === picker.remoteId)!;
        const previousIds = new Set(data.lists.map(({ id }) => id));
        const created = await api.createList(remote.name);
        localId = created?.id ?? created?.list?.id;
        // Retain the created id before refreshing so retrying a failed link never creates duplicates.
        if (localId && !controller.current?.signal.aborted) {
          setBringPicker({ ...picker, localId });
          setSelectedId(localId);
        }
        const next = await refresh();
        localId ??= next?.lists.find(({ id, name }) => !previousIds.has(id) && name === remote.name)?.id;
        if (!localId) throw new Error("List created. Close this dialog and refresh, then use Link Bring list on the new list.");
        if (controller.current?.signal.aborted) return;
        setBringPicker({ ...picker, localId });
        setSelectedId(localId);
      }
      await api.updateList(localId, { remoteId: picker.remoteId });
      await refresh();
      if (controller.current?.signal.aborted) return;
      setBringPicker(null);
      try {
        await api.sync(localId);
      } finally {
        // A failed Bring request can still persist the link and an unavailable status.
        await refresh();
      }
    }, () => setBringPicker(null));
  };

  const openEditor = (next: Editor) => {
    setDialogError(null);
    setEditor(next);
  };

  const saveEditor = () => {
    if (!editor?.name.trim()) return;
    const draft = editor;
    void mutate(async (api) => {
      if (draft.kind === "list") {
        if (draft.id) return api.updateList(draft.id, { name: draft.name.trim() });
        return api.createList(draft.name.trim());
      }
      const fields = { name: draft.name.trim(), specification: draft.specification.trim() };
      if (draft.id) return api.updateItem(selectedId, draft.id, fields);
      return api.addItem(selectedId, fields);
    }, () => setEditor(null));
  };

  const lastSynced = selected?.lastSyncedAt ? new Date(selected.lastSyncedAt) : null;
  const remaining = selected?.items.filter(({ checked }) => !checked).length ?? 0;

  return <div className="dashboard-page settings-page">
    <header className="dashboard-header grocery-header" role="banner">
      <div className="header-branding">
        {moduleNavigation}
        <div><h1>Shop &amp; Cook</h1><p>{householdName}</p></div>
      </div>
      <div className="header-meta">
        {onOpenSettings && <button type="button" className="icon-button" onClick={onOpenSettings}
          title="Open settings" aria-label="Open settings"><SettingsIcon fontSize="small" /></button>}
        <div className="avatar-menu-wrapper" ref={avatarMenuRef}>
          <button type="button" className="icon-button user-avatar-button"
            onClick={() => setIsAvatarMenuOpen((current) => !current)}
            title={`${currentUserLabel} · Open account menu`} aria-label={`${currentUserLabel} · Open account menu`}
            aria-expanded={isAvatarMenuOpen} aria-haspopup="menu">{currentUserInitials}</button>
          {isAvatarMenuOpen && <AvatarContextMenu
            currentUserLabel={currentUserLabel} currentUserEmail={currentUserEmail}
            currentUserInitials={currentUserInitials} currentUserAvatarUrl={currentUserAvatarUrl}
            onProfileClick={() => { setIsAvatarMenuOpen(false); onOpenAccountSection("profile"); }}
            onHouseholdsClick={() => { setIsAvatarMenuOpen(false); onOpenAccountSection("households"); }}
            onLogoutClick={() => { setIsAvatarMenuOpen(false); void onSignOut(); }}
          />}
        </div>
      </div>
    </header>
    <Box component="main" className="settings-main" sx={{ gap: 3 }}>
      <section className="settings-card">
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 2 }}>
          <Box><Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>Groceries, together</Typography>
            <Typography color="text.secondary">Keep household shopping in one place. Link an existing Bring list when you’re ready.</Typography></Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <SecondaryButton disabled={disabled || !data.bringConfigured} onClick={() => openBring("import")}>Import from Bring</SecondaryButton>
            <GradientButton startIcon={<AddIcon />} disabled={disabled} onClick={() => openEditor({ kind: "list", name: "" })}>New list</GradientButton>
          </Stack>
        </Stack>
      </section>
      {error && <Alert severity="error" action={<SecondaryButton disabled={disabled} onClick={() => void reload()}>Retry</SecondaryButton>}>{error}</Alert>}
      {loading && <Stack direction="row" sx={{ gap: 1, alignItems: "center" }} role="status"><CircularProgress size={22} />Loading grocery lists…</Stack>}
      {!loading && !data.bringConfigured && <Alert severity="info">Bring is unavailable. You can still create and manage local grocery lists.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(210px, 0.7fr) minmax(0, 2fr)" }, gap: 3 }}>
        <Box component="nav" aria-label="Grocery lists" className="settings-card" sx={{ alignSelf: "start" }}>
          <Typography component="h2" variant="overline">Your lists</Typography>
          <Stack sx={{ gap: 1, mt: 1 }}>
            {data.lists.map((list) => <SecondaryButton key={list.id} disabled={disabled} aria-current={selectedId === list.id ? "true" : undefined}
              onClick={() => setSelectedId(list.id)} sx={{ justifyContent: "space-between", textAlign: "left", border: "1px solid var(--border)",
                bgcolor: selectedId === list.id ? "var(--dialog-field)" : undefined, overflowWrap: "anywhere" }}>
              <span>{list.name}</span><Chip size="small" label={list.items.filter(({ checked }) => !checked).length} sx={{ ml: 1 }} />
            </SecondaryButton>)}
            {!loading && !data.lists.length && <Typography color="text.secondary">No lists yet. Create a list to start shopping.</Typography>}
          </Stack>
        </Box>
        {selected ? <Box component="section" aria-label={`Grocery list ${selected.name}`} className="settings-card" sx={{ minWidth: 0 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "start", gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{selected.name}</Typography>
              <Typography color="text.secondary">{remaining} to buy · {selected.items.length - remaining} checked</Typography>
            </Box>
            <IconButton disabled={disabled} aria-label={`Rename list ${selected.name}`} onClick={() => openEditor({ kind: "list", id: selected.id, name: selected.name })}><EditOutlinedIcon /></IconButton>
          </Stack>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center", mt: 2 }}>
            <Chip label={syncLabel(selected, data.bringConfigured)} size="small" />
            {selected.remoteId ? <>
              <SecondaryButton startIcon={<SyncIcon />} disabled={disabled || !data.bringConfigured} onClick={() => void mutate((api) => api.sync(selected.id))}>Sync now</SecondaryButton>
              <SecondaryButton disabled={disabled} onClick={() => void mutate((api) => api.updateList(selected.id, { remoteId: null }))}>Disconnect Bring</SecondaryButton>
            </> : <SecondaryButton disabled={disabled || !data.bringConfigured} onClick={() => openBring("link")}>Link Bring list</SecondaryButton>}
          </Stack>
          {lastSynced && !Number.isNaN(lastSynced.getTime()) && <Typography variant="caption" color="text.secondary">Last synced: {lastSynced.toLocaleString()}</Typography>}
          {selected.remoteId && selected.syncStatus === "pending" && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Changes are saved locally and waiting to sync with Bring.</Typography>}
          <Box component="ul" sx={{ listStyle: "none", px: 0, my: 2 }}>
            {selected.items.map((item: GroceryItem) => <Stack component="li" direction="row" key={item.id}
              sx={{ py: 1, borderBottom: "1px solid var(--border)", alignItems: "center", gap: 0.5 }}>
              <Checkbox checked={item.checked} disabled={disabled} slotProps={{ input: { "aria-label": `Check ${item.name}` } }}
                onChange={(_, checked) => void mutate((api) => api.updateItem(selected.id, item.id, { checked }))} />
              <Box sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", opacity: item.checked ? 0.65 : 1 }}>
                <Typography sx={{ textDecoration: item.checked ? "line-through" : undefined }}>{item.name}</Typography>
                {item.specification && <Typography variant="body2" color="text.secondary">{item.specification}</Typography>}
              </Box>
              <IconButton disabled={disabled} aria-label={`Edit item ${item.name}`} onClick={() => openEditor({ kind: "item", id: item.id, name: item.name, specification: item.specification ?? "" })}><EditOutlinedIcon fontSize="small" /></IconButton>
              <IconButton disabled={disabled} aria-label={`Remove item ${item.name}`} onClick={() => void mutate((api) => api.removeItem(selected.id, item.id))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Stack>)}
            {!selected.items.length && <Typography component="li" color="text.secondary" sx={{ py: 3 }}>Your list is empty. Add your first grocery item.</Typography>}
          </Box>
          <GradientButton disabled={disabled} startIcon={<AddIcon />} onClick={() => openEditor({ kind: "item", name: "", specification: "" })}>Add item</GradientButton>
        </Box> : !loading && <Box className="settings-card" sx={{ textAlign: "center", py: 6 }}>
          <ShoppingBasketOutlinedIcon sx={{ fontSize: 52, color: "text.secondary" }} />
          <Typography component="h2" variant="h5">A little less “what did we forget?”</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Create a household list or import an existing Bring list.</Typography>
        </Box>}
      </Box>
      <Box role="status" aria-live="polite">{busy ? "Saving grocery changes…" : ""}</Box>
    </Box>
    <GlassDialog open={!!editor} onClose={() => { if (!busy) setEditor(null); }} aria-labelledby="grocery-editor-title" maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={(event) => { event.preventDefault(); saveEditor(); }}>
        <DialogTitle id="grocery-editor-title">{editor?.kind === "list" ? editor.id ? "Rename list" : "New grocery list" : editor?.id ? "Edit grocery item" : "Add grocery item"}</DialogTitle>
        <DialogContentPanel>
          {dialogError && <Alert severity="error">{dialogError}</Alert>}
          <FormField autoFocus label={editor?.kind === "list" ? "List name" : "Item name"} required fullWidth disabled={busy} value={editor?.name ?? ""}
            onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : null)} />
          {editor?.kind === "item" && <FormField label="Quantity or details" fullWidth disabled={busy} value={editor.specification}
            placeholder="e.g. 2 cartons, oat milk" onChange={(event) => setEditor((current) => current?.kind === "item" ? { ...current, specification: event.target.value } : current)} />}
        </DialogContentPanel>
        <DialogActionsBar>
          <SecondaryButton disabled={busy} onClick={() => setEditor(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={busy || !editor?.name.trim()}>Save</GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
    <GlassDialog open={!!bringPicker} onClose={() => { if (!busy) setBringPicker(null); }} aria-labelledby="bring-picker-title" maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={(event) => { event.preventDefault(); saveBring(); }}>
        <DialogTitle id="bring-picker-title">{bringPicker?.mode === "import" ? "Import from Bring" : "Link Bring list"}</DialogTitle>
        <DialogContentPanel>
          <Typography color="text.secondary">Choose an existing Bring list. Import creates a local list and links it; no new Bring list is created.</Typography>
          {bringLoading && <Typography role="status">Loading Bring lists…</Typography>}
          {bringError && <Alert severity="error" action={<SecondaryButton onClick={() => void loadBring()}>Retry</SecondaryButton>}>{bringError}</Alert>}
          {dialogError && <Alert severity="error">{dialogError}</Alert>}
          {!bringLoading && !bringError && !bringLists.length && <Alert severity="info">No Bring lists found. Create a list in Bring first.</Alert>}
          {!!bringLists.length && <FormField select fullWidth label="Bring list" value={bringPicker?.remoteId ?? ""} disabled={busy || bringLoading}
            onChange={(event) => setBringPicker((current) => current ? { ...current, remoteId: event.target.value } : null)}>
            {bringLists.map((list) => <MenuItem key={list.id} value={list.id}>{list.name}</MenuItem>)}
          </FormField>}
        </DialogContentPanel>
        <DialogActionsBar>
          <SecondaryButton disabled={busy} onClick={() => setBringPicker(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={busy || bringLoading || !!bringError || !bringPicker?.remoteId}>{bringPicker?.mode === "import" ? "Import list" : "Link list"}</GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
  </div>;
}
