import type { ResolvedParentingInterval } from "../../../types/family";

export function ParentingAwayBackground({ day, intervals, householdPartyIds, activePartyIds }: {
  day: Date;
  intervals: ResolvedParentingInterval[];
  householdPartyIds: string[];
  activePartyIds: string[];
}) {
  if (householdPartyIds.length === 0) return null;
  const start = day.getTime();
  const tomorrow = new Date(day);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = tomorrow.getTime();
  const position = (timestamp: number) => 100 * (timestamp - start) / (end - start);
  const away = intervals.filter((interval) => activePartyIds.includes(interval.partyId)
    && !householdPartyIds.includes(interval.partyId)
    && Date.parse(interval.startAt) < end && Date.parse(interval.endAt) > start);
  const handovers = intervals.filter((interval) => {
    const at = Date.parse(interval.startAt);
    return at >= start && at < end && activePartyIds.includes(interval.partyId) && intervals.some((previous) =>
      previous.endAt === interval.startAt && previous.partyId !== interval.partyId && activePartyIds.includes(previous.partyId));
  });
  if (away.length === 0 && handovers.length === 0) return null;
  return <div className="parenting-away-background" aria-hidden="true">
    {away.map((interval) => {
      const from = Math.max(start, Date.parse(interval.startAt));
      const until = Math.min(end, Date.parse(interval.endAt));
      return <span key={`${interval.startAt}-${interval.partyId}`} className="parenting-away-segment"
        data-party-id={interval.partyId}
        style={{ top: `${position(from)}%`, height: `${position(until) - position(from)}%` }} />;
    })}
    {handovers.map((interval) => <span key={interval.startAt} className="parenting-handoff-marker"
      style={{ top: `${Math.min(94, position(Date.parse(interval.startAt)))}%` }}>
      {new Date(interval.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
      {" → "}{interval.partyName ?? "Parenting party"}
    </span>)}
  </div>;
}
