import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Box, CircularProgress, DialogTitle, MenuItem, Stack, Typography } from "@mui/material";
import { AvatarContextMenu } from "../shared/ui/AvatarContextMenu";
import { DialogActionsBar, DialogContentPanel, FormField, GlassDialog, GradientButton, SecondaryButton } from "../shared/ui/GlassFormDialog";
import { DateField } from "../shared/ui/PickerFields";
import type { FamilyMember } from "../types/family";
import { createTaskClient, TaskRequestError } from "../features/tasks/client";
import { KanbanBoard } from "../features/tasks/KanbanBoard";
import { taskColumns, type Task, type TaskFields, type TaskStatus } from "../features/tasks/types";

interface TasksPageProps {
  householdId: string;
  householdName: string;
  accessToken: string;
  members: FamilyMember[];
  currentUserLabel: string;
  currentUserEmail: string;
  currentUserInitials: string;
  currentUserAvatarUrl: string | null;
  onOpenAccountSection: (section: "profile" | "households") => void;
  onSignOut: () => Promise<void>;
  moduleNavigation?: ReactNode;
}
type Editor = { id: string; task?: Task; fields: TaskFields; status: TaskStatus };
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export function TasksPage(props: TasksPageProps) {
  return <TaskSession key={`${props.householdId}:${props.accessToken}`} {...props} />;
}

function TaskSession({ householdId, householdName, accessToken, members, moduleNavigation,
  currentUserLabel, currentUserEmail, currentUserInitials, currentUserAvatarUrl, onOpenAccountSection, onSignOut }: TasksPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const client = useRef<ReturnType<typeof createTaskClient> | null>(null);
  const busyRef = useRef(false);
  const readVersion = useRef(0);
  const savedRef = useRef(false);

  const refresh = useCallback(async () => {
    const active = controller.current;
    const api = client.current;
    if (!active || !api) return;
    const version = ++readVersion.current;
    const next = await api.read();
    if (active.signal.aborted || version !== readVersion.current) return;
    setTasks(next.tasks);
    setNeedsRefresh(false);
    setEditor((previous) => {
      if (!previous?.task) return previous;
      const task = next.tasks.find((item) => item.id === previous.id);
      return task ? { ...previous, task } : null;
    });
    setDeleting((previous) => previous ? next.tasks.find((item) => item.id === previous.id) ?? null : null);
  }, []);
  const reload = useCallback(async () => {
    const active = controller.current;
    if (!active || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await refresh();
      if (!active.signal.aborted && savedRef.current) { setEditor(null); setDeleting(null); savedRef.current = false; setSaved(false); }
    } catch (failure) {
      if (!active.signal.aborted) { setError(message(failure)); setNeedsRefresh(true); }
    } finally {
      if (!active.signal.aborted) { busyRef.current = false; setLoading(false); }
    }
  }, [refresh]);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    client.current = createTaskClient(householdId, accessToken, active.signal);
    // StrictMode's fresh effect must not inherit the cancelled effect's lock.
    busyRef.current = false;
    void reload();
    return () => { active.abort(); ++readVersion.current; };
  }, [householdId, accessToken, reload]);
  useEffect(() => {
    if (!avatarOpen) return;
    const outside = (event: globalThis.PointerEvent) => { if (!avatarRef.current?.contains(event.target as Node)) setAvatarOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setAvatarOpen(false); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [avatarOpen]);

  const mutate = async (action: (api: ReturnType<typeof createTaskClient>) => Promise<unknown>) => {
    const active = controller.current;
    const api = client.current;
    if (!active || !api || busyRef.current || needsRefresh || savedRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setDialogError(null);
    let accepted = false;
    try {
      await action(api);
      if (active.signal.aborted) return;
      accepted = true;
      savedRef.current = true;
      setSaved(true);
      await refresh();
      if (!active.signal.aborted) {
        setEditor(null); setDeleting(null); savedRef.current = false; setSaved(false);
      }
    } catch (failure) {
      if (active.signal.aborted) return;
      let text = accepted ? "Changes saved, but the board could not refresh. Reload before making more changes." : message(failure);
      if (accepted) setNeedsRefresh(true);
      if (failure instanceof TaskRequestError && failure.status === 409) {
        text = `Task update was rejected: ${message(failure)} The board has been refreshed; review your changes before retrying.`;
        try { await refresh(); } catch { setNeedsRefresh(true); text = `Task update was rejected: ${message(failure)} Reload the board before retrying.`; }
      }
      if (!active.signal.aborted) { setError(text); setDialogError(text); }
    } finally {
      if (!active.signal.aborted) { busyRef.current = false; setBusy(false); }
    }
  };
  const disabled = loading || busy || needsRefresh;
  const openEditor = (task?: Task) => {
    setDialogError(null);
    setEditor({ id: task?.id ?? crypto.randomUUID(), task, status: task?.status ?? "todo", fields: task
      ? { title: task.title, memberId: task.memberId, coins: task.coins, dueDate: task.dueDate, repeatRule: task.repeatRule }
      : { title: "", memberId: members[0]?.id ?? "", coins: 0, dueDate: null, repeatRule: "none" } });
  };
  const change = (fields: Partial<TaskFields>) => setEditor((previous) => previous ? { ...previous, fields: { ...previous.fields, ...fields } } : null);
  const changeStatus = (status: TaskStatus) => setEditor((previous) => previous ? { ...previous, status } : null);
  const save = () => {
    if (!editor) return;
    const fields = { ...editor.fields, title: editor.fields.title.trim() };
    if (!fields.title) return setDialogError("Title is required.");
    if ([...fields.title].length > 160) return setDialogError("Title must be 160 characters or fewer.");
    if (!members.some((member) => member.id === fields.memberId)) return setDialogError("Choose a household member.");
    if (!Number.isSafeInteger(fields.coins) || fields.coins < 0 || fields.coins > 1_000_000) return setDialogError("Coins must be a non-negative whole number up to 1,000,000.");
    if (fields.repeatRule !== "none" && !fields.dueDate) return setDialogError("Repeating tasks require a due date.");
    void mutate((api) => editor.task ? api.edit(editor.task, { ...fields, status: editor.status }) : api.create(editor.id, fields));
  };
  return <div className="dashboard-page settings-page tasks-page">
    <header className="dashboard-header grocery-header" role="banner">
      <div className="header-branding">{moduleNavigation}<div><h1>Tasks</h1><p>{householdName}</p></div></div>
      <div className="header-meta">
        <div className="avatar-menu-wrapper" ref={avatarRef}>
          <button type="button" className="icon-button user-avatar-button" aria-label={`${currentUserLabel} · Open account menu`}
            aria-haspopup="menu" aria-expanded={avatarOpen} onClick={() => setAvatarOpen((value) => !value)}>
            {currentUserAvatarUrl ? <img src={currentUserAvatarUrl} alt="" /> : currentUserInitials}
          </button>
          {avatarOpen && <AvatarContextMenu currentUserLabel={currentUserLabel} currentUserEmail={currentUserEmail}
            currentUserInitials={currentUserInitials} currentUserAvatarUrl={currentUserAvatarUrl}
            onProfileClick={() => { setAvatarOpen(false); onOpenAccountSection("profile"); }}
            onHouseholdsClick={() => { setAvatarOpen(false); onOpenAccountSection("households"); }}
            onLogoutClick={() => { setAvatarOpen(false); void onSignOut(); }} />}
        </div>
      </div>
    </header>
    <Box component="main" className="settings-main" sx={{ minWidth: 0, gap: 2 }}>
      {error && <Alert severity="error" action={<SecondaryButton disabled={loading || busy} onClick={() => void reload()}>Reload board</SecondaryButton>}>{error}</Alert>}
      {loading && <Stack direction="row" role="status" sx={{ gap: 1 }}><CircularProgress size={22} />Loading tasks…</Stack>}
      {busy && <Typography role="status">Saving changes…</Typography>}
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography component="h2" variant="h5">Household board</Typography>
        <GradientButton disabled={disabled} onClick={() => openEditor()}>Add task</GradientButton>
      </Stack>
      {!members.length && <Alert severity="info">Add a household member in settings before assigning tasks.</Alert>}
      <KanbanBoard tasks={tasks} members={members} disabled={disabled || !!editor || !!deleting}
        onMove={(task, status, beforeId) => {
          const current = tasks.find((item) => item.id === task.id);
          if (current && current.revision === task.revision) void mutate((api) => api.move(current, status, beforeId));
        }}
        onEdit={openEditor} onDelete={(task) => { setDialogError(null); setDeleting(task); }} />
    </Box>
    <GlassDialog open={!!editor} onClose={() => { if (!busy && !saved) setEditor(null); }} aria-labelledby="task-editor-title" maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={(event) => { event.preventDefault(); save(); }} noValidate>
        <DialogTitle id="task-editor-title">{editor?.task ? "Edit task" : "Add task"}</DialogTitle>
        <DialogContentPanel>
          {dialogError && <Alert severity="error">{dialogError}</Alert>}
          {needsRefresh && <SecondaryButton disabled={busy || loading} onClick={() => void reload()}>Reload board</SecondaryButton>}
          <FormField autoFocus label="Title" value={editor?.fields.title ?? ""} required disabled={busy || saved}
            onChange={(event) => change({ title: event.target.value })} />
          <FormField select label="Assignee" value={editor?.fields.memberId ?? ""} required disabled={busy || saved || !members.length}
            helperText={!members.length ? "No household members available." : undefined} onChange={(event) => change({ memberId: event.target.value })}>
            {members.map((member) => <MenuItem key={member.id} value={member.id}>{member.firstName}</MenuItem>)}
          </FormField>
          {editor?.task && <FormField select label="Status" value={editor.status} disabled={busy || saved}
            onChange={(event) => changeStatus(event.target.value as TaskStatus)}>
            {taskColumns.map(({ status, label }) => <MenuItem key={status} value={status}>{label}</MenuItem>)}
          </FormField>}
          <FormField label="Coins" type="number" value={editor && Number.isNaN(editor.fields.coins) ? "" : editor?.fields.coins ?? 0} disabled={busy || saved}
            slotProps={{ htmlInput: { min: 0, max: 1_000_000, step: 1 } }} onChange={(event) => change({ coins: event.target.value === "" ? NaN : Number(event.target.value) })} />
          <DateField label="Due date" value={editor?.fields.dueDate ?? ""} disabled={busy || saved}
            onChange={(value) => change({ dueDate: value || null })} />
          <FormField select label="Repeat" value={editor?.fields.repeatRule ?? "none"} disabled={busy || saved || editor?.task?.status === "done"}
            helperText="Repeat cannot be changed after completion; edit the next open occurrence instead."
            onChange={(event) => change({ repeatRule: event.target.value as TaskFields["repeatRule"] })}>
            <MenuItem value="none">Does not repeat</MenuItem><MenuItem value="daily">Daily</MenuItem><MenuItem value="weekly">Weekly</MenuItem>
          </FormField>
          <Typography variant="body2" sx={{ color: "var(--text-secondary)" }}>First completion of a repeating task keeps this card and creates its next dated occurrence. Existing linked occurrences are not changed by edits. Coins are labels only; no account balance is changed.</Typography>
        </DialogContentPanel>
        <DialogActionsBar>
          <SecondaryButton disabled={busy || saved} onClick={() => setEditor(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={disabled || saved || !members.length}>Save task</GradientButton>
        </DialogActionsBar>
      </Box>
    </GlassDialog>
    <GlassDialog open={!!deleting} onClose={() => { if (!busy && !saved) setDeleting(null); }} aria-labelledby="task-delete-title" maxWidth="xs">
      <DialogTitle id="task-delete-title">Delete task?</DialogTitle>
      <DialogContentPanel>
        {dialogError && <Alert severity="error">{dialogError}</Alert>}
        {needsRefresh && <SecondaryButton disabled={busy || loading} onClick={() => void reload()}>Reload board</SecondaryButton>}
        <Typography>Delete “{deleting?.title}”? Other occurrences will remain.</Typography>
      </DialogContentPanel>
      <DialogActionsBar>
        <SecondaryButton disabled={busy || saved} onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
        <GradientButton disabled={disabled || saved} onClick={() => { if (deleting) void mutate((api) => api.remove(deleting)); }}>Delete task</GradientButton>
      </DialogActionsBar>
    </GlassDialog>
  </div>;
}
