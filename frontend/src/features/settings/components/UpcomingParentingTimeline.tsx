import { useState } from "react";
import type { ResolvedParentingInterval } from "../../../types/family";

const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;
const STEP_MS = 30 * 60 * 1000;
const localDateTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const formatDateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

export function UpcomingParentingTimeline({ intervals, busy, onAdjust, onNavigate }: {
  intervals: ResolvedParentingInterval[];
  busy: boolean;
  onAdjust: (previous: ResolvedParentingInterval, next: ResolvedParentingInterval, newStartAt: string) => void;
  onNavigate: (days: number) => void;
}) {
  const [selectedHandover, setSelectedHandover] = useState<string | null>(null);
  const [newHandoverTimes, setNewHandoverTimes] = useState<Record<string, string>>({});
  const handovers = intervals.flatMap((next, index) => {
    const previous = intervals[index - 1];
    if (!previous || previous.endAt !== next.startAt || previous.partyId === next.partyId) return [];
    return [{ previous, next, key: `${next.startAt}-${next.partyId}` }];
  });

  return <div className="parenting-timeline" role="region" aria-label="Upcoming parenting timeline">
    <div className="parenting-timeline-navigation" role="group" aria-label="Timeline navigation">
      <button type="button" aria-label="Show earlier timeslices" disabled={busy} onClick={() => {
        setSelectedHandover(null);
        setNewHandoverTimes({});
        onNavigate(-14);
      }}>←</button>
      <span>Next 14 days</span>
      <button type="button" aria-label="Show later timeslices" disabled={busy} onClick={() => {
        setSelectedHandover(null);
        setNewHandoverTimes({});
        onNavigate(14);
      }}>→</button>
    </div>
    <div className="parenting-timeline-track">
      {intervals.map((interval, index) => <div className="parenting-timeline-segment" key={`${interval.startAt}-${index}`}>
        <strong>{interval.partyName ?? "Parenting party"}</strong>
        <span>{formatDateTime(interval.startAt)}</span>
      </div>)}
    </div>
    {handovers.map(({ previous, next, key }, index) => {
      const handoverAt = Date.parse(next.startAt);
      const previousHandoverAt = index > 0 ? Date.parse(handovers[index - 1].next.startAt) : null;
      const followingHandoverAt = index + 1 < handovers.length ? Date.parse(handovers[index + 1].next.startAt) : null;
      const minShift = previousHandoverAt === null ? -MAX_SHIFT_MS
        : Math.max(-MAX_SHIFT_MS, Math.ceil((previousHandoverAt + STEP_MS - handoverAt) / STEP_MS) * STEP_MS);
      const maxShift = followingHandoverAt === null ? MAX_SHIFT_MS
        : Math.min(MAX_SHIFT_MS, Math.floor((followingHandoverAt - STEP_MS - handoverAt) / STEP_MS) * STEP_MS);
      const minDateTime = localDateTime(handoverAt + minShift);
      const maxDateTime = localDateTime(handoverAt + maxShift);
      const selectedTime = newHandoverTimes[key] ?? localDateTime(handoverAt);
      const selectedTimestamp = new Date(selectedTime).getTime();
      const shift = selectedTimestamp - handoverAt;
      const editable = previous.source.type === "plan" && next.source.type === "plan" && minShift <= maxShift;
      return <div className="parenting-timeline-handover" key={key}>
        <div>
          <strong>{previous.partyName ?? "Parent"} → {next.partyName ?? "Parent"}</strong>
          <span>{formatDateTime(next.startAt)}</span>
        </div>
        {editable ? <>
          {selectedHandover === key ? <>
            <input type="datetime-local" step={1800} min={minDateTime} max={maxDateTime}
              value={selectedTime} disabled={busy}
              aria-label={`New handover date and time from ${previous.partyName ?? "parent"} to ${next.partyName ?? "parent"}`}
              onChange={(event) => setNewHandoverTimes((current) => ({ ...current, [key]: event.target.value }))} />
            <button type="button" className="primary-pill no-wrap-button"
              disabled={busy || !Number.isFinite(selectedTimestamp) || shift === 0 || shift % STEP_MS !== 0
                || Math.abs(shift) > MAX_SHIFT_MS || shift < minShift || shift > maxShift}
              onClick={async () => {
                await onAdjust(previous, next, new Date(selectedTimestamp).toISOString());
                setSelectedHandover(null);
                setNewHandoverTimes((current) => {
                  const remaining = { ...current };
                  delete remaining[key];
                  return remaining;
                });
              }}>
              Save new time
            </button>
          </> : <button type="button" className="parenting-handover-select" disabled={busy}
            aria-label={`Select handover time from ${previous.partyName ?? "parent"} to ${next.partyName ?? "parent"}`}
            onClick={() => setSelectedHandover(key)}>
            Choose a new time
          </button>}
        </> : <span>{previous.source.type === "plan" && next.source.type === "plan"
          ? "Handovers are too close to adjust here." : "Adjust this handover in parenting-time settings"}</span>}
      </div>;
    })}
    {!handovers.length && <p>No upcoming handovers in this preview.</p>}
  </div>;
}
