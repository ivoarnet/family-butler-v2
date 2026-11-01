import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar, Box, IconButton, Stack, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import type { FamilyMember } from "../../types/family";
import { normalizeMemberColor } from "../../shared/family/memberAvatarColors";
import dayjs from "dayjs";
import { taskColumns, type Task, type TaskStatus } from "./types";

type Destination = { status: TaskStatus; index: number };
type Drag = {
  task: Task; destination: Destination; pointerId?: number; x: number; y: number; valid: boolean;
  preview?: { width: number; offsetX: number; offsetY: number };
};
interface Props {
  tasks: Task[];
  members: FamilyMember[];
  disabled: boolean;
  onMove: (task: Task, status: TaskStatus, beforeId: string | null) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function TaskCardContent({ task, member, actions }: {
  task: Task; member?: FamilyMember; actions?: ReactNode;
}) {
  return <>
    <Stack direction="row" sx={{ alignItems: "start", gap: 1 }}>
      <Typography component="h3" sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{task.title}</Typography>
      <Stack direction="row" role="img" aria-label={`${task.coins} coins`} sx={{ flexShrink: 0, alignItems: "center", gap: 0.5 }}>
        <Box component="img" src={`${import.meta.env.BASE_URL}family-coin.svg`} alt="" draggable={false} width={24} height={24} sx={{ display: "block", objectFit: "contain" }} />
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.coins}</Typography>
      </Stack>
    </Stack>
    <Typography variant="caption" data-task-status-badge={task.id} sx={{ display: "none", "@container dashboard (max-width: 640px)": {
      display: "inline-flex", mt: 0.75, px: 1, py: 0.25, borderRadius: 999, bgcolor: "var(--today-bg)", color: "var(--text-secondary)", fontWeight: 700,
    } }}>
      {taskColumns.find(({ status }) => status === task.status)!.label}
    </Typography>
    <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: 1 }}>
      <Avatar src={member?.avatarPhotoUrl} alt={member?.firstName ?? "Former member"} slotProps={{ img: { draggable: false } }}
        sx={{ bgcolor: normalizeMemberColor(member?.avatarColor), width: 30, height: 30, fontSize: 14 }}>
        {member?.firstName.charAt(0) ?? "?"}
      </Avatar>
      <Typography variant="body2">{member?.firstName ?? "Former member"}</Typography>
    </Stack>
    {(task.dueDate || task.repeatRule !== "none") && <Typography variant="body2" sx={{ mt: 1, color: "var(--text-secondary)" }}>
      {task.dueDate ? `Due ${dayjs(task.dueDate).format("DD.MM.YYYY")}` : ""}{task.repeatRule !== "none" ? ` · Repeats ${task.repeatRule}` : ""}
    </Typography>}
    {actions}
  </>;
}

export function KanbanBoard({ tasks, members, disabled, onMove, onEdit, onDelete }: Props) {
  const board = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const pendingPointer = useRef<Drag | null>(null);
  const pointerTarget = useRef<HTMLElement | null>(null);
  const focusAfterMove = useRef<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const ordered = (status: TaskStatus, exclude?: string) => tasks.filter((task) => task.status === status && task.id !== exclude)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const update = (next: Drag | null) => { dragRef.current = next; setDrag(next); };
  const announce = (next: Drag) => setAnnouncement(`${next.task.title}: ${taskColumns.find((c) => c.status === next.destination.status)!.label}, position ${next.destination.index + 1}.`);
  const releasePointer = () => {
    const pointerId = pendingPointer.current?.pointerId ?? dragRef.current?.pointerId;
    pendingPointer.current = null;
    const target = pointerTarget.current;
    pointerTarget.current = null;
    if (pointerId !== undefined && target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  };
  const cancel = () => { releasePointer(); update(null); setAnnouncement("Move cancelled."); };
  const drop = () => {
    const current = dragRef.current;
    if (!current || disabled || !current.valid) return cancel();
    const beforeId = ordered(current.destination.status, current.task.id)[current.destination.index]?.id ?? null;
    const source = ordered(current.task.status);
    const originalNext = source[source.findIndex((task) => task.id === current.task.id) + 1]?.id ?? null;
    releasePointer();
    update(null);
    if (current.destination.status === current.task.status && beforeId === originalNext) {
      setAnnouncement("Position unchanged.");
      return;
    }
    focusAfterMove.current = current.task.id;
    setAnnouncement(`Saving move for ${current.task.title}.`);
    onMove(current.task, current.destination.status, beforeId);
  };
  const locate = (x: number, y: number) => {
    const current = dragRef.current;
    if (!current || !board.current) return;
    const bounds = board.current.getBoundingClientRect();
    const insideBoard = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    const columns = [...board.current.querySelectorAll<HTMLElement>("[data-task-column]")];
    const column = columns.find((element) => {
      const rect = element.getBoundingClientRect();
      return insideBoard && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    if (!column) { update({ ...current, x, y, valid: false }); return; }
    const status = column.dataset.taskColumn as TaskStatus;
    const cards = [...column.querySelectorAll<HTMLElement>("[data-task-card]")].filter((card) => card.dataset.taskCard !== current.task.id);
    let index = cards.findIndex((card) => { const rect = card.getBoundingClientRect(); return y < rect.top + rect.height / 2; });
    if (index < 0) index = cards.length;
    const next = { ...current, x, y, valid: true, destination: { status, index } };
    update(next);
    if (current.destination.status !== status || current.destination.index !== index) announce(next);
  };
  useEffect(() => {
    if (disabled) { releasePointer(); dragRef.current = null; setDrag(null); }
    else if (focusAfterMove.current) {
      const task = tasks.find((item) => item.id === focusAfterMove.current);
      const card = [...(board.current?.querySelectorAll<HTMLElement>("[data-task-card]") ?? [])]
        .find((item) => item.dataset.taskCard === focusAfterMove.current);
      card?.focus({ preventScroll: true });
      if (task) setAnnouncement(`${task.title}: ${taskColumns.find((column) => column.status === task.status)!.label}.`);
      focusAfterMove.current = null;
    }
  }, [disabled, tasks]);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && (dragRef.current || pendingPointer.current)) cancel(); };
    const blur = () => { if (dragRef.current || pendingPointer.current) cancel(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    return () => { releasePointer(); window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); };
  }, []);
  useEffect(() => {
    if (drag?.pointerId === undefined) return;
    let frame: number;
    const tick = () => {
      const current = dragRef.current;
      const element = board.current;
      if (!current || !element) return;
      const rect = element.getBoundingClientRect();
      const dx = current.x < rect.left + 48 ? -14 : current.x > rect.right - 48 ? 14 : 0;
      const dy = current.y < 70 ? -12 : current.y > window.innerHeight - 70 ? 12 : 0;
      if (dx) element.scrollLeft += dx;
      if (dy) window.scrollBy(0, dy);
      if (dx || dy) locate(current.x, current.y);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  // Drag geometry reads the active session's tasks, never a speculative reordered list.
  }, [drag?.pointerId, tasks]);
  const startPointer = (event: PointerEvent<HTMLElement>, task: Task) => {
    if (disabled || !event.isPrimary || event.button !== 0 || dragRef.current || pendingPointer.current ||
      (event.target as Element).closest("button, a, input, select, textarea, [contenteditable], [role='button']")) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerTarget.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = { task, pointerId: event.pointerId, x: event.clientX, y: event.clientY, valid: true,
      preview: { width: rect.width, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top },
      destination: { status: task.status, index: ordered(task.status).findIndex((item) => item.id === task.id) } };
    pendingPointer.current = next;
  };
  const movePointer = (event: PointerEvent<HTMLElement>) => {
    const pending = pendingPointer.current;
    if (pending?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 6) return;
      pendingPointer.current = null;
      update(pending); announce(pending);
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      event.preventDefault();
      locate(event.clientX, event.clientY);
    }
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>, task: Task) => {
    if (disabled || event.currentTarget !== event.target) return;
    if (pendingPointer.current) {
      if (event.key === "Escape") cancel();
      else if (event.key === "Enter" || event.key === " " || event.key.startsWith("Arrow")) event.preventDefault();
      return;
    }
    const current = dragRef.current;
    if (current?.pointerId !== undefined) {
      if (event.key === "Escape") cancel();
      if (event.key === "Enter" || event.key === " " || event.key.startsWith("Arrow")) event.preventDefault();
      return;
    }
    if (current && current.task.id !== task.id) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (current) drop();
      else {
        const next = { task, x: 0, y: 0, valid: true, destination: { status: task.status, index: ordered(task.status).findIndex((item) => item.id === task.id) } };
        update(next); announce(next);
      }
    } else if (current && event.key === "Escape") { event.preventDefault(); cancel(); }
    else if (current && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const columnIndex = taskColumns.findIndex((column) => column.status === current.destination.status);
      const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const status = taskColumns[Math.max(0, Math.min(2, columnIndex + horizontal))].status;
      const max = ordered(status, task.id).length;
      const index = Math.max(0, Math.min(max, current.destination.index + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0)));
      const next = { ...current, destination: { status, index } };
      update(next); announce(next);
      board.current?.querySelector<HTMLElement>(`[data-task-column="${status}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (current && event.key === "Tab") cancel();
  };
  return <>
    <Typography id="task-drag-help" variant="body2" sx={{ color: "var(--text-secondary)" }}>
      Drag anywhere on a card except its buttons to move or reorder. On touch screens, scroll using lane gaps or backgrounds; drag near the board edge to scroll between lanes. Keyboard: Enter to lift, arrows to position, Enter to drop, Escape to cancel.
    </Typography>
    <Box role="status" aria-live="polite" sx={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)" }}>{announcement}</Box>
    <Box ref={board} aria-label="Task board" sx={{ display: "flex", flex: 1, overflowX: "auto", gap: 2, pb: 2, minWidth: 0, overscrollBehaviorX: "contain",
      "@container dashboard (max-width: 640px)": { flexDirection: "column", overflowX: "hidden", overflowY: "visible" } }}>
      {taskColumns.map(({ status, label }) => {
        const cards = ordered(status);
        const marker = drag?.valid && drag.destination.status === status ? drag.destination.index : -1;
        let position = 0;
        const insertion = (index: number) => marker === index && <Box key={`marker-${index}`} data-insertion-marker role="img" aria-label={`Drop in ${label}, position ${index + 1}`}
          sx={{ height: 4, background: "var(--accent-strong)", borderRadius: 2, my: 0.5 }} />;
        return <Box key={status} component="section" aria-label={label} data-task-column={status}
          data-drop-active={marker >= 0 || undefined}
          className="settings-card" sx={{ flex: "1 0 280px", minWidth: 0, maxWidth: { xs: "85vw", md: "none" }, minHeight: 280,
            "@container dashboard (max-width: 640px)": {
              flex: "0 0 auto", maxWidth: "none", minHeight: "auto",
              order: status === "in_progress" ? 0 : status === "todo" ? 1 : 2,
            },
            boxShadow: marker >= 0 ? "inset 0 0 0 2px var(--accent-strong)" : undefined,
            bgcolor: marker >= 0 ? "var(--today-bg)" : undefined }}>
          <Typography component="h2" variant="h6" sx={{ mb: 2 }}>{label} <Typography component="span" sx={{ color: "var(--text-secondary)" }}>{cards.length}</Typography></Typography>
          <Stack sx={{ gap: 1.5 }}>
            {cards.map((task) => {
              const member = members.find((item) => item.id === task.memberId);
              const isDragging = drag?.task.id === task.id;
              const index = position;
              if (!isDragging) position++;
              return <Box key={task.id}>
                {!isDragging && insertion(index)}
                <Box component="article" aria-label={task.title} data-task-card={task.id} tabIndex={0}
                  aria-describedby="task-drag-help" aria-roledescription="draggable task" aria-disabled={disabled}
                  onPointerDown={(event) => startPointer(event, task)} onPointerMove={movePointer}
                  onPointerUp={(event) => {
                    if (pendingPointer.current?.pointerId === event.pointerId) releasePointer();
                    else if (dragRef.current?.pointerId === event.pointerId) { locate(event.clientX, event.clientY); drop(); }
                  }}
                  onPointerCancel={() => { if (pendingPointer.current || dragRef.current?.pointerId !== undefined) cancel(); }}
                  onLostPointerCapture={() => { if (pointerTarget.current) cancel(); }}
                  onKeyDown={(event) => keyboard(event, task)} onDragStart={(event) => event.preventDefault()}
                  sx={{ p: 1.5, borderRadius: 2, border: "1px solid var(--dialog-border)", bgcolor: "var(--dialog-field)", opacity: isDragging ? 0.25 : 1,
                    touchAction: "none", userSelect: "none", cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
                    "&:focus-visible": { outline: "2px solid var(--accent-strong)", outlineOffset: 2 } }}>
                  <TaskCardContent task={task} member={member} actions={
                  <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                    <IconButton disabled={disabled || !!drag} aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} sx={{ color: "var(--text-primary)", minWidth: 44, minHeight: 44 }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton disabled={disabled || !!drag} aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)} sx={{ color: "var(--text-primary)", minWidth: 44, minHeight: 44 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Stack>
                  } />
                </Box>
              </Box>;
            })}
            {insertion(position)}
            {!cards.length && <Typography sx={{ color: "var(--text-secondary)", py: 4 }}>No tasks. Drop a task here.</Typography>}
          </Stack>
        </Box>;
      })}
    </Box>
    {drag?.preview && createPortal(
      <Box data-task-drag-preview aria-hidden="true" sx={{
        position: "fixed", top: 0, left: 0, zIndex: 1500, pointerEvents: "none",
        width: `${drag.preview.width}px`, boxSizing: "border-box", p: 1.5, borderRadius: 2,
        transform: `translate3d(${drag.x - drag.preview.offsetX}px, ${drag.y - drag.preview.offsetY}px, 0) rotate(2deg)`,
        transformOrigin: "top left", bgcolor: "var(--bg)", color: "var(--text-primary)",
        border: "2px solid var(--accent-strong)", boxShadow: "var(--shadow)",
      }}>
        <TaskCardContent task={drag.task} member={members.find((member) => member.id === drag.task.memberId)} />
      </Box>, document.body,
    )}
  </>;
}
