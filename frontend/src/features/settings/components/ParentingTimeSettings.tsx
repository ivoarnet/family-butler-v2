import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { FormField } from "../../../shared/ui/GlassFormDialog";

export type ParentingTimeRequest = (path: string, init?: RequestInit) => Promise<unknown>;
type Party = { id: string; name: string; memberId: string | null; active: boolean };
type Rule = {
  id: string; partyId: string; weekday: number; startTime: string; endWeekday: number; endTime: string; weekParity: "odd" | "even" | null;
};
type Plan = {
  id?: string; effectiveFrom: string; effectiveTo?: string | null; timeZone: string;
  recurrenceMode: "weekly" | "alternating"; rules: Rule[]; active: boolean;
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
const dateTimeInput = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const toIso = (value: string) => new Date(value).toISOString();
const formatInterval = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));
const errorText = (error: unknown) => error instanceof Error ? error.message : "Parenting-time request failed. Please try again.";
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
const baseSchedule = (parties: Party[], plan?: Plan | null) => {
  const active = parties.filter((party) => party.active);
  const first = active[0]?.id ?? "";
  const other = active.find((party) => party.id !== first)?.id ?? first;
  const rules = plan?.rules ?? [];
  const weekend = rules.find((rule) => rule.weekParity === "odd")
    ?? (plan?.recurrenceMode === "weekly" ? rules[2] : undefined);
  const firstDay = weekend?.endWeekday ?? 7;
  const firstHandover = rules.find((rule) => rule.weekday === firstDay && rule.weekParity === null);
  const secondDay = firstHandover?.endWeekday ?? 1;
  const secondHandover = rules.find((rule) => rule.weekday === secondDay && rule.weekParity === null);
  const thirdDay = secondHandover?.endWeekday ?? 4;
  const thirdHandover = rules.find((rule) => rule.weekday === thirdDay && rule.weekParity === null);
  const evenWeekend = rules.find((rule) => rule.weekParity === "even");
  return {
    weeklyStartParty: firstHandover?.partyId ?? first,
    MondayToThursdayParty: secondHandover?.partyId ?? other,
    ThursdayToFridayParty: thirdHandover?.partyId ?? first,
    oddWeekendParty: weekend?.partyId ?? first,
    evenWeekendParty: evenWeekend?.partyId ?? other,
    firstDay,
    secondDay,
    thirdDay,
    fourthDay: thirdHandover?.endWeekday ?? 5,
    sundayTime: firstHandover?.startTime ?? "19:30",
    mondayTime: firstHandover?.endTime ?? "19:30",
    thursdayTime: secondHandover?.startTime ?? "19:30",
    fridayTime: thirdHandover?.endTime ?? "17:00",
  };
};

export function ParentingTimeSettings({ householdId, members, request }: {
  householdId: string; members: Array<{ id: string; firstName: string }>; request: ParentingTimeRequest;
}) {
  const base = `/api/households/${encodeURIComponent(householdId)}/parenting-time`;
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [partyDraft, setPartyDraft] = useState<{ id?: string; name: string; memberId: string; active: boolean } | null>(null);
  const [planDraft, setPlanDraft] = useState<Plan | null>(null);
  const [schedule, setSchedule] = useState(() => baseSchedule([]));
  const [preview, setPreview] = useState<Interval[]>([]);
  const [changeDraft, setChangeDraft] = useState<{ id?: string; partyId: string; startAt: string; endAt: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const records = await request(base) as Data;
      setData(records);
      const draft = records.plan ?? {
        effectiveFrom: localDate(new Date()), effectiveTo: null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurrenceMode: "alternating" as const, rules: [], active: true,
      };
      setPlanDraft(draft);
      setSchedule(baseSchedule(records.parties, records.plan));
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
  const createRules = (): Rule[] => {
    if (!planDraft) return [];
    const { weeklyStartParty, MondayToThursdayParty, ThursdayToFridayParty, oddWeekendParty, evenWeekendParty,
      firstDay, secondDay, thirdDay, fourthDay,
      sundayTime, mondayTime, thursdayTime, fridayTime } = schedule;
    const rule = (partyId: string, weekday: number, startTime: string, endWeekday: number, endTime: string,
      weekParity: Rule["weekParity"] = null): Rule => ({ id: id(), partyId, weekday, startTime, endWeekday, endTime, weekParity });
    const rules = [
      rule(MondayToThursdayParty, secondDay, mondayTime, thirdDay, thursdayTime),
      rule(ThursdayToFridayParty, thirdDay, thursdayTime, fourthDay, fridayTime),
      rule(oddWeekendParty, fourthDay, fridayTime, firstDay, sundayTime, planDraft.recurrenceMode === "alternating" ? "odd" : null),
      rule(weeklyStartParty, firstDay, sundayTime, secondDay, mondayTime),
    ];
    if (planDraft.recurrenceMode === "alternating") {
      rules.splice(3, 0, rule(evenWeekendParty, fourthDay, fridayTime, firstDay, sundayTime, "even"));
    }
    return rules.map((rule) => ({
      ...rule,
      id: planDraft.rules.find((previous) => previous.partyId === rule.partyId && previous.weekday === rule.weekday
        && previous.startTime === rule.startTime && previous.endWeekday === rule.endWeekday
        && previous.endTime === rule.endTime && previous.weekParity === rule.weekParity)?.id ?? rule.id,
    }));
  };
  const orderedHandoverDays = ((schedule.secondDay - schedule.firstDay + 7) % 7) > 0
    && ((schedule.thirdDay - schedule.firstDay + 7) % 7) > ((schedule.secondDay - schedule.firstDay + 7) % 7)
    && ((schedule.fourthDay - schedule.firstDay + 7) % 7) > ((schedule.thirdDay - schedule.firstDay + 7) % 7)
    && ((schedule.fourthDay - schedule.firstDay + 7) % 7) < 7;
  const validSchedule = planDraft && activeParties.length >= 2
    && [schedule.weeklyStartParty, schedule.MondayToThursdayParty, schedule.ThursdayToFridayParty,
      schedule.oddWeekendParty, planDraft.recurrenceMode === "alternating" ? schedule.evenWeekendParty : schedule.oddWeekendParty]
      .every((partyId) => activeParties.some((party) => party.id === partyId))
    && new Set([schedule.weeklyStartParty, schedule.MondayToThursdayParty, schedule.ThursdayToFridayParty,
      schedule.oddWeekendParty, planDraft.recurrenceMode === "alternating" ? schedule.evenWeekendParty : schedule.oddWeekendParty]).size >= 2
    && orderedHandoverDays
    && validDate(planDraft.effectiveFrom)
    && (!planDraft.effectiveTo || (validDate(planDraft.effectiveTo) && planDraft.effectiveTo >= planDraft.effectiveFrom))
    && Boolean(planDraft.timeZone.trim())
    && [schedule.sundayTime, schedule.mondayTime, schedule.thursdayTime, schedule.fridayTime]
      .every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const planPayload = () => planDraft ? { ...planDraft, rules: createRules() } : null;
  const previewPlan = () => run(async () => {
    const plan = planPayload();
    if (!plan || !validSchedule) throw new Error("Add two active parenting parties and complete the schedule before previewing.");
    const { startAt, endAt } = rangeForPreview(plan.effectiveFrom);
    const result = await request(`${base}/preview`, {
      method: "POST", body: JSON.stringify({ plan, startAt, endAt }),
    }) as { intervals: Interval[] };
    setPreview(result.intervals);
  });
  const savePlan = () => run(async () => {
    const plan = planPayload();
    if (!plan || !validSchedule) throw new Error("Add two active parenting parties and complete the schedule before saving.");
    await request(`${base}/plan`, { method: "PUT", body: JSON.stringify(plan) });
    await load();
  });
  const changeSchedule = (key: keyof typeof schedule, value: string | number) => {
    setSchedule((current) => ({ ...current, [key]: value }));
    setPreview([]);
  };

  return <Stack spacing={3}>
    <Alert severity="info">This first version applies one household-wide schedule to all children. It is for practical planning, not legal advice or proof of custody.</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {loading && <Typography role="status">Loading parenting time…</Typography>}

    <section className="settings-card">
      <div className="section-toolbar"><h2>Parenting parties</h2>
        <Button onClick={() => setPartyDraft({ name: "", memberId: "", active: true })} disabled={busy}>Add party</Button>
      </div>
      <div className="table-scroll"><table className="settings-table" aria-label="Parenting parties">
        <thead><tr><th>Name</th><th>Household member</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{data.parties.map((party) => <tr key={party.id}>
          <td>{party.name}</td><td>{members.find((member) => member.id === party.memberId)?.firstName ?? "Not linked"}</td>
          <td><Chip size="small" label={party.active ? "Active" : "Archived"} /></td>
          <td className="actions-cell"><Button size="small" startIcon={<EditOutlinedIcon />} onClick={() =>
            setPartyDraft({ id: party.id, name: party.name, memberId: party.memberId ?? "", active: party.active })}>Edit</Button>
            <Button size="small" disabled={busy} onClick={() => mutate("parties", "PUT",
              { id: party.id, name: party.name, memberId: party.memberId, active: !party.active })}>
              {party.active ? "Archive" : "Restore"}
            </Button></td>
        </tr>)}</tbody>
      </table></div>
      {partyDraft && <Stack spacing={2} sx={{ mt: 2 }}>
        <Typography variant="h6">{partyDraft.id ? "Edit parenting party" : "Add parenting party"}</Typography>
        <FormField label="Party name (for example, Mum or Dad)" value={partyDraft.name} onChange={(event) =>
          setPartyDraft({ ...partyDraft, name: event.target.value })} />
        <TextField select label="Link to household member (optional)" value={partyDraft.memberId} onChange={(event) =>
          setPartyDraft({ ...partyDraft, memberId: event.target.value })}>
          <MenuItem value="">No linked member</MenuItem>
          {members.map((member) => <MenuItem key={member.id} value={member.id}>{member.firstName}</MenuItem>)}
        </TextField>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={busy || !partyDraft.name.trim()} onClick={() => mutate("parties",
            partyDraft.id ? "PUT" : "POST", { ...partyDraft, memberId: partyDraft.memberId || null })}>Save party</Button>
          <Button onClick={() => setPartyDraft(null)}>Cancel</Button>
        </Stack>
      </Stack>}
    </section>

    <section className="settings-card">
      <div className="section-toolbar"><h2>Regular parenting-time plan</h2></div>
      <Typography variant="body2">Set four handovers in order through the week. Alternating weekends are determined by the ISO week number of the weekend handover day. The children are with the selected party between handovers.</Typography>
      {planDraft && <Stack spacing={2} sx={{ mt: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField select label="Pattern" value={planDraft.recurrenceMode} onChange={(event) => {
            setPlanDraft({ ...planDraft, recurrenceMode: event.target.value as Plan["recurrenceMode"] });
            setPreview([]);
          }}>
            <MenuItem value="weekly">Weekly</MenuItem><MenuItem value="alternating">Alternating weeks (ISO week)</MenuItem>
          </TextField>
          <FormField label="Effective from" type="date" value={planDraft.effectiveFrom} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => { setPlanDraft({ ...planDraft, effectiveFrom: event.target.value }); setPreview([]); }} />
          <FormField label="Effective until (optional)" type="date" value={planDraft.effectiveTo ?? ""}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => { setPlanDraft({ ...planDraft, effectiveTo: event.target.value || null }); setPreview([]); }} />
          <FormField label="Time zone" value={planDraft.timeZone} onChange={(event) => {
            setPlanDraft({ ...planDraft, timeZone: event.target.value }); setPreview([]);
          }} />
        </Stack>
        <FormControlLabel label="Activate this plan" control={<Checkbox checked={planDraft.active} onChange={(event) => {
          setPlanDraft({ ...planDraft, active: event.target.checked }); setPreview([]);
        }} />} />
        <Typography variant="subtitle1">Handover times</Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
              <TextField select label="Handover 1 day" value={schedule.firstDay} sx={{ minWidth: 140 }} onChange={(event) =>
                changeSchedule("firstDay", Number(event.target.value))}>
                {weekdayNames.map((name, index) => <MenuItem key={name} value={index + 1}>{name}</MenuItem>)}
              </TextField>
              <FormField label="Handover 1 time" type="time" value={schedule.sundayTime}
                onChange={(event) => changeSchedule("sundayTime", event.target.value)} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
              <TextField select label="Handover 2 day" value={schedule.secondDay} sx={{ minWidth: 140 }} onChange={(event) =>
                changeSchedule("secondDay", Number(event.target.value))}>
                {weekdayNames.map((name, index) => <MenuItem key={name} value={index + 1}>{name}</MenuItem>)}
              </TextField>
              <FormField label="Handover 2 time" type="time" value={schedule.mondayTime}
                onChange={(event) => changeSchedule("mondayTime", event.target.value)} />
            </Stack>
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
              <TextField select label="Handover 3 day" value={schedule.thirdDay} sx={{ minWidth: 140 }} onChange={(event) =>
                changeSchedule("thirdDay", Number(event.target.value))}>
                {weekdayNames.map((name, index) => <MenuItem key={name} value={index + 1}>{name}</MenuItem>)}
              </TextField>
              <FormField label="Handover 3 time" type="time" value={schedule.thursdayTime}
                onChange={(event) => changeSchedule("thursdayTime", event.target.value)} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
              <TextField select label="Handover 4 day" value={schedule.fourthDay} sx={{ minWidth: 140 }} onChange={(event) =>
                changeSchedule("fourthDay", Number(event.target.value))}>
                {weekdayNames.map((name, index) => <MenuItem key={name} value={index + 1}>{name}</MenuItem>)}
              </TextField>
              <FormField label="Handover 4 time" type="time" value={schedule.fridayTime}
                onChange={(event) => changeSchedule("fridayTime", event.target.value)} />
            </Stack>
          </Stack>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          {([
            ["weeklyStartParty", `after ${weekdayNames[schedule.firstDay - 1]} handover`],
            ["MondayToThursdayParty", `after ${weekdayNames[schedule.secondDay - 1]} handover`],
            ["ThursdayToFridayParty", `after ${weekdayNames[schedule.thirdDay - 1]} handover`],
            ["oddWeekendParty", planDraft.recurrenceMode === "alternating" ? "after handover 4 · odd ISO weeks" : "after handover 4"],
            ...(planDraft.recurrenceMode === "alternating" ? [["evenWeekendParty", "after handover 4 · even ISO weeks"]] : []),
          ] as Array<[keyof typeof schedule, string]>).map(([key, label]) => <TextField key={key} select label={`With ${label}`}
            value={schedule[key]} onChange={(event) => changeSchedule(key, event.target.value)}>
            {activeParties.map((party) => <MenuItem key={party.id} value={party.id}>{party.name}</MenuItem>)}
          </TextField>)}
        </Stack>
        {!orderedHandoverDays && <Alert severity="warning">Choose four different handover weekdays in order, starting with handover 1 and wrapping into the next week if needed.</Alert>}
        {activeParties.length < 2 && <Alert severity="warning">Add at least two active parties before configuring a plan.</Alert>}
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" disabled={busy || !validSchedule} onClick={() => void previewPlan()}>Preview next 14 days</Button>
          <Button variant="contained" disabled={busy || !validSchedule} onClick={() => void savePlan()}>Save plan</Button>
        </Stack>
      </Stack>}
      <Typography variant="subtitle1" sx={{ mt: 2 }}>Upcoming schedule preview</Typography>
      {preview.length ? <div className="table-scroll"><table className="settings-table" aria-label="Parenting-time preview">
        <thead><tr><th>From</th><th>Until</th><th>With</th><th>Schedule</th></tr></thead>
        <tbody>{preview.map((interval, index) => <tr key={`${interval.startAt}-${index}`}>
          <td>{formatInterval(interval.startAt)}</td><td>{formatInterval(interval.endAt)}</td><td>{interval.partyName}</td>
          <td><Chip size="small" label={interval.source.type === "change" ? `Change · ${interval.source.label}` : "Regular plan"} /></td>
        </tr>)}</tbody>
      </table></div> : <Typography variant="body2">Preview the schedule to see who the children are with. Changes are always resolved by the server.</Typography>}
    </section>

    <section className="settings-card">
      <div className="section-toolbar"><h2>Changes for a period</h2>
        <Button disabled={busy || !data.plan?.active || activeParties.length === 0} onClick={() => setChangeDraft({
          partyId: activeParties[0]?.id ?? "", startAt: "", endAt: "", label: "",
        })}>Add change</Button>
      </div>
      <Typography variant="body2">Holidays, swaps, or special agreements override the regular plan only during the selected time.</Typography>
      <div className="table-scroll"><table className="settings-table" aria-label="Parenting-time changes">
        <thead><tr><th>Period</th><th>With</th><th>Reason</th><th>Actions</th></tr></thead>
        <tbody>{data.changes.map((change) => <tr key={change.id}>
          <td>{formatInterval(change.startAt)} – {formatInterval(change.endAt)}</td>
          <td>{data.parties.find((party) => party.id === change.partyId)?.name ?? "Archived party"}</td><td>{change.label}</td>
          <td className="actions-cell"><Button size="small" onClick={() => setChangeDraft({ id: change.id, partyId: change.partyId,
            startAt: dateTimeInput(change.startAt), endAt: dateTimeInput(change.endAt), label: change.label })}>Edit</Button>
            <Button size="small" disabled={busy} onClick={() => void run(async () => {
              await request(`${base}/changes?id=${encodeURIComponent(change.id)}`, { method: "DELETE" });
              await load();
            })}>Remove</Button></td>
        </tr>)}</tbody>
      </table></div>
      {changeDraft && <Stack spacing={2} sx={{ mt: 2 }}>
        <Typography variant="h6">{changeDraft.id ? "Edit change for this period" : "Add change for this period"}</Typography>
        <TextField select label="Children with" value={changeDraft.partyId} onChange={(event) =>
          setChangeDraft({ ...changeDraft, partyId: event.target.value })}>
          {activeParties.map((party) => <MenuItem key={party.id} value={party.id}>{party.name}</MenuItem>)}
        </TextField>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <FormField label="From" type="datetime-local" value={changeDraft.startAt} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => setChangeDraft({ ...changeDraft, startAt: event.target.value })} />
          <FormField label="Until" type="datetime-local" value={changeDraft.endAt} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => setChangeDraft({ ...changeDraft, endAt: event.target.value })} />
        </Stack>
        <FormField label="Reason or agreement" value={changeDraft.label} onChange={(event) =>
          setChangeDraft({ ...changeDraft, label: event.target.value })} />
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={busy || !changeDraft.partyId || !changeDraft.startAt || !changeDraft.endAt
            || !changeDraft.label.trim() || new Date(changeDraft.endAt) <= new Date(changeDraft.startAt)}
            onClick={() => mutate("changes", changeDraft.id ? "PUT" : "POST", {
              ...changeDraft, startAt: toIso(changeDraft.startAt), endAt: toIso(changeDraft.endAt),
            })}>Save change</Button>
          <Button onClick={() => setChangeDraft(null)}>Cancel</Button>
        </Stack>
      </Stack>}
    </section>
  </Stack>;
}
