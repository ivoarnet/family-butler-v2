import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Avatar, Box, IconButton, Stack, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import MonetizationOnOutlinedIcon from "@mui/icons-material/MonetizationOnOutlined";
import type { FamilyMember } from "../../types/family";
import { normalizeMemberColor } from "../../shared/family/memberAvatarColors";
import dayjs from "dayjs";
import { taskColumns, type Task, type TaskStatus } from "./types";

type Destination = { status: TaskStatus; index: number };
type Drag = { task: Task; destination: Destination; pointerId?: number; x: number; y: number; valid: boolean };
interface Props {
  tasks: Task[];
  members: FamilyMember[];
  disabled: boolean;
  onMove: (task: Task, status: TaskStatus, beforeId: string | null) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function KanbanBoard({ tasks, members, disabled, onMove, onEdit, onDelete }: Props) {
  const board = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const focusAfterMove = useRef<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const ordered = (status: TaskStatus, exclude?: string) => tasks.filter((task) => task.status === status && task.id !== exclude)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const update = (next: Drag | null) => { dragRef.current = next; setDrag(next); };
  const announce = (next: Drag) => setAnnouncement(`${next.task.title}: ${taskColumns.find((c) => c.status === next.destination.status)!.label}, position ${next.destination.index + 1}.`);
  const cancel = () => { update(null); setAnnouncement("Move cancelled."); };
  const drop = () => {
    const current = dragRef.current;
    if (!current || disabled || !current.valid) return cancel();
    const beforeId = ordered(current.destination.status, current.task.id)[current.destination.index]?.id ?? null;
    const source = ordered(current.task.status);
    const originalNext = source[source.findIndex((task) => task.id === current.task.id) + 1]?.id ?? null;
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
    if (disabled) { dragRef.current = null; setDrag(null); }
    else if (focusAfterMove.current) {
      const task = tasks.find((item) => item.id === focusAfterMove.current);
      const card = [...(board.current?.querySelectorAll<HTMLElement>("[data-task-card]") ?? [])]
        .find((item) => item.dataset.taskCard === focusAfterMove.current);
      card?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      if (task) setAnnouncement(`${task.title}: ${taskColumns.find((column) => column.status === task.status)!.label}.`);
      focusAfterMove.current = null;
    }
  }, [disabled, tasks]);
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
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    const blur = () => cancel();
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", escape); window.removeEventListener("blur", blur); };
  // Drag geometry reads the active session's tasks, never a speculative reordered list.
  }, [drag?.pointerId, tasks]);
  const startPointer = (event: PointerEvent<HTMLButtonElement>, task: Task) => {
    if (disabled || !event.isPrimary || event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { task, pointerId: event.pointerId, x: event.clientX, y: event.clientY, valid: true,
      destination: { status: task.status, index: ordered(task.status).findIndex((item) => item.id === task.id) } };
    update(next); announce(next);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, task: Task) => {
    if (disabled) return;
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
      Drag the handle to move or reorder. Keyboard: Enter to lift, arrows to position, Enter to drop, Escape to cancel.
    </Typography>
    <Box role="status" aria-live="polite" sx={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)" }}>{announcement}</Box>
    <Box ref={board} aria-label="Task board" sx={{ display: "flex", overflowX: "auto", gap: 2, pb: 2, minWidth: 0, overscrollBehaviorX: "contain" }}>
      {taskColumns.map(({ status, label }) => {
        const cards = ordered(status);
        const marker = drag?.valid && drag.destination.status === status ? drag.destination.index : -1;
        let position = 0;
        const insertion = (index: number) => marker === index && <Box key={`marker-${index}`} data-insertion-marker role="img" aria-label={`Drop in ${label}, position ${index + 1}`}
          sx={{ height: 4, background: "var(--accent-strong)", borderRadius: 2, my: 0.5 }} />;
        return <Box key={status} component="section" aria-label={label} data-task-column={status}
          className="settings-card" sx={{ flex: "1 0 280px", minWidth: 0, maxWidth: { xs: "85vw", md: "none" }, minHeight: 280 }}>
          <Typography component="h2" variant="h6" sx={{ mb: 2 }}>{label} <Typography component="span" sx={{ color: "var(--text-secondary)" }}>{cards.length}</Typography></Typography>
          <Stack sx={{ gap: 1.5 }}>
            {cards.map((task) => {
              const member = members.find((item) => item.id === task.memberId);
              const isDragging = drag?.task.id === task.id;
              const index = position;
              if (!isDragging) position++;
              return <Box key={task.id}>
                {!isDragging && insertion(index)}
                <Box component="article" aria-label={task.title} data-task-card={task.id}
                  sx={{ p: 1.5, borderRadius: 2, border: "1px solid var(--dialog-border)", bgcolor: "var(--dialog-field)", opacity: isDragging ? 0.5 : 1 }}>
                  <Stack direction="row" sx={{ alignItems: "start", gap: 1 }}>
                    <IconButton aria-label={`Move ${task.title}`} aria-describedby="task-drag-help" aria-pressed={isDragging}
                      disabled={disabled} sx={{ touchAction: "none", cursor: isDragging ? "grabbing" : "grab", color: "var(--text-primary)", minWidth: 44, minHeight: 44 }}
                      onPointerDown={(event) => startPointer(event, task)}
                      onPointerMove={(event) => { if (dragRef.current?.pointerId === event.pointerId) locate(event.clientX, event.clientY); }}
                      onPointerUp={(event) => {
                        if (dragRef.current?.pointerId === event.pointerId) { locate(event.clientX, event.clientY); drop(); }
                      }}
                      onPointerCancel={cancel} onLostPointerCapture={() => { if (dragRef.current?.pointerId !== undefined) cancel(); }}
                      onKeyDown={(event) => keyboard(event, task)} onClick={(event) => event.preventDefault()}>
                      <DragIndicatorIcon />
                    </IconButton>
                    <Typography component="h3" sx={{ fontWeight: 700, flex: 1, overflowWrap: "anywhere", pt: 1 }}>{task.title}</Typography>
                  </Stack>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: 1 }}>
                    <Avatar src={member?.avatarPhotoUrl} alt={member?.firstName ?? "Former member"}
                      sx={{ bgcolor: normalizeMemberColor(member?.avatarColor), width: 30, height: 30, fontSize: 14 }}>
                      {member?.firstName.charAt(0) ?? "?"}
                    </Avatar>
                    <Typography variant="body2">{member?.firstName ?? "Former member"}</Typography>
                    <Stack direction="row" role="img" aria-label={`${task.coins} coins`} sx={{ ml: "auto", alignItems: "center", gap: 0.5 }}>
                      <MonetizationOnOutlinedIcon fontSize="small" />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.coins}</Typography>
                    </Stack>
                  </Stack>
                  {(task.dueDate || task.repeatRule !== "none") && <Typography variant="body2" sx={{ mt: 1, color: "var(--text-secondary)" }}>
                    {task.dueDate ? `Due ${dayjs(task.dueDate).format("DD.MM.YYYY")}` : ""}{task.repeatRule !== "none" ? ` · Repeats ${task.repeatRule}` : ""}
                  </Typography>}
                  <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                    <IconButton disabled={disabled || !!drag} aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} sx={{ color: "var(--text-primary)", minWidth: 44, minHeight: 44 }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton disabled={disabled || !!drag} aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)} sx={{ color: "var(--text-primary)", minWidth: 44, minHeight: 44 }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Stack>
                </Box>
              </Box>;
            })}
            {insertion(position)}
            {!cards.length && <Typography sx={{ color: "var(--text-secondary)", py: 4 }}>No tasks. Drop a task here.</Typography>}
          </Stack>
        </Box>;
      })}
    </Box>
  </>;
}
