import { useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/de-ch";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { MobileDateTimePicker } from "@mui/x-date-pickers/MobileDateTimePicker";
import type { ResolvedParentingInterval } from "../../../types/family";

const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;
const STEP_MS = 5 * 60 * 1000;
const MIN_HANDOVER_GAP_MS = 30 * 60 * 1000;
const roundUpToStep = (timestamp: number) => Math.ceil(timestamp / STEP_MS) * STEP_MS;
const roundDownToStep = (timestamp: number) => Math.floor(timestamp / STEP_MS) * STEP_MS;
const localDateTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const formatDateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

export function UpcomingParentingTimeline({ intervals, busy, onAdjust }: {
  intervals: ResolvedParentingInterval[];
  busy: boolean;
  onAdjust: (previous: ResolvedParentingInterval, next: ResolvedParentingInterval, newStartAt: string) => Promise<boolean>;
}) {
  const [selectedHandover, setSelectedHandover] = useState<string | null>(null);
  const [newHandoverTimes, setNewHandoverTimes] = useState<Record<string, string>>({});
  const handovers = intervals.flatMap((next, index) => {
    const previous = intervals[index - 1];
    if (!previous || previous.endAt !== next.startAt || previous.partyId === next.partyId) return [];
    return [{ previous, next, key: `${next.startAt}-${next.partyId}` }];
  });

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="de-ch">
    <div className="parenting-timeline" role="region" aria-label="Upcoming parenting timeline">
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
      const minTimestamp = roundUpToStep(Math.max(handoverAt - MAX_SHIFT_MS, previousHandoverAt === null
        ? Number.NEGATIVE_INFINITY : previousHandoverAt + MIN_HANDOVER_GAP_MS));
      const maxTimestamp = roundDownToStep(Math.min(handoverAt + MAX_SHIFT_MS, followingHandoverAt === null
        ? Number.POSITIVE_INFINITY : followingHandoverAt - MIN_HANDOVER_GAP_MS));
      const minDateTime = localDateTime(minTimestamp);
      const maxDateTime = localDateTime(maxTimestamp);
      const selectedTime = newHandoverTimes[key] ?? localDateTime(handoverAt);
      const selectedDateTime = dayjs(selectedTime);
      const selectedTimestamp = selectedDateTime.valueOf();
      const shift = selectedTimestamp - handoverAt;
      const editable = previous.source.type === "plan" && next.source.type === "plan" && minTimestamp <= maxTimestamp;
      return <div className="parenting-timeline-handover" key={key}>
        <div>
          <strong>{previous.partyName ?? "Parent"} → {next.partyName ?? "Parent"}</strong>
          <span>{formatDateTime(next.startAt)}</span>
        </div>
        {editable ? <>
          {selectedHandover === key ? <>
            <MobileDateTimePicker
              label={`New handover time · ${previous.partyName ?? "parent"} to ${next.partyName ?? "parent"}`}
              ampm={false}
              views={["day", "hours", "minutes"]}
              minutesStep={5}
              format="DD.MM.YYYY HH:mm"
              minDateTime={dayjs(minDateTime)}
              maxDateTime={dayjs(maxDateTime)}
              value={selectedDateTime.isValid() ? selectedDateTime : null}
              onChange={(value) => setNewHandoverTimes((current) => ({
                ...current,
                [key]: value?.isValid() ? value.format("YYYY-MM-DDTHH:mm") : "",
              }))}
              disabled={busy}
              slotProps={{ textField: { fullWidth: true, size: "small" } }} />
            <button type="button" className="primary-pill no-wrap-button"
              disabled={busy || !selectedDateTime.isValid() || selectedDateTime.minute() % 5 !== 0
                || shift === 0 || Math.abs(shift) > MAX_SHIFT_MS
                || selectedTimestamp < minTimestamp || selectedTimestamp > maxTimestamp}
              onClick={async () => {
                const saved = await onAdjust(previous, next, selectedDateTime.toDate().toISOString());
                if (saved) {
                  setSelectedHandover(null);
                  setNewHandoverTimes((current) => {
                    const remaining = { ...current };
                    delete remaining[key];
                    return remaining;
                  });
                }
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
    </div>
    </LocalizationProvider>
  );
}
