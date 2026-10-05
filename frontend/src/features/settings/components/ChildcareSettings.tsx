import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Stack, Typography } from "@mui/material";
import type { FamilyMember } from "../../../types/family";
import { DialogActionsBar, DialogContentPanel, DialogHeader, FormField, GlassDialog, GradientButton } from "../../../shared/ui/GlassFormDialog";

export type ChildcareRequest = (path: string, init?: RequestInit) => Promise<unknown>;
export type ChildcareProvider = { id: string; name: string; type: string; active: boolean };
type Timing = { allDay: boolean; startTime: string | null; endTime: string | null };
export type ChildcareArrangement = Timing & {
  id?: string; providerId: string; childIds: string[]; weekdays: number[]; startDate: string; endDate: string | null;
};
export type ChildcareOverride = Partial<Timing> & {
  arrangementId: string; originalDate: string; action: "cancel" | "replace" | "move"; movedDate?: string | null; providerId?: string | null;
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
const defaultEnd = () => {
  const end = new Date();
  end.setDate(end.getDate() + 27);
  return localDate(end);
};
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

function TimingFields({ value, onChange, disabled }: { value: Timing; onChange: (value: Timing) => void; disabled: boolean }) {
  return <>
    <FormControlLabel label="All-day care" control={<Checkbox disabled={disabled} checked={value.allDay} onChange={(_, allDay) =>
      onChange({ allDay, startTime: allDay ? null : "09:00", endTime: allDay ? null : "17:00" })} />} />
    {!value.allDay && <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <FormField label="Start time" type="time" value={value.startTime ?? ""} slotProps={{ inputLabel: { shrink: true } }}
        onChange={(event) => onChange({ ...value, startTime: event.target.value })} required />
      <FormField label="End time" type="time" value={value.endTime ?? ""} slotProps={{ inputLabel: { shrink: true } }}
        onChange={(event) => onChange({ ...value, endTime: event.target.value })} required />
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<{ id?: string; name: string; type: string; active?: boolean } | null>(null);
  const [draft, setDraft] = useState<ChildcareArrangement | null>(null);
  const [preview, setPreview] = useState<ChildcareOccurrence[] | null>(null);
  const [override, setOverride] = useState<(ChildcareOverride & Timing) | null>(null);
  const alive = useRef(false);
  const operation = useRef(false);
  const loadVersion = useRef(0);
  const load = useCallback(async (dates: typeof range) => {
    const version = ++loadVersion.current;
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
    } catch (failure) {
      if (alive.current && version === loadVersion.current) setError(errorText(failure));
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
    .filter((item) => {
      const arrangement = data.arrangements.find((record) => record.id === item.arrangementId);
      return arrangement && item.originalDate >= arrangement.startDate && (!arrangement.endDate || item.originalDate <= arrangement.endDate)
        && arrangement.weekdays.includes(new Date(`${item.originalDate}T00:00:00Z`).getUTCDay() || 7);
    });
  const openOverride = (item: ChildcareOccurrence) => {
    if (item.date < today()) return;
    setError("");
    setOverride({
      arrangementId: item.arrangementId, originalDate: item.originalDate, action: item.overrideAction === "move" ? "move" : "replace",
      movedDate: item.date, providerId: item.providerId, allDay: item.allDay, startTime: item.startTime, endTime: item.endTime,
    });
  };
  const occurrenceList = (items: ChildcareOccurrence[], editable = false) => items.length ? (
    <div className="table-scroll"><table className="settings-table" aria-label={editable ? "Childcare occurrences" : "Childcare preview"}>
      <thead><tr><th>Date</th><th>Provider</th><th>Participants</th><th>Care</th><th>Schedule</th>{editable && <th>Actions</th>}</tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.date}{item.date !== item.originalDate && <div>Originally {item.originalDate}</div>}</td>
        <td>{providerName(item.providerId)}</td><td>{participantNames(item.childIds)}</td><td>{timingText(item)}</td>
        <td><Chip size="small" label={item.overrideAction ? `Changed · ${item.overrideAction}` : "Recurring"} /></td>
        {editable && <td>{item.date >= today()
          ? <Button disabled={disabled} onClick={() => openOverride(item)} aria-label={`Change care on ${item.date} for ${providerName(item.providerId)}`}>Change occurrence</Button>
          : <Typography variant="body2">History · read only</Typography>}</td>}
      </tr>)}</tbody>
    </table></div>
  ) : <Typography>No care occurrences in this range.</Typography>;

  return <Stack spacing={3}>
    <Typography variant="h5" component="h2">Childcare</Typography>
    <Typography>Manage recurring care separately from calendar events. One-off changes affect only the selected occurrence.</Typography>
    {error && <Alert severity="error" action={!provider && !draft && !override ? <Button disabled={disabled} onClick={() => {
      setError(""); void load(loadedRange);
    }}>Retry</Button> : undefined}>{error}</Alert>}
    {loading && <Typography role="status">Loading childcare…</Typography>}
    <Box component="section">
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="h3">Providers</Typography>
        <Button disabled={disabled} onClick={() => { setError(""); setProvider({ name: "", type: "grandparent" }); }}>Add provider</Button>
      </Stack>
      {!loading && !data.providers.length && <Typography>No providers yet. Add a provider before creating an arrangement.</Typography>}
      {!!data.providers.length && <div className="table-scroll"><table className="settings-table" aria-label="Childcare providers">
        <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{data.providers.map((item) => <tr key={item.id}>
          <td>{item.name}</td><td>{providerTypes.find(([value]) => value === item.type)?.[1] ?? item.type}</td>
          <td>{item.active ? "Active" : "Inactive"}</td>
          <td><Button disabled={disabled} aria-label={`Edit provider ${item.name}`} onClick={() => { setError(""); setProvider(item); }}>Edit</Button>
            <Button disabled={disabled} onClick={() => void mutate("providers", "PUT", { ...item, active: !item.active })}>
              {item.active ? "Deactivate" : "Reactivate"}
            </Button></td>
        </tr>)}</tbody>
      </table></div>}
      <Typography variant="body2">Inactive providers are hidden from new care choices. Deactivation keeps existing recurring care and history; existing assignments remain valid.</Typography>
    </Box>
    <Box component="section">
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="h3">Weekly arrangements</Typography>
        <Button disabled={disabled || !members.length || !data.providers.some((item) => item.active)} onClick={() => {
          setError(""); setPreview(null);
          setDraft({ providerId: data.providers.find((item) => item.active)!.id, childIds: [], weekdays: [],
            allDay: true, startTime: null, endTime: null, startDate: today(), endDate: null });
        }}>Add arrangement</Button>
      </Stack>
      {!loading && !data.arrangements.length && <Typography>No weekly arrangements yet.</Typography>}
      {!!data.arrangements.length && <div className="table-scroll"><table className="settings-table" aria-label="Childcare arrangements">
        <thead><tr><th>Provider</th><th>Participants</th><th>Weekdays</th><th>Care</th><th>Effective dates</th><th>Actions</th></tr></thead>
        <tbody>{data.arrangements.map((item) => <tr key={item.id}>
          <td>{providerName(item.providerId)}</td><td>{participantNames(item.childIds)}</td>
          <td>{item.weekdays.map((day) => weekdays[day - 1]).join(", ")}</td><td>{timingText(item)}</td>
          <td>{item.startDate} – {item.endDate ?? "Ongoing"}</td>
          <td><Button disabled={disabled} aria-label={`Edit arrangement for ${providerName(item.providerId)}`} onClick={() => {
            setError(""); setDraft(item); setPreview(null);
          }}>Edit</Button></td>
        </tr>)}</tbody>
      </table></div>}
    </Box>
    <Box component="section">
      <Typography variant="h6" component="h3">Resolved care</Typography>
      <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ my: 2 }} onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && validRange(range.startDate, range.endDate)) { setError(""); void load(range); }
      }}>
        <FormField label="Range start" type="date" value={range.startDate} disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => { setRange({ ...range, startDate: event.target.value }); setPreview(null); }} />
        <FormField label="Range end" type="date" value={range.endDate} disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => { setRange({ ...range, endDate: event.target.value }); setPreview(null); }} />
        <Button type="submit" disabled={disabled || !validRange(range.startDate, range.endDate)}>Show care</Button>
      </Stack>
      {!validRange(range.startDate, range.endDate) && <Alert severity="warning">Choose an ordered range of at most 366 days.</Alert>}
      <Typography variant="body2">Showing {loadedRange.startDate} – {loadedRange.endDate}</Typography>
      <Typography variant="body2">One-off changes are available for today and upcoming care dates only. Past care is read-only.</Typography>
      {!loading && occurrenceList(occurrences, true)}
      <Typography variant="h6" component="h3" sx={{ mt: 2 }}>Cancellations</Typography>
      {!loading && (cancellations.length ? <Stack spacing={1}>{cancellations.map((item) => {
        const arrangement = data.arrangements.find((record) => record.id === item.arrangementId)!;
        return <Typography key={`${item.arrangementId}:${item.originalDate}`}>
          {item.originalDate} · {providerName(arrangement.providerId)} · {participantNames(arrangement.childIds)} · Cancelled
        </Typography>;
      })}</Stack> : <Typography>No cancellations in this range.</Typography>)}
    </Box>

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
        <DialogActionsBar><Button disabled={busy} onClick={() => setProvider(null)}>Cancel</Button>
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
            <FormField label="Effective start" type="date" required value={draft.startDate} slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) => changeDraft({ startDate: event.target.value })} />
            <FormField label="Effective end (optional)" type="date" value={draft.endDate ?? ""} slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) => changeDraft({ endDate: event.target.value || null })} />
          </Stack>
          {!draftValid && <Typography color="error">Select a provider, at least one participant and weekday, and valid dates and times.</Typography>}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormField label="Preview start" type="date" value={range.startDate} slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) => { setRange({ ...range, startDate: event.target.value }); setPreview(null); }} />
            <FormField label="Preview end" type="date" value={range.endDate} slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) => { setRange({ ...range, endDate: event.target.value }); setPreview(null); }} />
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
        <DialogActionsBar><Button disabled={busy} onClick={() => setDraft(null)}>Cancel</Button>
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
          <Typography>Original scheduled date: {override.originalDate}. Weekly care remains unchanged.</Typography>
          {override.action === "move" && <Typography>Effective care date: {override.movedDate || "Choose a moved date"}.</Typography>}
          <Typography>Participants: {participantNames(data.arrangements.find((item) => item.id === override.arrangementId)?.childIds ?? [])}</Typography>
          <FormField select disabled={busy} label="One-off action" value={override.action} onChange={(event) => setOverride({ ...override, action: event.target.value as ChildcareOverride["action"] })}>
            <MenuItem value="cancel">Cancel care</MenuItem><MenuItem value="replace">Replace provider / time</MenuItem><MenuItem value="move">Move care date</MenuItem>
          </FormField>
          {override.action === "move" && <FormField label="Moved date" type="date" required value={override.movedDate ?? ""}
            slotProps={{ inputLabel: { shrink: true } }} onChange={(event) => setOverride({ ...override, movedDate: event.target.value })} />}
          {override.action !== "cancel" && <>
            <FormField select disabled={busy} label="Occurrence provider" value={override.providerId ?? ""} onChange={(event) => setOverride({ ...override, providerId: event.target.value })}>
              {data.providers.filter((item) => item.active || item.id === override.providerId).map((item) =>
                <MenuItem key={item.id} value={item.id}>{item.name}{!item.active ? " (inactive)" : ""}</MenuItem>)}
            </FormField>
            <TimingFields value={override} onChange={(timing) => setOverride({ ...override, ...timing })} disabled={busy} />
          </>}
        </Box></DialogContentPanel>
        <DialogActionsBar><Button disabled={busy} onClick={() => setOverride(null)}>Close</Button>
          <GradientButton type="submit" disabled={busy || (override.action !== "cancel" && (!validTiming(override) ||
            (override.action === "move" && (!validDate(override.movedDate ?? "") || override.movedDate === override.originalDate))))}>Save one-off change</GradientButton></DialogActionsBar>
      </Box>}
    </GlassDialog>
  </Stack>;
}
