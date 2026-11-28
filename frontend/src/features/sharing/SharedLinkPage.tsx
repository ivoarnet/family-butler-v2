import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { formatShareDateTime } from "../../shared/sharing/formatShareDateTime";

type SharedChange = { startAt: string; endAt: string; partyName: string; category: string; label: string };
type SharedChanges = { resourceType: "parenting_changes"; expiresAt: string; timeZone: string; changes: SharedChange[] };
type SharedOccurrence = {
  date: string; providerName: string; childNames: string[];
  allDay: boolean; startTime: string | null; endTime: string | null; overrideAction: string | null;
};
type SharedChildcare = {
  resourceType: "childcare_schedule"; expiresAt: string; timeZone: string;
  startDate: string; endDate: string; providerName: string | null; occurrences: SharedOccurrence[];
};
type SharedData = SharedChanges | SharedChildcare;
const categoryLabels: Record<string, string> = { adjusted_handover: "Adjusted Handover", holiday: "Holiday", diverse: "Diverse" };
const invalidMessage = "This shared link is unavailable. It may be invalid, expired, or deleted. Ask its creator for a new link.";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
class InvalidSharedLinkError extends Error {}
const isPayload = (value: unknown): value is SharedData => {
  if (!value || typeof value !== "object") return false;
  const data = value as SharedData;
  if (typeof data.timeZone !== "string" || typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt))) return false;
  try { new Intl.DateTimeFormat(undefined, { timeZone: data.timeZone }).format(); } catch { return false; }
  if (data.resourceType === "parenting_changes") {
    return Array.isArray(data.changes) && data.changes.length <= 500 && data.changes.every((change) =>
      change && typeof change === "object" && typeof change.startAt === "string" && Number.isFinite(Date.parse(change.startAt))
      && typeof change.endAt === "string" && Date.parse(change.endAt) > Date.parse(change.startAt)
      && typeof change.partyName === "string" && typeof change.category === "string" && typeof change.label === "string");
  }
  return data.resourceType === "childcare_schedule"
    && /^\d{4}-\d{2}-\d{2}$/.test(data.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(data.endDate)
    && data.startDate <= data.endDate
    && (data.providerName === null || typeof data.providerName === "string")
    && Array.isArray(data.occurrences) && data.occurrences.length <= 500 && data.occurrences.every((occurrence) =>
      occurrence && typeof occurrence === "object" && /^\d{4}-\d{2}-\d{2}$/.test(occurrence.date)
      && typeof occurrence.providerName === "string" && Array.isArray(occurrence.childNames)
      && occurrence.childNames.every((name) => typeof name === "string")
      && typeof occurrence.allDay === "boolean"
      && (occurrence.startTime === null || typeof occurrence.startTime === "string")
      && (occurrence.endTime === null || typeof occurrence.endTime === "string")
      && (occurrence.overrideAction === null || typeof occurrence.overrideAction === "string"));
};
const localDateInTimeZone = (time: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const formatCareDate = (date: string) => new Intl.DateTimeFormat("de-CH", {
  timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric",
}).format(new Date(`${date}T00:00:00Z`));
const formatCareTime = (time: string) => new Intl.DateTimeFormat("de-CH", {
  timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(`1970-01-01T${time}Z`));

export function SharedLinkPage({ token }: { token: string }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [temporaryError, setTemporaryError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const pageView = useRef<{ token: string; id: string; counted: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    setData(null);
    setError(false);
    setRateLimited(false);
    setTemporaryError(false);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setError(true); return; }
    if (pageView.current?.token !== token) {
      pageView.current = { token, id: crypto.randomUUID(), counted: false };
    }
    const view = pageView.current;
    const refresh = async () => {
      controller?.abort();
      clearTimeout(refreshTimer);
      clearTimeout(expiryTimer);
      setData(null);
      setError(false);
      setRateLimited(false);
      setTemporaryError(false);
      const operation = new AbortController();
      controller = operation;
      try {
        const response = await fetch(`${API_BASE_URL}/api/shared-links/resolve`, {
          method: "POST", headers: { "x-share-token": token, "Content-Type": "application/json" },
          body: JSON.stringify(view.counted ? {} : { viewId: view.id }),
          cache: "no-store", credentials: "omit", signal: operation.signal,
        });
        if (!active || operation.signal.aborted) return;
        if (response.status === 429) {
          setRateLimited(true);
          setError(false);
          const retryAfter = response.headers.get("Retry-After");
          const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
          refreshTimer = setTimeout(() => void refresh(), Math.max(1, Math.min(seconds, 300)) * 1000);
          return;
        }
        if (response.status >= 500) throw new Error("Temporary failure");
        if (!response.ok) throw new InvalidSharedLinkError();
        const result: unknown = await response.json();
        if (!isPayload(result) || Date.parse(result.expiresAt) <= Date.now()) throw new InvalidSharedLinkError();
        if (!active || operation.signal.aborted) return;
        view.counted = true;
        setNow(Date.now());
        setData(result);
        setError(false);
        setRateLimited(false);
        clearTimeout(expiryTimer);
        const expire = () => {
          const remaining = Date.parse(result.expiresAt) - Date.now();
          if (remaining > 0) {
            expiryTimer = setTimeout(expire, Math.min(remaining, 2147483647));
          } else {
            controller?.abort();
            clearTimeout(refreshTimer);
            setData(null);
            setError(true);
            setRateLimited(false);
          }
        };
        expire();
        refreshTimer = setTimeout(() => void refresh(), 30000);
      } catch (cause) {
        if (!active || operation.signal.aborted) return;
        setData(null);
        setRateLimited(false);
        if (cause instanceof InvalidSharedLinkError || cause instanceof SyntaxError) {
          setError(true);
        } else {
          setTemporaryError(true);
          refreshTimer = setTimeout(() => void refresh(), 30000);
        }
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        setData(null);
        clearTimeout(refreshTimer);
        void refresh();
      }
    };
    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    const onPageHide = () => {
      controller?.abort();
      clearTimeout(refreshTimer);
      clearTimeout(expiryTimer);
      setData(null);
    };
    window.addEventListener("pagehide", onPageHide);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(refreshTimer);
      clearTimeout(expiryTimer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [token, retryAttempt]);
  const expired = data && Date.parse(data.expiresAt) <= now;
  const format = (value: string) => formatShareDateTime(value, data?.timeZone);
  const changes = data?.resourceType === "parenting_changes"
    ? data.changes.filter((change) => Date.parse(change.startAt) >= now && Date.parse(change.startAt) < Date.parse(data.expiresAt)) : [];
  const occurrences = data?.resourceType === "childcare_schedule"
    ? data.occurrences.filter((item) => item.date >= localDateInTimeZone(now, data.timeZone) && item.date <= data.endDate) : [];
  return <Box component="main" sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 4 }, color: "var(--text-primary)" }}>
    <Stack spacing={3}>
      <Typography component="h1" variant="h4">
        {data?.resourceType === "childcare_schedule" ? "Shared resolved care" : "Shared parenting changes"}
      </Typography>
      {error || expired ? <Alert severity="info">{invalidMessage}</Alert> : rateLimited ?
        <Alert severity="info">This link is temporarily busy. Please wait; it will retry automatically.</Alert> :
        temporaryError ? <Alert severity="warning"
          action={<Button color="inherit" onClick={() => setRetryAttempt((attempt) => attempt + 1)}>Retry</Button>}>
          Could not load shared changes right now. Retrying automatically in 30 seconds. You can also retry without reloading this page.
        </Alert> :
        !data ? <Typography role="status">Loading shared changes…</Typography> : <>
        {data.resourceType === "childcare_schedule" ? <>
          <Typography>Live future resolved care from {formatCareDate(data.startDate)} through {formatCareDate(data.endDate)}
            {data.providerName ? ` · Provider: ${data.providerName}` : " · All providers"}.</Typography>
          <Typography variant="body2">Expires: {format(data.expiresAt)} · Timezone: {data.timeZone}. Refreshes every 30 seconds.</Typography>
          {occurrences.length === 0 ? <Typography>No upcoming care is available for this link.</Typography> :
            <div className="table-scroll"><table className="settings-table" aria-label="Shared care occurrences">
              <thead><tr><th>Date and time</th><th>Provider</th><th>Participants</th><th>Schedule</th></tr></thead>
              <tbody>{occurrences.map((occurrence, index) => <tr key={`${occurrence.date}-${index}`}>
                <td>{formatCareDate(occurrence.date)}{occurrence.allDay ? " · All day" :
                  ` ${occurrence.startTime ? formatCareTime(occurrence.startTime) : ""}–${occurrence.endTime ? formatCareTime(occurrence.endTime) : ""}`}</td>
                <td>{occurrence.providerName}</td>
                <td>{occurrence.childNames.join(", ") || "Family members"}</td>
                <td>{occurrence.overrideAction
                  ? occurrence.overrideAction === "add" ? "Added day" : `Changed · ${occurrence.overrideAction}`
                  : "Recurring"}</td>
              </tr>)}</tbody>
            </table></div>}
        </> : <>
        <Typography>Live future changes only, from the next change handover. Ongoing and past changes are not shown. Ends are limited to this link’s expiry.</Typography>
        <Typography variant="body2">Expires: {format(data.expiresAt)} · Timezone: {data.timeZone}. Refreshes every 30 seconds.</Typography>
        {changes.length === 0 ? <Typography>No upcoming changes are available for this link.</Typography> :
          <div className="table-scroll"><table className="settings-table" aria-label="Shared parenting changes">
            <thead><tr><th>Party</th><th>From</th><th>Until</th><th>Category</th><th>Reason</th></tr></thead>
            <tbody>{changes.map((change, index) => <tr key={`${change.startAt}-${index}`}>
              <td>{change.partyName}</td>
              <td>{format(change.startAt)}</td>
              <td>{format(new Date(Math.min(Date.parse(change.endAt), Date.parse(data.expiresAt))).toISOString())}</td>
              <td>{categoryLabels[change.category] ?? "Change"}</td>
              <td style={{ whiteSpace: "pre-wrap" }}>{change.label}</td>
            </tr>)}</tbody>
          </table></div>}
        </>}</>}
    </Stack>
  </Box>;
}
