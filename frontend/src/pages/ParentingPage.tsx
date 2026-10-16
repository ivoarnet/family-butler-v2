import { useEffect, useState, type ReactNode } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HomeIcon from "@mui/icons-material/Home";
import dayjs from "dayjs";

type ParentingRequest = (path: string, init?: RequestInit) => Promise<unknown>;
type Interval = {
  startAt: string;
  endAt: string;
  partyId: string;
  partyName: string | null;
  source: { type: string; label?: string };
};

const formatInterval = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));

export function ParentingPage({ householdId, householdName, request, onGoHome, moduleNavigation }: {
  householdId: string;
  householdName: string;
  request: ParentingRequest;
  onGoHome: () => void;
  moduleNavigation?: ReactNode;
}) {
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const startAt = new Date();
    const endAt = dayjs(startAt).add(3, "month").toDate();
    const query = new URLSearchParams({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
    setLoading(true);
    setError("");
    void request(`/api/households/${encodeURIComponent(householdId)}/parenting-time/resolve?${query}`, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      const data = result as { intervals?: Interval[] };
      setIntervals(Array.isArray(data.intervals) ? data.intervals : []);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Parenting schedule could not be loaded.");
      setIntervals([]);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [householdId, request]);

  return (
    <div className="dashboard-page settings-page">
      <header className="dashboard-header settings-header" role="banner">
        <button type="button" className="icon-button" onClick={() => window.history.length > 1
          ? window.history.back() : onGoHome()} title="Go back" aria-label="Go back">
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className="header-branding">
          {moduleNavigation}
          <div><h1>Parenting</h1><p>{householdName}</p></div>
        </div>
        <button type="button" className="icon-button" onClick={onGoHome}
          title="Go to dashboard" aria-label="Go to dashboard">
          <HomeIcon fontSize="small" />
        </button>
      </header>
      <main className="settings-main">
        <section className="settings-card">
          <div className="section-toolbar"><h2>Upcoming schedule</h2></div>
          {error && <p role="alert">{error}</p>}
          {loading ? <p aria-live="polite">Loading parenting schedule…</p> : intervals.length ? (
            <div className="table-scroll"><table className="settings-table" aria-label="Parenting schedule">
              <thead><tr><th>From</th><th>Until</th><th>With</th><th>Schedule (Remark)</th></tr></thead>
              <tbody>{intervals.map((interval, index) => <tr key={`${interval.startAt}-${index}`}>
                <td>{formatInterval(interval.startAt)}</td>
                <td>{formatInterval(interval.endAt)}</td>
                <td>{interval.partyName ?? "Archived party"}</td>
                <td>{interval.source.type === "change"
                  ? `Change · ${interval.source.label ?? ""}` : "Regular plan"}</td>
              </tr>)}</tbody>
            </table></div>
          ) : !error && <p>No parenting schedule is available for the next three months.</p>}
        </section>
      </main>
    </div>
  );
}
