import { useEffect, useState } from "react";
import { Alert, Box, Checkbox, FormControlLabel, MenuItem, Typography } from "@mui/material";
import { FormField, GradientButton } from "../../../shared/ui/GlassFormDialog";
import { ParentingCalendarPreferences, ParentingParty } from "../../../types/family";
import type { ParentingTimeRequest } from "./ParentingTimeSettings";

export function ParentingCalendarSettings({ householdId, parties, members, request }: {
  householdId: string;
  parties: ParentingParty[];
  members: Array<{ id: string; firstName: string }>;
  request: ParentingTimeRequest;
}) {
  const base = `/api/households/${encodeURIComponent(householdId)}/parenting-time/calendar-settings`;
  const [preferences, setPreferences] = useState<ParentingCalendarPreferences>({
    showAwayHatching: false, householdPartyId: null, childMemberIds: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let current = true;
    setLoaded(false);
    setSaved(false);
    setError("");
    request(base)
      .then((data) => {
        if (!current) return;
        setPreferences(data as ParentingCalendarPreferences);
        setLoaded(true);
      })
      .catch(() => {
        if (current) setError("Calendar display settings could not be loaded. Apply the latest parenting-time migration if needed.");
      });
    return () => { current = false; };
  }, [base, request]);

  const valid = !preferences.showAwayHatching || (
    parties.some((party) => party.active && party.id === preferences.householdPartyId)
    && preferences.childMemberIds.length > 0
    && preferences.childMemberIds.every((id) => members.some((member) => member.id === id))
  );
  const update = (changes: Partial<ParentingCalendarPreferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
    setSaved(false);
  };
  const save = async () => {
    if (!loaded || busy || !valid) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await request(base, { method: "PUT", body: JSON.stringify(preferences) });
      setPreferences(data as ParentingCalendarPreferences);
      setSaved(true);
    } catch {
      setError("Calendar display settings could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="settings-card">
    <h2>Parenting calendar display</h2>
    <Typography variant="body2">Choose the household party explicitly for this shared display, not as a mapping to the signed-in user. Select which members' columns represent children; the parenting schedule still applies to all children.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Box component="fieldset" disabled={!loaded || busy} sx={{ border: 0, p: 0, m: 0, display: "grid", gap: 2 }}>
      <FormControlLabel control={<Checkbox checked={preferences.showAwayHatching}
        onChange={(event) => update({ showAwayHatching: event.target.checked })} />}
        label="Show as hatched background when children are not within the household party" />
      <FormField select label="Household parenting party" value={preferences.householdPartyId ?? ""}
        onChange={(event) => update({ householdPartyId: event.target.value || null })}>
        <MenuItem value="">Select household party</MenuItem>
        {parties.filter((party) => party.active || party.id === preferences.householdPartyId).map((party) =>
          <MenuItem key={party.id} value={party.id} disabled={!party.active}>{party.name}{party.active ? "" : " (archived)"}</MenuItem>)}
      </FormField>
      <Typography variant="subtitle2">Child calendar columns</Typography>
      {members.map((member) => <FormControlLabel key={member.id} label={`Shade ${member.firstName}'s column`}
        control={<Checkbox checked={preferences.childMemberIds.includes(member.id)}
          onChange={(event) => update({ childMemberIds: event.target.checked
            ? [...preferences.childMemberIds, member.id] : preferences.childMemberIds.filter((id) => id !== member.id) })} />} />)}
      {!valid && <Typography role="status">Select an active household party and at least one child column before enabling hatching.</Typography>}
      <Typography variant="body2">Hatching is a background cue, not an event timeline or a change of responsibility. Unknown periods remain unshaded. On compact calendars, select a configured child's filter to see the background.</Typography>
      <GradientButton type="button" disabled={!valid} onClick={() => void save()}>Save calendar display</GradientButton>
    </Box>
    {saved && <Typography role="status">Calendar display saved.</Typography>}
  </section>;
}
