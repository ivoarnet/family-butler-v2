import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Stack, Typography } from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import type { FamilyMember } from "../../../types/family";
import { DialogActionsBar, DialogContentPanel, DialogHeader, FormField, GlassDialog, GradientButton, SecondaryButton } from "../../../shared/ui/GlassFormDialog";
import { DateField, TimeField } from "../../../shared/ui/PickerFields";
import { SettingsInfo } from "./SettingsInfo";
import { ProviderCareCalendar } from "./ProviderCareCalendar";

export type ChildcareRequest = (path: string, init?: RequestInit) => Promise<unknown>;
export type ChildcareProvider = { id: string; name: string; type: string; active: boolean };
type Timing = { allDay: boolean; startTime: string | null; endTime: string | null };
export type ChildcareArrangement = Timing & {
  id?: string; providerId: string; childIds: string[]; weekdays: number[]; startDate: string; endDate: string | null;
};
export type ChildcareOverride = Partial<Timing> & {
  arrangementId: string; originalDate: string; action: "add" | "cancel" | "replace" | "move"; movedDate?: string | null; providerId?: string | null;
};
export type ChildcareOccurrence = Timing & {
  id: string; arrangementId: string; originalDate: string; date: string; providerId: string; childIds: string[]; overrideAction: string | null;
};
export type ChildcareData = { providers: ChildcareProvider[]; arrangements: ChildcareArrangement[]; overrides: ChildcareOverride[] };
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const providerTypes = [
  ["grandparent", "Grandparent"], ["individual_carer", "Individual carer"], ["daycare", "Daycare"],
  ["school_programme", "School programme"], ["other", "Other"],
];
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDate(new Date());
const defaultEnd = () => dayjs().add(3, "month").subtract(1, "day").format("YYYY-MM-DD");
const emptyData: ChildcareData = { providers: [], arrangements: [], overrides: [] };
const timingText = (item: Timing) => item.allDay ? "All day" : `${item.startTime}–${item.endTime}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Childcare request failed. Please try again.";
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith("0000")
  && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const validRange = (start: string, end: string) => validDate(start) && validDate(end) && end >= start
  && (Date.parse(end) - Date.parse(start)) / 86400000 < 366;
const validTiming = (item: Timing) => item.allDay || (
  /^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime ?? "") &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(item.endTime ?? "") && item.startTime! < item.endTime!
);
const isScheduled = (arrangement: ChildcareArrangement, date: string) => validDate(date)
  && date >= arrangement.startDate && (!arrangement.endDate || date <= arrangement.endDate)
  && arrangement.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay() || 7);

function TimingFields({ value, onChange, disabled }: { value: Timing; onChange: (value: Timing) => void; disabled: boolean }) {
  return <>
    <FormControlLabel label="All-day care" control={<Checkbox disabled={disabled} checked={value.allDay} onChange={(_, allDay) =>
      onChange({ allDay, startTime: allDay ? null : "09:00", endTime: allDay ? null : "17:00" })} />} />
    {!value.allDay && <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TimeField label="Start time" value={value.startTime ?? ""} onChange={(time) => onChange({ ...value, startTime: time || null })} required />
      <TimeField label="End time" value={value.endTime ?? ""} onChange={(time) => onChange({ ...value, endTime: time || null })} required />
    </Stack>}
  </>;
}

export function ChildcareSettings({ householdId, members, request }: {
  householdId: string; members: FamilyMember[]; request: ChildcareRequest;
}) {
  const base = `/api/households/${encodeURIComponent(householdId)}/childcare`;
  const [data, setData] = useState<ChildcareData>(emptyData);
  const [occurrences, setOccurrences] = useState<ChildcareOccurrence[]>([]);
  const [range, setRange] = useState({ startDate: today(), endDate: defaultEnd() });
  const [loadedRange, setLoadedRange] = useState(range);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [scheduleProviderId, setScheduleProviderId] = useState("");
  const [scheduleView, setScheduleView] = useState("list");
  const scheduleSection = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<{ id?: string; name: string; type: string; active?: boolean } | null>(null);
  const [draft, setDraft] = useState<ChildcareArrangement | null>(null);
  const [preview, setPreview] = useState<ChildcareOccurrence[] | null>(null);
  const [override, setOverride] = useState<(ChildcareOverride & Timing) | null>(null);
  const [addDay, setAddDay] = useState<{ arrangementId: string; date: string } | null>(null);
  const alive = useRef(false);
  const operation = useRef(false);
  const loadVersion = useRef(0);
  const requestedRange = useRef(range);
  const load = useCallback(async (dates: typeof range) => {
    const version = ++loadVersion.current;
    requestedRange.current = dates;
    setLoading(true);
    try {
      const [records, resolved] = await Promise.all([
        request(base),
        request(`${base}/occurrences?${new URLSearchParams(dates)}`),
      ]);
      if (!alive.current || version !== loadVersion.current) return;
      setData(records as ChildcareData);
      setOccurrences((resolved as { occurrences: ChildcareOccurrence[] }).occurrences);
      setLoadedRange(dates);
      setLoadFailed(false);
    } catch (failure) {
      if (alive.current && version === loadVersion.current) {
        setError(errorText(failure));
        setLoadFailed(true);
      }
    } finally {
      if (alive.current && version === loadVersion.current) setLoading(false);
    }
  }, [base, request]);
  useEffect(() => {
    alive.current = true;
    void load({ startDate: today(), endDate: defaultEnd() });
    return () => { alive.current = false; ++loadVersion.current; };
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { if (alive.current) setError(errorText(failure)); }
    finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const mutate = (path: string, method: string, body: unknown, close?: () => void) => run(async () => {
    await request(`${base}/${path}`, { method, body: JSON.stringify(body) });
    if (!alive.current) return;
    close?.();
    await load(loadedRange);
  });
  const disabled = busy || loading;
  const providerName = (id: string) => data.providers.find((item) => item.id === id)?.name ?? id;
  const participantNames = (ids: string[]) => ids.map((id) => members.find((member) => member.id === id)?.firstName ?? id).join(", ");
  const providerOccurrences = occurrences.filter((item) => !scheduleProviderId || item.providerId === scheduleProviderId);
  const changeDraft = (changes: Partial<ChildcareArrangement>) => {
    setDraft((current) => current ? { ...current, ...changes } : current);
    setPreview(null);
  };
  const draftValid = draft && data.providers.some((item) => item.id === draft.providerId)
    && draft.childIds.length > 0 && draft.childIds.every((id) => members.some((member) => member.id === id))
    && draft.weekdays.length > 0 && validDate(draft.startDate)
    && (!draft.endDate || (validDate(draft.endDate) && draft.endDate >= draft.startDate)) && validTiming(draft);
  const cancellations = data.overrides.filter((item) => item.action === "cancel"
    && item.originalDate >= loadedRange.startDate && item.originalDate <= loadedRange.endDate)
    .filter((item) => data.arrangements.some((record) => record.id === item.arrangementId
      && (!scheduleProviderId || record.providerId === scheduleProviderId)));
  const addDayArrangement = addDay
    ? data.arrangements.find((item) => item.id === addDay.arrangementId) ?? null
    : null;
  const addDayError = !addDayArrangement || !validDate(addDay?.date ?? "")
    ? "Choose a valid date."
    : addDay!.date < today() ? "Added care days must be today or in the future."
      : isScheduled(addDayArrangement, addDay!.date) ? "This date is already covered by the arrangement."
        : data.overrides.some((item) => item.arrangementId === addDay!.arrangementId
          && item.originalDate === addDay!.date && item.action === "add")
          ? "An added care day already exists on this date." : "";
  const nextUnscheduledDate = (arrangement: ChildcareArrangement) => {
    const candidateDate = new Date();
    const hasAddedDate = (date: string) => data.overrides.some((item) => item.arrangementId === arrangement.id
      && item.originalDate === date && item.action === "add");
    for (let offset = 0; offset <= data.overrides.length + 7; offset += 1) {
      candidateDate.setDate(candidateDate.getDate() + (offset === 0 ? 0 : 1));
      const candidate = localDate(candidateDate);
      if (candidate >= today() && !isScheduled(arrangement, candidate) && !hasAddedDate(candidate)) return candidate;
    }
    if (arrangement.endDate && arrangement.endDate >= today()) {
      const afterEnd = new Date(`${arrangement.endDate}T00:00:00Z`);
      afterEnd.setUTCDate(afterEnd.getUTCDate() + 1);
      for (let offset = 0; offset <= data.overrides.length; offset += 1) {
        const candidate = afterEnd.toISOString().slice(0, 10);
        if (!hasAddedDate(candidate)) return candidate;
        afterEnd.setUTCDate(afterEnd.getUTCDate() + 1);
      }
    }
    return "";
  };
  const openOverride = (item: ChildcareOccurrence) => {
    if (item.date < today()) return;
    setError("");
    setOverride({
      arrangementId: item.arrangementId, originalDate: item.originalDate,
      action: item.overrideAction === "add" ? "add" : item.overrideAction === "move" ? "move" : "replace",
      movedDate: item.date, providerId: item.providerId, allDay: item.allDay, startTime: item.startTime, endTime: item.endTime,
    });
  };
  const occurrenceList = (items: ChildcareOccurrence[], editable = false) => items.length ? (
    <div className="table-scroll"><table className="settings-table" aria-label={editable ? "Childcare occurrences" : "Childcare preview"}>
      <thead><tr><th>Date</th><th>Provider</th><th>Participants</th><th>Care</th><th>Schedule</th>{editable && <th className="actions-column">Actions</th>}</tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.date}{item.date !== item.originalDate && <div>Originally {item.originalDate}</div>}</td>
        <td>{providerName(item.providerId)}</td><td>{participantNames(item.childIds)}</td><td>{timingText(item)}</td>
        <td><Chip size="small" label={item.overrideAction === "add" ? "Added day" : item.overrideAction ? `Changed · ${item.overrideAction}` : "Recurring"} /></td>
        {editable && <td className="actions-cell">{item.date >= today()
          ? <div className="icon-actions"><button type="button" className="icon-button compact-icon-button" disabled={disabled}
            onClick={() => openOverride(item)} aria-label={`Change care on ${item.date} for ${providerName(item.providerId)}`}
            title="Change occurrence"><EditOutlinedIcon fontSize="small" /></button></div>
          : <Typography variant="body2">History · read only</Typography>}</td>}
      </tr>)}</tbody>
    </table></div>
  ) : <Typography>No care occurrences in this range.</Typography>;

  return <Stack spacing={3}>
    <div className="section-title-info">
      <Typography variant="h5" component="h2">Childcare</Typography>
      <SettingsInfo label="Childcare information" text="Manage recurring care separately from calendar events. One-off changes affect only the selected occurrence." />
    </div>
    {error && <Alert severity="error" action={!provider && !draft && !override ? <Button disabled={disabled} onClick={() => {
      setError(""); void load(requestedRange.current);
    }}>Retry</Button> : undefined}>{error}</Alert>}
    {loading && <Typography role="status">Loading childcare…</Typography>}
    <section className="settings-card">
      <div className="section-toolbar">
        <span className="section-title-info"><h2>Providers</h2>
          <SettingsInfo label="Providers information" text="Inactive providers are hidden from new care choices. Deactivation keeps existing recurring care and history; existing assignments remain valid." />
        </span>
        <button type="button" className="primary-pill no-wrap-button" aria-label="Add provider" disabled={disabled}
          onClick={() => { setError(""); setProvider({ name: "", type: "grandparent" }); }}>
          <AddCircleOutlineIcon fontSize="small" /> Provider
        </button>
      </div>
      {!loading && !data.providers.length && <Typography>No providers yet. Add a provider before creating an arrangement.</Typography>}
      {!!data.providers.length && <div className="table-scroll"><table className="settings-table" aria-label="Childcare providers">
        <thead><tr><th>Name</th><th>Type</th><th>Status</th><th className="actions-column">Actions</th></tr></thead>
        <tbody>{data.providers.map((item) => <tr key={item.id}>
          <td>{item.name}</td><td>{providerTypes.find(([value]) => value === item.type)?.[1] ?? item.type}</td>
          <td>{item.active ? "Active" : "Inactive"}</td>
          <td className="actions-cell"><div className="icon-actions">
            <button type="button" className="icon-button compact-icon-button" disabled={disabled}
              aria-label={`View schedule for ${item.name}`} title="View schedule" onClick={() => {
                setScheduleProviderId(item.id);
                scheduleSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}><CalendarMonthIcon fontSize="small" /></button>
            <button type="button" className="icon-button compact-icon-button" disabled={disabled}
              aria-label={`Edit provider ${item.name}`} title="Edit provider" onClick={() => { setError(""); setProvider(item); }}>
              <EditOutlinedIcon fontSize="small" />
            </button>
            <button type="button" className="icon-button compact-icon-button" disabled={disabled}
              aria-label={item.active ? "Deactivate" : "Reactivate"} title={item.active ? "Deactivate" : "Reactivate"}
              onClick={() => void mutate("providers", "PUT", { ...item, active: !item.active })}>
              {item.active ? <BlockIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
            </button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section className="settings-card">
      <div className="section-toolbar">
        <h2>Weekly arrangements</h2>
        <button type="button" className="primary-pill no-wrap-button" aria-label="Add arrangement"
          disabled={disabled || !members.length || !data.providers.some((item) => item.active)} onClick={() => {
          setError(""); setPreview(null);
          setDraft({ providerId: data.providers.find((item) => item.active)!.id, childIds: [], weekdays: [],
            allDay: true, startTime: null, endTime: null, startDate: today(), endDate: null });
        }}><AddCircleOutlineIcon fontSize="small" /> Arrangement</button>
      </div>
      {!loading && !data.arrangements.length && <Typography>No weekly arrangements yet.</Typography>}
      {!!data.arrangements.length && <div className="table-scroll"><table className="settings-table" aria-label="Childcare arrangements">
        <thead><tr><th>Provider</th><th>Participants</th><th>Weekdays</th><th>Care</th><th>Effective dates</th><th className="actions-column">Actions</th></tr></thead>
        <tbody>{data.arrangements.map((item) => <tr key={item.id}>
          <td>{providerName(item.providerId)}</td><td>{participantNames(item.childIds)}</td>
          <td>{item.weekdays.map((day) => weekdays[day - 1]).join(", ")}</td><td>{timingText(item)}</td>
          <td>{item.startDate} – {item.endDate ?? "Ongoing"}</td>
          <td className="actions-cell"><div className="icon-actions">
            <button type="button" className="icon-button compact-icon-button" disabled={disabled || !nextUnscheduledDate(item)}
              aria-label={`Add care day to arrangement for ${providerName(item.providerId)}`} title="Add care day" onClick={() => {
              setError("");
              setAddDay({ arrangementId: item.id!, date: nextUnscheduledDate(item) });
            }}><AddCircleOutlineIcon fontSize="small" /></button>
            <button type="button" className="icon-button compact-icon-button"
              disabled={disabled} aria-label={`Edit arrangement for ${providerName(item.providerId)}`} title="Edit arrangement" onClick={() => {
              setError(""); setDraft(item); setPreview(null);
            }}><EditOutlinedIcon fontSize="small" /></button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section className="settings-card" ref={scheduleSection}>
      <div className="section-toolbar"><span className="section-title-info"><h2>Resolved care</h2>
        <SettingsInfo label="Resolved care information" text="One-off changes are available for today and upcoming care dates only. Past care is read-only." />
      </span></div>
      <Typography variant="h6" component="h3">Provider schedule</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ my: 2 }}>
        <FormField select label="Schedule provider" value={scheduleProviderId} disabled={disabled}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          onChange={(event) => setScheduleProviderId(event.target.value)}>
          <MenuItem value="">All providers</MenuItem>
          {data.providers.map((item) => <MenuItem key={item.id} value={item.id}>
            {item.name}{!item.active && " (Inactive)"}
          </MenuItem>)}
        </FormField>
        <FormField select label="Schedule view" value={scheduleView} onChange={(event) => setScheduleView(event.target.value)}>
          <MenuItem value="list">List</MenuItem>
          <MenuItem value="calendar">Calendar</MenuItem>
        </FormField>
      </Stack>
      <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ my: 2 }} onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && validRange(range.startDate, range.endDate)) { setError(""); void load(range); }
      }}>
        <DateField label="Range start" value={range.startDate} disabled={disabled}
          onChange={(startDate) => { setRange({ ...range, startDate }); setPreview(null); }} />
        <DateField label="Range end" value={range.endDate} disabled={disabled}
          onChange={(endDate) => { setRange({ ...range, endDate }); setPreview(null); }} />
        <button type="submit" className="primary-pill no-wrap-button" disabled={disabled || !validRange(range.startDate, range.endDate)}>Show care</button>
      </Stack>
      {!validRange(range.startDate, range.endDate) && <Alert severity="warning">Choose an ordered range of at most 366 days.</Alert>}
      <Typography variant="body2">Showing {loadedRange.startDate} – {loadedRange.endDate}</Typography>
      {loading && <Typography role="status">Loading provider schedule…</Typography>}
      {!loading && loadFailed && <Alert severity="error">Provider schedule could not be loaded. Use Retry above to reload.</Alert>}
      {!loading && !loadFailed && (scheduleView === "list" ? occurrenceList(providerOccurrences, true) :
        <ProviderCareCalendar occurrences={providerOccurrences} startDate={loadedRange.startDate} endDate={loadedRange.endDate}
          providerName={providerName} participantNames={participantNames} />)}
      <Typography variant="h6" component="h3" sx={{ mt: 2 }}>Cancellations</Typography>
      {!loading && !loadFailed && (cancellations.length ? <Stack spacing={1}>{cancellations.map((item) => {
        const arrangement = data.arrangements.find((record) => record.id === item.arrangementId)!;
        return <Typography key={`${item.arrangementId}:${item.originalDate}`}>
          {item.originalDate} · {providerName(arrangement.providerId)} · {participantNames(arrangement.childIds)} · {isScheduled(arrangement, item.originalDate) ? "Cancelled" : "Added day removed"}
        </Typography>;
      })}</Stack> : <Typography>No cancellations in this range.</Typography>)}
    </section>

    <GlassDialog open={!!provider} onClose={() => { if (!busy) setProvider(null); }} aria-labelledby="childcare-provider-title" maxWidth="sm" fullWidth>
      {provider && <Box component="form" onSubmit={(event) => {
        event.preventDefault();
        if (!provider.name.trim()) return;
        void mutate("providers", provider.id ? "PUT" : "POST",
          { name: provider.name.trim(), type: provider.type, ...(provider.id ? { id: provider.id, active: provider.active ?? true } : {}) },
          () => setProvider(null));
      }}>
        <DialogHeader><Typography id="childcare-provider-title" variant="h6">{provider.id ? "Edit provider" : "Add provider"}</Typography></DialogHeader>
        <DialogContentPanel><Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormField autoFocus label="Provider name" value={provider.name} required onChange={(event) => setProvider({ ...provider, name: event.target.value })} />
          <FormField select disabled={busy} label="Provider type" value={provider.type} onChange={(event) => setProvider({ ...provider, type: event.target.value })}>
            {providerTypes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </FormField>
        </Box></DialogContentPanel>
        <DialogActionsBar><SecondaryButton variant="outlined" disabled={busy} onClick={() => setProvider(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={busy || !provider.name.trim()}>Save provider</GradientButton></DialogActionsBar>
      </Box>}
    </GlassDialog>
    <GlassDialog open={!!draft} onClose={() => { if (!busy) setDraft(null); }} aria-labelledby="childcare-arrangement-title" maxWidth="md" fullWidth>
      {draft && <Box component="form" onSubmit={(event) => {
        event.preventDefault();
        if (!draftValid || preview === null) return;
        const { id, ...body } = draft;
        void mutate("arrangements", id ? "PUT" : "POST", id ? { id, ...body } : body,
          () => { setDraft(null); setPreview(null); });
      }}>
        <DialogHeader><Typography id="childcare-arrangement-title" variant="h6">{draft.id ? "Edit arrangement" : "Add arrangement"}</Typography></DialogHeader>
        <DialogContentPanel><Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormField select disabled={busy} label="Care provider" value={draft.providerId} onChange={(event) => changeDraft({ providerId: event.target.value })}>
            {data.providers.filter((item) => item.active || item.id === draft.providerId).map((item) =>
              <MenuItem key={item.id} value={item.id}>{item.name}{!item.active ? " (inactive)" : ""}</MenuItem>)}
          </FormField>
          <Box><Typography component="h3">Participating children / household members</Typography>
            {members.map((member) => <FormControlLabel key={member.id} label={member.firstName} control={
              <Checkbox disabled={busy} checked={draft.childIds.includes(member.id)} onChange={(_, checked) => changeDraft({
                childIds: checked ? [...draft.childIds, member.id] : draft.childIds.filter((id) => id !== member.id),
              })} />
            } />)}
          </Box>
          <Box><Typography component="h3">Weekly care days (Monday = 1)</Typography>
            {weekdays.map((label, index) => <FormControlLabel key={label} label={label} control={
              <Checkbox disabled={busy} checked={draft.weekdays.includes(index + 1)} onChange={(_, checked) => changeDraft({
                weekdays: checked ? [...draft.weekdays, index + 1].sort((a, b) => a - b) : draft.weekdays.filter((day) => day !== index + 1),
              })} />
            } />)}
          </Box>
          <TimingFields value={draft} onChange={changeDraft} disabled={busy} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <DateField label="Effective start" required value={draft.startDate}
              onChange={(startDate) => changeDraft({ startDate })} />
            <DateField label="Effective end (optional)" value={draft.endDate ?? ""}
              onChange={(endDate) => changeDraft({ endDate: endDate || null })} />
          </Stack>
          {!draftValid && <Typography color="error">Select a provider, at least one participant and weekday, and valid dates and times.</Typography>}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <DateField label="Preview start" value={range.startDate}
              onChange={(startDate) => { setRange({ ...range, startDate }); setPreview(null); }} />
            <DateField label="Preview end" value={range.endDate}
              onChange={(endDate) => { setRange({ ...range, endDate }); setPreview(null); }} />
          </Stack>
          {!validRange(range.startDate, range.endDate) && <Alert severity="warning">Choose an ordered preview range of at most 366 days.</Alert>}
          <Typography>Preview {range.startDate} – {range.endDate} with persisted one-off changes before saving.</Typography>
          {draft.id && <Typography variant="body2">
            Weekdays and effective dates must still include every original occurrence with a saved one-off change, including cancellations and moved care. Preview or save will explain any conflicting change; overrides are never silently removed.
          </Typography>}
          <Button disabled={busy || !draftValid || !validRange(range.startDate, range.endDate)} onClick={() => void run(async () => {
            const result = await request(`${base}/preview`, { method: "POST", body: JSON.stringify({ arrangement: draft, ...range }) });
            if (alive.current) setPreview((result as { occurrences: ChildcareOccurrence[] }).occurrences);
          })}>Preview care</Button>
          {preview !== null && <Box><Typography variant="h6" component="h3">Preview results</Typography>{occurrenceList(preview)}</Box>}
        </Box></DialogContentPanel>
        <DialogActionsBar><SecondaryButton variant="outlined" disabled={busy} onClick={() => setDraft(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={busy || !draftValid || preview === null}>Save arrangement</GradientButton></DialogActionsBar>
      </Box>}
    </GlassDialog>
    <GlassDialog open={!!override} onClose={() => { if (!busy) setOverride(null); }} aria-labelledby="childcare-override-title" maxWidth="sm" fullWidth>
      {override && <Box component="form" onSubmit={(event) => {
        event.preventDefault();
        if (override.action !== "cancel" && (!validTiming(override) || (override.action === "move" &&
          (!validDate(override.movedDate ?? "") || override.movedDate === override.originalDate)))) return;
        const body: ChildcareOverride = { arrangementId: override.arrangementId, originalDate: override.originalDate, action: override.action };
        if (override.action !== "cancel") Object.assign(body, { providerId: override.providerId, allDay: override.allDay, startTime: override.startTime, endTime: override.endTime });
        if (override.action === "move") body.movedDate = override.movedDate;
        void mutate("overrides", "PUT", body, () => setOverride(null));
      }}>
        <DialogHeader><Typography id="childcare-override-title" variant="h6">Change one occurrence</Typography></DialogHeader>
        <DialogContentPanel><Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>{override.action === "add" ? `Added care date: ${override.originalDate}. Weekly care remains unchanged.`
            : `Original scheduled date: ${override.originalDate}. Weekly care remains unchanged.`}</Typography>
          {override.action === "move" && <Typography>Effective care date: {override.movedDate || "Choose a moved date"}.</Typography>}
          <Typography>Participants: {participantNames(data.arrangements.find((item) => item.id === override.arrangementId)?.childIds ?? [])}</Typography>
          <FormField select disabled={busy} label="One-off action" value={override.action} onChange={(event) => setOverride({ ...override, action: event.target.value as ChildcareOverride["action"] })}>
            {override.action === "add" && <MenuItem value="add">Keep added care day</MenuItem>}
            <MenuItem value="cancel">Cancel care</MenuItem>
            {override.action !== "add" && <><MenuItem value="replace">Replace provider / time</MenuItem><MenuItem value="move">Move care date</MenuItem></>}
          </FormField>
          {override.action === "move" && <DateField label="Moved date" required value={override.movedDate ?? ""}
            onChange={(movedDate) => setOverride({ ...override, movedDate })} />}
          {override.action !== "cancel" && <>
            <FormField select disabled={busy} label="Occurrence provider" value={override.providerId ?? ""} onChange={(event) => setOverride({ ...override, providerId: event.target.value })}>
              {data.providers.filter((item) => item.active || item.id === override.providerId).map((item) =>
                <MenuItem key={item.id} value={item.id}>{item.name}{!item.active ? " (inactive)" : ""}</MenuItem>)}
            </FormField>
            <TimingFields value={override} onChange={(timing) => setOverride({ ...override, ...timing })} disabled={busy} />
          </>}
        </Box></DialogContentPanel>
        <DialogActionsBar><SecondaryButton variant="outlined" disabled={busy} onClick={() => setOverride(null)}>Close</SecondaryButton>
          <GradientButton type="submit" disabled={busy || (override.action !== "cancel" && (!validTiming(override) ||
            (override.action === "move" && (!validDate(override.movedDate ?? "") || override.movedDate === override.originalDate))))}>
            {override.action === "add" ? "Save added care day" : "Save one-off change"}
          </GradientButton></DialogActionsBar>
      </Box>}
    </GlassDialog>
    <GlassDialog open={!!addDay} onClose={() => { if (!busy) setAddDay(null); }}
      aria-labelledby="childcare-add-day-title" maxWidth="sm" fullWidth>
      {addDay && addDayArrangement && <Box component="form" onSubmit={(event) => {
        event.preventDefault();
        if (disabled || addDayError) return;
        void mutate("overrides", "PUT", {
          arrangementId: addDay.arrangementId, originalDate: addDay.date, action: "add",
        }, () => setAddDay(null));
      }}>
        <DialogHeader><Typography id="childcare-add-day-title" variant="h6">Add childcare day</Typography></DialogHeader>
        <DialogContentPanel><Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>Using {providerName(addDayArrangement.providerId)} for {participantNames(addDayArrangement.childIds)} · {timingText(addDayArrangement)}. The weekly arrangement stays unchanged.</Typography>
          <DateField autoFocus label="Added care date" required value={addDay.date}
            onChange={(date) => setAddDay({ ...addDay, date })} />
          {addDayError && <Typography role="alert" color="error">{addDayError}</Typography>}
        </Box></DialogContentPanel>
        <DialogActionsBar><SecondaryButton variant="outlined" disabled={busy} onClick={() => setAddDay(null)}>Cancel</SecondaryButton>
          <GradientButton type="submit" disabled={busy || Boolean(addDayError)}>Add childcare day</GradientButton>
        </DialogActionsBar>
      </Box>}
    </GlassDialog>
  </Stack>;
}
