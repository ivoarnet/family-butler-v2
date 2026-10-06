import { Box, Stack, Typography } from "@mui/material";
import type { ChildcareOccurrence } from "./ChildcareSettings";

export function ProviderCareCalendar({ occurrences, startDate, endDate, providerName, participantNames }: {
  occurrences: ChildcareOccurrence[]; startDate: string; endDate: string;
  providerName: (id: string) => string; participantNames: (ids: string[]) => string;
}) {
  const months: Date[] = [];
  const month = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  while (month.getTime() <= Date.parse(`${endDate}T00:00:00Z`)) {
    months.push(new Date(month));
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  const byDate = new Map<string, ChildcareOccurrence[]>();
  for (const item of occurrences) {
    const items = byDate.get(item.date) ?? [];
    items.push(item);
    byDate.set(item.date, items);
  }
  return <Stack spacing={2}>
    {!occurrences.length && <Typography>No care occurrences in this range.</Typography>}
    {months.map((firstDay) => {
      const offset = (firstDay.getUTCDay() + 6) % 7;
      const lastDay = new Date(firstDay);
      lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
      const cells = Math.ceil((offset + lastDay.getUTCDate()) / 7) * 7;
      const title = firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
      return <div className="table-scroll" key={firstDay.toISOString()}>
        <table className="settings-table provider-care-calendar" aria-label={`Provider care calendar · ${title}`}>
          <caption>{title}</caption>
          <thead><tr>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) =>
            <th scope="col" key={day}>{day}</th>)}</tr></thead>
          <tbody>{Array.from({ length: cells / 7 }, (_, week) => <tr key={week}>
            {Array.from({ length: 7 }, (_, weekday) => {
              const day = week * 7 + weekday - offset + 1;
              if (day < 1 || day > lastDay.getUTCDate()) return <td key={weekday} />;
              const date = `${firstDay.toISOString().slice(0, 7)}-${String(day).padStart(2, "0")}`;
              const inRange = date >= startDate && date <= endDate;
              return <td key={weekday} aria-label={date}>
                <Typography component="time" dateTime={date} sx={{ opacity: inRange ? 1 : 0.4 }}>{day}</Typography>
                {inRange && <Stack spacing={1} sx={{ mt: 1 }}>{(byDate.get(date) ?? []).map((item) =>
                  <Box key={item.id} sx={{ borderLeft: "3px solid", borderColor: "primary.main", pl: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{providerName(item.providerId)}</Typography>
                    <Typography variant="body2">{item.allDay ? "All day" : `${item.startTime}–${item.endTime}`}</Typography>
                    <Typography variant="body2">{participantNames(item.childIds)}</Typography>
                    <Typography variant="caption">{item.overrideAction === "add" ? "Added day" :
                      item.overrideAction ? `Changed · ${item.overrideAction}` : "Recurring"}</Typography>
                    {item.date !== item.originalDate && <Typography variant="caption" sx={{ display: "block" }}>Originally {item.originalDate}</Typography>}
                  </Box>)}</Stack>}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>;
    })}
  </Stack>;
}
