export function formatShareDateTime(value: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("de-CH", {
    timeZone, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("day")}.${part("month")}.${part("year")} ${part("hour")}:${part("minute")}`;
}
