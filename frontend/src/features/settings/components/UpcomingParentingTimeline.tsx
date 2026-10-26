import { useState } from "react";
import type { ResolvedParentingInterval } from "../../../types/family";

const MAX_SHIFT_MINUTES = 24 * 60;
const formatDateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));
const formatShift = (minutes: number) => {
  if (minutes === 0) return "No change";
  const absolute = Math.abs(minutes);
  const amount = absolute % 60 === 0 ? `${absolute / 60}h` : `${absolute} min`;
  return `${minutes < 0 ? "Earlier" : "Later"} by ${amount}`;
};

export function UpcomingParentingTimeline({ intervals, busy, onAdjust }: {
  intervals: ResolvedParentingInterval[];
  busy: boolean;
  onAdjust: (previous: ResolvedParentingInterval, next: ResolvedParentingInterval, minutes: number) => void;
}) {
  const [shifts, setShifts] = useState<Record<string, number>>({});
  const handovers = intervals.flatMap((next, index) => {
    const previous = intervals[index - 1];
    if (!previous || previous.endAt !== next.startAt || previous.partyId === next.partyId) return [];
    return [{ previous, next, key: `${next.startAt}-${next.partyId}` }];
  });

  return <div className="parenting-timeline" role="region" aria-label="Upcoming parenting timeline">
    <div className="parenting-timeline-track" aria-hidden="true">
      {intervals.map((interval, index) => <div className="parenting-timeline-segment" key={`${interval.startAt}-${index}`}>
        <strong>{interval.partyName ?? "Parenting party"}</strong>
        <span>{formatDateTime(interval.startAt)} – {formatDateTime(interval.endAt)}</span>
      </div>)}
    </div>
    {handovers.map(({ previous, next, key }, index) => {
      const handoverAt = Date.parse(next.startAt);
      const previousHandoverAt = index > 0 ? Date.parse(handovers[index - 1].next.startAt) : null;
      const followingHandoverAt = index + 1 < handovers.length ? Date.parse(handovers[index + 1].next.startAt) : null;
      const minShift = previousHandoverAt === null ? -MAX_SHIFT_MINUTES
        : Math.max(-MAX_SHIFT_MINUTES, Math.ceil((previousHandoverAt + 5 * 60_000 - handoverAt) / 300_000) * 5);
      const maxShift = followingHandoverAt === null ? MAX_SHIFT_MINUTES
        : Math.min(MAX_SHIFT_MINUTES, Math.floor((followingHandoverAt - 5 * 60_000 - handoverAt) / 300_000) * 5);
      const shift = Math.max(minShift, Math.min(maxShift, shifts[key] ?? 0));
      const editable = previous.source.type === "plan" && next.source.type === "plan" && minShift <= maxShift;
      return <div className="parenting-timeline-handover" key={key}>
        <div>
          <strong>{previous.partyName ?? "Parent"} → {next.partyName ?? "Parent"}</strong>
          <span>{formatDateTime(next.startAt)}{shift ? ` · ${formatShift(shift)}` : ""}</span>
        </div>
        {editable ? <>
          <input type="range" min={minShift} max={maxShift} step={5} value={shift}
            disabled={busy}
            aria-label={`Adjust handover from ${previous.partyName ?? "parent"} to ${next.partyName ?? "parent"} by up to 24 hours`}
            onChange={(event) => setShifts((current) => ({ ...current, [key]: Number(event.target.value) }))} />
          <button type="button" className="primary-pill no-wrap-button" disabled={busy || shift === 0}
            onClick={async () => {
              await onAdjust(previous, next, shift);
              setShifts((current) => ({ ...current, [key]: 0 }));
            }}>
            Apply {shift > 0 ? "+" : ""}{shift} min
          </button>
        </> : <span>{previous.source.type === "plan" && next.source.type === "plan"
          ? "Handovers are too close to adjust here." : "Adjust this handover in parenting-time settings"}</span>}
      </div>;
    })}
    {!handovers.length && <p>No upcoming handovers in this preview.</p>}
  </div>;
}
