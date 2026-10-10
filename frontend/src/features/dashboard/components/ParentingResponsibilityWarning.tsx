import { useEffect, useState } from "react";
import { Alert, FormControlLabel, MenuItem, Switch, Typography } from "@mui/material";
import { FormSelect, GlassPanel } from "../../../shared/ui/GlassFormDialog";
import { ParentingParty, ParentingResponsibilityResult } from "../../../types/family";
import { EventDialogFormState } from "./EventDialog";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function ParentingResponsibilityWarning({ householdId, accessToken, formState }: {
  householdId: string;
  accessToken: string;
  formState: EventDialogFormState;
}) {
  const [personal, setPersonal] = useState(false);
  const [parties, setParties] = useState<ParentingParty[]>([]);
  const [partyId, setPartyId] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ParentingResponsibilityResult | null>(null);
  const base = `${API_BASE_URL}/api/households/${encodeURIComponent(householdId)}/parenting-time`;
  const headers = { Authorization: ["Bearer", accessToken].join(" "), "x-supabase-auth-token": accessToken };

  useEffect(() => {
    if (!import.meta.env.DEV || !householdId || !accessToken) return;
    const controller = new AbortController();
    setParties([]);
    setPartyId("");
    fetch(base, { headers, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load parties");
        return response.json() as Promise<{ parties: ParentingParty[] }>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setParties(data.parties.filter((party) => party.active));
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Cannot determine responsibility: parenting parties could not be loaded.");
      });
    return () => controller.abort();
  }, [base, accessToken]);

  useEffect(() => {
    setResult(null);
    setMessage("");
    if (!personal || !partyId || !import.meta.env.DEV) return;
    const lastDate = formState.multiDay ? formState.endDate : formState.date;
    const start = new Date(`${formState.date}T${formState.allDay ? "00:00" : formState.startTime || "00:00"}`);
    const end = new Date(`${lastDate}T${formState.allDay ? "00:00" : formState.endTime || "00:00"}`);
    if (formState.allDay || !formState.endTime) end.setDate(end.getDate() + 1);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setMessage("Choose a valid date/time range to check responsibility.");
      return;
    }
    const controller = new AbortController();
    setMessage("Checking parenting responsibility…");
    const timeout = window.setTimeout(() => {
      fetch(`${base}/check`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, startAt: start.toISOString(), endAt: end.toISOString() }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Responsibility check failed");
          return response.json() as Promise<ParentingResponsibilityResult>;
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResult(data);
          setMessage(data.status === "cannot_determine"
            ? "Cannot determine responsibility: no active valid plan covers this range."
            : data.responsible ? "" : "No parenting responsibility overlap for this range.");
        })
        .catch(() => {
          if (!controller.signal.aborted) setMessage("Cannot determine responsibility: the check is unavailable. You can still save.");
        });
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [personal, partyId, base, accessToken, formState.date, formState.endDate, formState.multiDay,
    formState.allDay, formState.startTime, formState.endTime]);

  return (
    <GlassPanel>
      <FormControlLabel control={<Switch checked={personal} onChange={(event) => setPersonal(event.target.checked)} />}
        label="Check this personal event for parenting responsibility" />
      {personal && (!import.meta.env.DEV
        ? <Typography role="status">Cannot determine your parenting party until secure account-to-party mapping is available.</Typography>
        : <>
          <Typography variant="body2">Development-only party selection. This is not an identity or authorization mapping.</Typography>
          <FormSelect value={partyId} displayEmpty onChange={(event) => setPartyId(String(event.target.value))}
            inputProps={{ "aria-label": "Acting parenting party (development only)" }}>
            <MenuItem value="">Select an acting parenting party</MenuItem>
            {parties.map((party) => <MenuItem key={party.id} value={party.id}>{party.name}</MenuItem>)}
          </FormSelect>
          {!partyId && <Typography role="status">Select a party explicitly; responsibility cannot be determined for “me”.</Typography>}
          {message && <Typography role="status">{message}</Typography>}
          {result?.responsible === true && <Alert severity="warning">
            You are scheduled to be responsible during this personal event. You can still save.
            <ul>{result.overlaps.map((interval, index) => <li key={index}>
              {interval.partyName}: {new Date(interval.startAt).toLocaleString()} – {new Date(interval.endAt).toLocaleString()}
              {" · "}{interval.source.type === "change" ? `One-off change${interval.source.label ? `: ${interval.source.label}` : ""}` : "Normal plan"}
            </li>)}</ul>
          </Alert>}
          {formState.repeatRule && <Typography variant="body2">Only the proposed first occurrence is checked, not future repeats.</Typography>}
        </>)}
    </GlassPanel>
  );
}
