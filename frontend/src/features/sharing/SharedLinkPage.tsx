import { useEffect, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";

type SharedChange = { startAt: string; endAt: string; partyName: string; category: string; label: string };
type SharedChanges = { resourceType: "parenting_changes"; expiresAt: string; timeZone: string; changes: SharedChange[] };
const categoryLabels: Record<string, string> = { adjusted_handover: "Adjusted Handover", holiday: "Holiday", diverse: "Diverse" };
const invalidMessage = "This shared link is unavailable. It may be invalid, expired, or deleted. Ask its creator for a new link.";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
class InvalidSharedLinkError extends Error {}
const isPayload = (value: unknown): value is SharedChanges => {
  if (!value || typeof value !== "object") return false;
  const data = value as SharedChanges;
  try { new Intl.DateTimeFormat(undefined, { timeZone: data.timeZone }).format(); } catch { return false; }
  return data.resourceType === "parenting_changes" && typeof data.timeZone === "string"
    && typeof data.expiresAt === "string" && Number.isFinite(Date.parse(data.expiresAt))
    && Array.isArray(data.changes) && data.changes.every((change) => change && typeof change === "object"
      && typeof change.startAt === "string" && Number.isFinite(Date.parse(change.startAt))
      && typeof change.endAt === "string" && Date.parse(change.endAt) > Date.parse(change.startAt)
      && typeof change.partyName === "string" && typeof change.category === "string" && typeof change.label === "string");
};

export function SharedLinkPage({ token }: { token: string }) {
  const [data, setData] = useState<SharedChanges | null>(null);
  const [error, setError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [temporaryError, setTemporaryError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
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
          method: "POST", headers: { Authorization: ["Bearer", token].join(" ") },
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
  const format = (value: string) => new Intl.DateTimeFormat(undefined, {
    timeZone: data?.timeZone, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
  const changes = data?.changes.filter((change) => Date.parse(change.startAt) >= now && Date.parse(change.startAt) < Date.parse(data.expiresAt)) ?? [];
  return <Box component="main" sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 4 }, color: "var(--text-primary)" }}>
    <Stack spacing={3}>
      <Typography component="h1" variant="h4">Shared parenting changes</Typography>
      {error || expired ? <Alert severity="info">{invalidMessage}</Alert> : rateLimited ?
        <Alert severity="info">This link is temporarily busy. Please wait; it will retry automatically.</Alert> :
        temporaryError ? <Alert severity="warning"
          action={<Button color="inherit" onClick={() => setRetryAttempt((attempt) => attempt + 1)}>Retry</Button>}>
          Could not load shared changes right now. Retrying automatically in 30 seconds. You can also retry without reloading this page.
        </Alert> :
        !data ? <Typography role="status">Loading shared changes…</Typography> : <>
        <Typography>Live future changes only, from the next change handover. Ongoing and past changes are not shown. Ends are limited to this link’s expiry.</Typography>
        <Typography variant="body2">Expires: {format(data.expiresAt)} · Timezone: {data.timeZone}. Refreshes every 30 seconds.</Typography>
        {changes.length === 0 ? <Typography>No upcoming changes are available for this link.</Typography> :
          <Stack component="ul" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {changes.map((change, index) => <Box component="li" key={`${change.startAt}-${index}`}
              sx={{ border: "1px solid var(--dialog-border)", borderRadius: 3, p: 2, background: "var(--dialog-surface)", overflowWrap: "anywhere" }}>
              <Typography sx={{ fontWeight: 700 }}>{change.partyName}</Typography>
              <Typography>{format(change.startAt)} – {format(new Date(Math.min(Date.parse(change.endAt), Date.parse(data.expiresAt))).toISOString())}</Typography>
              <Typography variant="body2">{categoryLabels[change.category] ?? "Change"}</Typography>
              {change.label && <Typography sx={{ whiteSpace: "pre-wrap" }}>{change.label}</Typography>}
            </Box>)}
          </Stack>}
      </>}
    </Stack>
  </Box>;
}
