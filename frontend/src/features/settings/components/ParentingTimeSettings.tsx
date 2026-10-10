import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControl, FormControlLabel, MenuItem, Stack, Typography } from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/de-ch";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { MobileDateTimePicker } from "@mui/x-date-pickers/MobileDateTimePicker";
import {
  DialogActionsBar, DialogContentPanel, DialogHeader, FormField, GlassDialog, GradientButton, SecondaryButton,
} from "../../../shared/ui/GlassFormDialog";
import { DateField, TimeField } from "../../../shared/ui/PickerFields";
import { SettingsInfo } from "./SettingsInfo";

export type ParentingTimeRequest = (path: string, init?: RequestInit) => Promise<unknown>;
type Party = { id: string; name: string; memberId: string | null; active: boolean };
type Rule = {
  id: string; partyId: string; weekday: number; startTime: string; endWeekday: number; endTime: string; weekParity: "odd" | "even" | null;
};
type Handover = {
  id: string; weekday: number; time: string; fromPartyId: string; toPartyId: string; weekParity: "odd" | "even" | null;
};
type Plan = {
  id?: string; effectiveFrom: string; effectiveTo?: string | null; timeZone: string;
  recurrenceMode: "weekly" | "alternating"; rules: Rule[]; handovers?: Handover[]; active: boolean;
};
type Change = { id: string; partyId: string; startAt: string; endAt: string; label: string };
type Interval = { startAt: string; endAt: string; partyId: string; partyName: string | null; source: { type: string; label?: string } };
type Data = { parties: Party[]; plan: Plan | null; changes: Change[] };
const emptyData: Data = { parties: [], plan: null, changes: [] };
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const rangeForPreview = (effectiveFrom?: string) => {
  const start = new Date();
  if (effectiveFrom) {
    const effective = new Date(`${effectiveFrom}T00:00:00`);
    if (effective > start) start.setTime(effective.getTime());
  }
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
};
const defaultHandovers = (parties: Party[]): Handover[] => {
  const active = parties.filter((party) => party.active);
  if (active.length < 2) return [];
  const [first, second] = active;
  return [
    { id: id(), weekday: 1, time: "19:30", fromPartyId: first.id, toPartyId: second.id, weekParity: null },
    { id: id(), weekday: 4, time: "19:30", fromPartyId: second.id, toPartyId: first.id, weekParity: null },
    { id: id(), weekday: 5, time: "17:00", fromPartyId: first.id, toPartyId: second.id, weekParity: "even" },
    { id: id(), weekday: 7, time: "19:30", fromPartyId: second.id, toPartyId: first.id, weekParity: "even" },
  ];
};
const dateTimeInput = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const partyPairValue = (fromPartyId: string, toPartyId: string) => `${fromPartyId}|${toPartyId}`;
const pickerDateTime = (value: string) => value ? dayjs(value) : null;
const dateTimePickerValue = (value: Dayjs | null) => value?.isValid() ? value.format("YYYY-MM-DDTHH:mm") : "";
const toIso = (value: string) => new Date(value).toISOString();
const formatInterval = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));
const periodSummary = (rule: Rule) => {
  const recurrence = rule.weekParity === "odd" ? "Odd ISO weeks"
    : rule.weekParity === "even" ? "Even ISO weeks" : "Every week";
  return `${weekdayNames[rule.weekday - 1]} ${rule.startTime} – ${weekdayNames[rule.endWeekday - 1]} ${rule.endTime}`
    + `${rule.endWeekday < rule.weekday ? " (following week)" : ""} · ${recurrence}`;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : "Parenting-time request failed. Please try again.";
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const recurrenceOptions = [
  { value: "weekly", label: "Every week" },
  { value: "odd", label: "Odd ISO weeks" },
  { value: "even", label: "Even ISO weeks" },
] as const;
const selectMenuProps = {
  slotProps: {
    paper: {
      sx: {
        backgroundColor: "var(--dialog-surface)",
        color: "var(--text-primary)",
        "& .MuiMenuItem-root": { color: "var(--text-primary)" },
        "& .MuiMenuItem-root:hover": { backgroundColor: "var(--dialog-field)" },
      },
    },
  },
};
const dateTimePickerSlotProps = {
  textField: {
    fullWidth: true,
    sx: {
      "& .MuiPickersOutlinedInput-root": {
        minHeight: 52,
        borderRadius: "12px",
        background: "var(--dialog-field)",
        color: "var(--text-primary)",
      },
      "& .MuiInputLabel-root": { color: "var(--dialog-muted)" },
      "& .MuiInputLabel-root.Mui-focused": { color: "var(--accent-strong)" },
      "& .MuiPickersOutlinedInput-notchedOutline": { borderColor: "var(--dialog-border)" },
      "& .MuiPickersOutlinedInput-root:hover .MuiPickersOutlinedInput-notchedOutline": {
        borderColor: "var(--accent-strong)",
      },
      "& .MuiPickersOutlinedInput-root.Mui-focused .MuiPickersOutlinedInput-notchedOutline": {
        borderColor: "var(--accent-strong)",
        boxShadow: "0 0 0 2px rgba(127, 139, 255, 0.2)",
      },
      "& .MuiSvgIcon-root": { color: "var(--text-primary)" },
    },
  },
  mobilePaper: {
    sx: {
      background: "var(--dialog-surface)",
      color: "var(--text-primary)",
      border: "1px solid var(--dialog-border)",
    },
  },
  layout: {
    sx: {
      "& .MuiTypography-root, & .MuiClockNumber-root, & .MuiClockPointer-thumb, & .MuiClock-pin": {
        color: "var(--text-primary)",
      },
      "& .MuiPickersArrowSwitcher-button .MuiSvgIcon-root, & .MuiButton-root, & .MuiIconButton-root .MuiSvgIcon-root": {
        color: "var(--text-primary)",
      },
    },
  },
} as const;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const id = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export function ParentingTimeSettings({ householdId, members, request }: {
  householdId: string; members: Array<{ id: string; firstName: string; isChild?: boolean }>; request: ParentingTimeRequest;
}) {
  const base = `/api/households/${encodeURIComponent(householdId)}/parenting-time`;
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [partyDraft, setPartyDraft] = useState<{ id?: string; name: string; memberId: string; active: boolean } | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState<Plan | null>(null);
  const [preview, setPreview] = useState<Interval[]>([]);
  const [changeDraft, setChangeDraft] = useState<{ id?: string; partyId: string; startAt: string; endAt: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const records = await request(base) as Data;
      setData(records);
      const draft = records.plan ?? {
        effectiveFrom: localDate(new Date()), effectiveTo: null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurrenceMode: "alternating" as const, rules: [], handovers: [], active: true,
      };
      setPlanDraft(draft);
      if (records.plan?.active) {
        const { startAt, endAt } = rangeForPreview(draft.effectiveFrom);
        const resolved = await request(`${base}/resolve?${new URLSearchParams({ startAt, endAt })}`) as { intervals: Interval[] };
        setPreview(resolved.intervals);
      } else setPreview([]);
      setError("");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoading(false);
    }
  }, [base, request]);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const mutate = (resource: string, method: string, body?: unknown) => run(async () => {
    await request(`${base}/${resource}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    setPartyDraft(null);
    setChangeDraft(null);
    await load();
  });
  const activeParties = data.parties.filter((party) => party.active);
  const handovers = planDraft?.handovers ?? [];
  const validHandovers = handovers.length > 0 && handovers.every((handover) =>
    activeParties.some((party) => party.id === handover.fromPartyId)
    && activeParties.some((party) => party.id === handover.toPartyId)
    && handover.fromPartyId !== handover.toPartyId
    && Number.isInteger(handover.weekday) && handover.weekday >= 1 && handover.weekday <= 7
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(handover.time));
  const legacyPeriods = handovers.length === 0 && Boolean(planDraft?.rules.length);
  const validSchedule = planDraft && activeParties.length >= 2 && (validHandovers || legacyPeriods)
    && validDate(planDraft.effectiveFrom)
    && (!planDraft.effectiveTo || (validDate(planDraft.effectiveTo) && planDraft.effectiveTo >= planDraft.effectiveFrom))
    && Boolean(planDraft.timeZone.trim());
  const planPayload = () => planDraft ? {
    ...planDraft,
    recurrenceMode: handovers.length > 0 ? "alternating" as const
      : planDraft.rules.some((rule) => rule.weekParity !== null) ? "alternating" as const : "weekly" as const,
  } : null;
  const previewPlan = () => run(async () => {
    const plan = planPayload();
    if (!plan || !validSchedule) throw new Error("Add recurring handovers between active parenting parties before previewing.");
    const { startAt, endAt } = rangeForPreview(plan.effectiveFrom);
    const result = await request(`${base}/preview`, {
      method: "POST", body: JSON.stringify({ plan, startAt, endAt }),
    }) as { intervals: Interval[] };
    setPreview(result.intervals);
    setPlanDialogOpen(false);
  });
  const savePlan = () => run(async () => {
    const plan = planPayload();
    if (!plan || !validSchedule) throw new Error("Add recurring handovers between active parenting parties before saving.");
    await request(`${base}/plan`, { method: "PUT", body: JSON.stringify(plan) });
    setPlanDialogOpen(false);
    await load();
  });
  const saveParty = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partyDraft || !partyDraft.name.trim()) return;
    void mutate("parties", partyDraft.id ? "PUT" : "POST",
      { ...partyDraft, memberId: partyDraft.memberId || null });
  };
  const saveChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changeDraft) return;
    void mutate("changes", changeDraft.id ? "PUT" : "POST", {
      ...changeDraft, startAt: toIso(changeDraft.startAt), endAt: toIso(changeDraft.endAt),
    });
  };
  const updateHandover = (handoverId: string, changes: Partial<Handover>) => {
    setPlanDraft((current) => current ? {
      ...current,
      handovers: (current.handovers ?? []).map((handover) =>
        handover.id === handoverId ? { ...handover, ...changes } : handover),
    } : current);
    setPreview([]);
  };

  return <Stack spacing={3}>
    {error && <Alert severity="error">{error}</Alert>}
    {loading && <Typography role="status">Loading parenting time…</Typography>}

    <section className="settings-card">
      <div className="section-toolbar"><span className="section-title-info"><h2>Parenting parties</h2>
        <SettingsInfo label="Parenting party information" text="Child background hatching is enabled per child in Members. Active parties linked to current household members count as within the household; active parties with no member link count as outside. Link at least one active party to enable hatching. Unknown periods, stale member links, and archived parties remain unshaded. This is a background cue, not event timing or a change of responsibility." />
      </span>
        <button type="button" className="primary-pill no-wrap-button" disabled={busy}
          onClick={() => setPartyDraft({ name: "", memberId: "", active: true })}>
          <AddCircleOutlineIcon fontSize="small" /> Add party
        </button>
      </div>
      <div className="table-scroll"><table className="settings-table" aria-label="Parenting parties">
        <thead><tr><th>Name</th><th>Household member</th><th>Status</th><th className="actions-column">Actions</th></tr></thead>
        <tbody>{data.parties.map((party) => <tr key={party.id}>
          <td>{party.name}</td><td>{members.find((member) => member.id === party.memberId)?.firstName ?? "Not linked"}</td>
          <td><Chip size="small" label={party.active ? "Active" : "Archived"} /></td>
          <td className="actions-cell"><div className="icon-actions">
            <button type="button" className="icon-button compact-icon-button" disabled={busy}
              aria-label={`Edit parenting party ${party.name}`} title="Edit party" onClick={() =>
                setPartyDraft({ id: party.id, name: party.name, memberId: party.memberId ?? "", active: party.active })}>
              <EditOutlinedIcon fontSize="small" />
            </button>
            <button type="button" className="icon-button compact-icon-button" disabled={busy}
              aria-label={party.active ? `Archive ${party.name}` : `Restore ${party.name}`}
              title={party.active ? "Archive party" : "Restore party"}
              onClick={() => mutate("parties", "PUT",
                { id: party.id, name: party.name, memberId: party.memberId, active: !party.active })}>
              {party.active ? <BlockIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
            </button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <GlassDialog open={!!partyDraft} onClose={() => { if (!busy) setPartyDraft(null); }}
        aria-labelledby="parenting-party-title" maxWidth="sm" fullWidth>
        {partyDraft && <Box component="form" onSubmit={saveParty}>
          <DialogHeader><Typography id="parenting-party-title" variant="h6">
            {partyDraft.id ? "Edit parenting party" : "Add parenting party"}
          </Typography></DialogHeader>
          <DialogContentPanel><Box component="fieldset" disabled={busy}
            sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <FormField autoFocus required label="Party name (for example, Mum or Dad)" value={partyDraft.name}
              onChange={(event) => setPartyDraft({ ...partyDraft, name: event.target.value })} />
            <FormField select label="Link to household member (optional)" value={partyDraft.memberId}
              helperText="Linked active parties count as within the household for opted-in children's background hatching."
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, MenuProps: selectMenuProps } }}
              onChange={(event) => setPartyDraft({ ...partyDraft, memberId: event.target.value })}>
              <MenuItem value="">No linked member</MenuItem>
              {members.map((member) => <MenuItem key={member.id} value={member.id}>{member.firstName}</MenuItem>)}
            </FormField>
          </Box></DialogContentPanel>
          <DialogActionsBar><SecondaryButton variant="outlined" type="button" disabled={busy} onClick={() => setPartyDraft(null)}>Cancel</SecondaryButton>
            <GradientButton type="submit" disabled={busy || !partyDraft.name.trim()}>Save party</GradientButton>
          </DialogActionsBar>
        </Box>}
      </GlassDialog>
    </section>

    <section className="settings-card">
      <div className="section-toolbar"><span className="section-title-info"><h2>Regular parenting-time handovers</h2>
        <SettingsInfo label="Regular handovers information" text="This schedule applies to all children in this household and is for practical planning, not legal advice or proof of custody. Define recurring handovers to show when responsibility changes; parenting periods are resolved between handovers." />
      </span>
        <button type="button" className="primary-pill no-wrap-button" onClick={() => {
          if (!data.plan && planDraft?.handovers?.length === 0 && planDraft) {
            setPlanDraft({ ...planDraft, handovers: defaultHandovers(data.parties) });
          }
          setPlanDialogOpen(true);
        }} disabled={busy || loading}>
          {data.plan ? <EditOutlinedIcon fontSize="small" /> : <AddCircleOutlineIcon fontSize="small" />}
          {data.plan ? "Edit handovers" : "Create schedule"}
        </button>
      </div>
      {data.plan && <Typography variant="body2" sx={{ mt: 1 }}>
        {data.plan.active ? "Active" : "Inactive"} ·
        {" "}from {data.plan.effectiveFrom}{data.plan.effectiveTo ? ` until ${data.plan.effectiveTo}` : ""}
      </Typography>}
      {data.plan?.handovers?.length ? <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="settings-table" aria-label="Regular parenting-time handovers">
          <thead><tr><th>Handover</th><th>From → To</th><th>Repeats</th></tr></thead>
          <tbody>{data.plan.handovers.map((handover) => <tr key={handover.id}>
            <td>{weekdayNames[handover.weekday - 1]} · {handover.time}</td>
            <td>
              {data.parties.find((party) => party.id === handover.fromPartyId)?.name ?? "Archived party"}
              {" → "}
              {data.parties.find((party) => party.id === handover.toPartyId)?.name ?? "Archived party"}
            </td>
            <td>{handover.weekParity === "odd" ? "Odd ISO weeks" : handover.weekParity === "even" ? "Even ISO weeks" : "Every week"}</td>
          </tr>)}</tbody>
        </table>
      </div> : data.plan?.rules.length ? <div className="table-scroll" style={{ marginTop: 12 }}>
        <Typography variant="body2">This saved schedule uses the earlier period format.</Typography>
        <table className="settings-table" aria-label="Regular parenting-time periods">
          <thead><tr><th>Period</th><th>With</th></tr></thead>
          <tbody>{data.plan.rules.map((period) => <tr key={period.id}>
            <td>{periodSummary(period)}</td>
            <td>{data.parties.find((party) => party.id === period.partyId)?.name ?? "Archived party"}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Typography variant="body2" sx={{ mt: 1 }}>No recurring handovers configured.</Typography>}
      <GlassDialog open={planDialogOpen} onClose={() => { if (!busy) setPlanDialogOpen(false); }}
        aria-labelledby="parenting-plan-title" maxWidth="lg" fullWidth>
        {planDraft && <Box component="form" onSubmit={(event) => { event.preventDefault(); void savePlan(); }}>
          <DialogHeader><span className="section-title-info">
            <Typography id="parenting-plan-title" variant="h6">
              {data.plan ? "Edit recurring handovers" : "Create recurring schedule"}
            </Typography>
            <SettingsInfo label="Schedule scope and legal information" text="This plan applies to all children in this household. It describes practical arrangements and is not legal advice or proof of custody." />
          </span></DialogHeader>
          <DialogContentPanel><Box component="fieldset" disabled={busy}
            sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <DateField label="Effective from" value={planDraft.effectiveFrom}
                onChange={(effectiveFrom) => { setPlanDraft({ ...planDraft, effectiveFrom }); setPreview([]); }} required />
              <DateField label="Effective until (optional)" value={planDraft.effectiveTo ?? ""}
                onChange={(effectiveTo) => { setPlanDraft({ ...planDraft, effectiveTo: effectiveTo || null }); setPreview([]); }} />
              <FormField label="Time zone" value={planDraft.timeZone} onChange={(event) => {
                setPlanDraft({ ...planDraft, timeZone: event.target.value }); setPreview([]);
              }} />
            </Stack>
            <FormControlLabel label="Activate this plan" control={<Checkbox checked={planDraft.active} onChange={(event) => {
              setPlanDraft({ ...planDraft, active: event.target.checked }); setPreview([]);
            }} />} />
            <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <span className="section-title-info">
                <Typography variant="subtitle1">Recurring handovers</Typography>
                <SettingsInfo label="Recurring handovers instructions" text="Add at least one handover, and as many as your schedule needs. Each changes responsibility from one party to another. Choose odd or even ISO weeks for alternating handovers; handovers must form a consistent recurring sequence." />
              </span>
              <button type="button" className="primary-pill no-wrap-button" onClick={() => {
                const parties = activeParties;
                const current = planDraft.handovers ?? [];
                const index = current.length;
                const fromPartyId = parties[index % 2 === 0 ? 0 : 1]?.id ?? "";
                const toPartyId = parties[index % 2 === 0 ? 1 : 0]?.id ?? "";
                const defaults = [
                  { weekday: 1, time: "19:30", weekParity: null },
                  { weekday: 4, time: "19:30", weekParity: null },
                  { weekday: 5, time: "17:00", weekParity: "even" as const },
                  { weekday: 7, time: "19:30", weekParity: "even" as const },
                ];
                const next = defaults[index % defaults.length];
                setPlanDraft((current) => current ? {
                  ...current,
                  handovers: [...(current.handovers ?? []), {
                    id: id(), weekday: next.weekday, time: next.time,
                    fromPartyId, toPartyId, weekParity: next.weekParity,
                  }],
                } : current);
                setPreview([]);
              }}><AddCircleOutlineIcon fontSize="small" /> Add handover</button>
            </Stack>
            {planDraft.handovers?.map((handover, index) => <Box key={handover.id} sx={{
              display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr)) auto" },
              alignItems: "center", p: 2, border: "1px solid var(--dialog-border)", borderRadius: 2,
              backgroundColor: "var(--dialog-field)",
            }}>
              <Typography variant="subtitle2" sx={{ color: "var(--text-primary)", gridColumn: { xs: "1", md: "1 / -1" } }}>
                Handover {index + 1}
              </Typography>
              <FormField select label="Weekday" value={handover.weekday}
                slotProps={{ select: { MenuProps: selectMenuProps } }}
                onChange={(event) => updateHandover(handover.id, { weekday: Number(event.target.value) })}>
                {weekdayNames.map((name, day) => <MenuItem key={name} value={day + 1}>{name}</MenuItem>)}
              </FormField>
              <TimeField label="Time" value={handover.time}
                onChange={(time) => updateHandover(handover.id, { time })} />
              <FormField select label="From → To"
                value={partyPairValue(handover.fromPartyId, handover.toPartyId)}
                slotProps={{ select: { MenuProps: selectMenuProps } }}
                onChange={(event) => {
                  const [fromPartyId, toPartyId] = event.target.value.split("|");
                  updateHandover(handover.id, { fromPartyId, toPartyId });
                }}>
                {activeParties.flatMap((fromParty) => activeParties
                  .filter((toParty) => toParty.id !== fromParty.id)
                  .map((toParty) => <MenuItem key={`${fromParty.id}-${toParty.id}`}
                    value={partyPairValue(fromParty.id, toParty.id)}>
                    {fromParty.name} → {toParty.name}
                  </MenuItem>))}
              </FormField>
              <FormField select label="Repeats" value={handover.weekParity ?? "weekly"}
                slotProps={{ select: { MenuProps: selectMenuProps } }}
                onChange={(event) => updateHandover(handover.id, {
                  weekParity: event.target.value === "weekly" ? null : event.target.value as Rule["weekParity"],
                })}>
                {recurrenceOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </FormField>
              <button type="button" className="icon-button compact-icon-button" aria-label={`Remove handover ${index + 1}`}
                title="Remove handover" onClick={() => {
                setPlanDraft((current) => current ? {
                  ...current, handovers: (current.handovers ?? []).filter((item) => item.id !== handover.id),
                } : current);
                setPreview([]);
              }}><DeleteOutlineIcon fontSize="small" /></button>
            </Box>)}
            {planDraft.handovers?.length === 0 && <Alert severity="info">Add recurring handovers to define when responsibility changes.</Alert>}
            {activeParties.length < 2 && <Alert severity="warning">Add at least two active parties before configuring a plan.</Alert>}
            {preview.length > 0 && <div className="table-scroll"><table className="settings-table" aria-label="Parenting-time draft preview">
              <thead><tr><th>From</th><th>Until</th><th>With</th><th>Schedule</th></tr></thead>
              <tbody>{preview.map((interval, index) => <tr key={`${interval.startAt}-${index}`}>
                <td>{formatInterval(interval.startAt)}</td><td>{formatInterval(interval.endAt)}</td><td>{interval.partyName}</td>
                <td>{interval.source.type === "change" ? `Change · ${interval.source.label}` : "Regular plan"}</td>
              </tr>)}</tbody>
            </table></div>}
          </Box></DialogContentPanel>
          <DialogActionsBar>
            <SecondaryButton variant="outlined" type="button" disabled={busy} onClick={() => setPlanDialogOpen(false)}>Cancel</SecondaryButton>
            <SecondaryButton variant="outlined" type="button" disabled={busy || !validSchedule} onClick={() => void previewPlan()}>Preview next 14 days</SecondaryButton>
            <GradientButton type="submit" disabled={busy || !validSchedule}>Save plan</GradientButton>
          </DialogActionsBar>
        </Box>}
      </GlassDialog>
    </section>

    <section className="settings-card">
      <div className="section-toolbar"><span className="section-title-info"><h2>Changes for a period</h2>
        <SettingsInfo label="Parenting-time changes information" text="Holidays, swaps, or special agreements override the regular plan only during the selected time." />
      </span>
        <button type="button" className="primary-pill no-wrap-button"
          disabled={busy || !data.plan?.active || activeParties.length === 0} onClick={() => setChangeDraft({
          partyId: activeParties[0]?.id ?? "", startAt: "", endAt: "", label: "",
        })}><AddCircleOutlineIcon fontSize="small" /> Add change</button>
      </div>
      <div className="table-scroll"><table className="settings-table" aria-label="Parenting-time changes">
        <thead><tr><th>Period</th><th>With</th><th>Reason</th><th className="actions-column">Actions</th></tr></thead>
        <tbody>{data.changes.map((change) => <tr key={change.id}>
          <td>{formatInterval(change.startAt)} – {formatInterval(change.endAt)}</td>
          <td>{data.parties.find((party) => party.id === change.partyId)?.name ?? "Archived party"}</td><td>{change.label}</td>
          <td className="actions-cell"><div className="icon-actions">
            <button type="button" className="icon-button compact-icon-button" aria-label={`Edit change ${change.label}`}
              title="Edit change" onClick={() => setChangeDraft({ id: change.id, partyId: change.partyId,
                startAt: dateTimeInput(change.startAt), endAt: dateTimeInput(change.endAt), label: change.label })}>
              <EditOutlinedIcon fontSize="small" />
            </button>
            <button type="button" className="icon-button compact-icon-button" disabled={busy}
              aria-label={`Remove change ${change.label}`} title="Remove change" onClick={() => void run(async () => {
              await request(`${base}/changes?id=${encodeURIComponent(change.id)}`, { method: "DELETE" });
              await load();
            })}><DeleteOutlineIcon fontSize="small" /></button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="de-ch">
        <GlassDialog open={!!changeDraft} onClose={() => { if (!busy) setChangeDraft(null); }}
          aria-labelledby="parenting-change-title" maxWidth="sm" fullWidth>
        {changeDraft && <Box component="form" onSubmit={saveChange}>
          <DialogHeader><Typography id="parenting-change-title" variant="h6">
            {changeDraft.id ? "Edit change for this period" : "Add change for this period"}
          </Typography></DialogHeader>
          <DialogContentPanel><Box component="fieldset" disabled={busy}
            sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2">This change overrides the regular plan only during the selected period.</Typography>
            <FormField select label="Children with" value={changeDraft.partyId}
              slotProps={{ select: { MenuProps: selectMenuProps } }} onChange={(event) =>
              setChangeDraft({ ...changeDraft, partyId: event.target.value })}>
              {activeParties.map((party) => <MenuItem key={party.id} value={party.id}>{party.name}</MenuItem>)}
            </FormField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth>
                <MobileDateTimePicker label="From" ampm={false} views={["day", "hours", "minutes"]}
                  minutesStep={5} format="DD.MM.YYYY HH:mm" value={pickerDateTime(changeDraft.startAt)}
                  onChange={(value) => setChangeDraft({ ...changeDraft, startAt: dateTimePickerValue(value) })}
                  slotProps={dateTimePickerSlotProps} />
              </FormControl>
              <FormControl fullWidth>
                <MobileDateTimePicker label="Until" ampm={false} views={["day", "hours", "minutes"]}
                  minutesStep={5} format="DD.MM.YYYY HH:mm" value={pickerDateTime(changeDraft.endAt)}
                  onChange={(value) => setChangeDraft({ ...changeDraft, endAt: dateTimePickerValue(value) })}
                  slotProps={dateTimePickerSlotProps} />
              </FormControl>
            </Stack>
            <FormField required label="Reason or agreement" value={changeDraft.label}
              onChange={(event) => setChangeDraft({ ...changeDraft, label: event.target.value })} />
          </Box></DialogContentPanel>
          <DialogActionsBar><SecondaryButton variant="outlined" type="button" disabled={busy} onClick={() => setChangeDraft(null)}>Cancel</SecondaryButton>
            <GradientButton type="submit" disabled={busy || !changeDraft.partyId || !changeDraft.startAt || !changeDraft.endAt
              || !changeDraft.label.trim() || new Date(changeDraft.endAt) <= new Date(changeDraft.startAt)}>
              Save change
            </GradientButton>
          </DialogActionsBar>
        </Box>}
        </GlassDialog>
      </LocalizationProvider>
    </section>
    <section className="settings-card">
      <div className="section-toolbar"><h2>Upcoming schedule preview</h2></div>
      {preview.length ? <div className="table-scroll"><table className="settings-table" aria-label="Parenting-time preview">
        <thead><tr><th>From</th><th>Until</th><th>With</th><th>Schedule</th></tr></thead>
        <tbody>{preview.map((interval, index) => <tr key={`${interval.startAt}-${index}`}>
          <td>{formatInterval(interval.startAt)}</td><td>{formatInterval(interval.endAt)}</td><td>{interval.partyName}</td>
          <td><Chip size="small" label={interval.source.type === "change" ? `Change · ${interval.source.label}` : "Regular plan"} /></td>
        </tr>)}</tbody>
      </table></div> : <Typography variant="body2">
        Preview the schedule to see who the children are with. Changes are always resolved by the server.
      </Typography>}
    </section>
  </Stack>;
}
