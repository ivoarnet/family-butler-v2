import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { HouseholdData } from "../features/app/types";
import type { CalendarReportDay } from "../features/reports/components/CalendarReportPdf";
import { DayConfiguration, HouseholdEvent, ResolvedChildcareOccurrence, ResolvedParentingInterval } from "../types/family";

const CalendarReportPdf = lazy(() => import("../features/reports/components/CalendarReportPdf")
  .then(({ CalendarReportPdf: Component }) => ({ default: Component })));
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const REPORT_LOCALE = "de-CH";

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
};

const parseDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
};

const addDays = (date: Date, amount: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};

const buildDateRange = (startDate: string, endDate: string): Date[] => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return [];
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
};

const timeLabel = (event: HouseholdEvent, day: string): string => {
  if (event.allDay) return "All day";
  const start = event.startTime?.slice(0, 5);
  const end = event.endTime?.slice(0, 5);
  if (event.endDate && event.endDate > event.date) {
    if (day === event.date) return start ? `${start} →` : "Starts";
    if (day === event.endDate) return end ? `← ${end}` : "Ends";
    return "Continues";
  }
  return start && end ? `${start}–${end}` : start ?? end ?? "";
};

const repeatFrequency = (event: HouseholdEvent): string | null =>
  event.repeatRule?.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/)?.[1] ?? null;

const occursOnDay = (event: HouseholdEvent, day: Date): boolean => {
  const start = parseDate(event.date);
  if (!start || day < start) return false;
  const dayIso = toIsoDate(day);
  const frequency = repeatFrequency(event);
  if (!frequency) return dayIso >= event.date && dayIso <= (event.endDate || event.date);
  const dayUtc = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const diffDays = Math.floor((dayUtc - startUtc) / 86400000);
  if (frequency === "DAILY") return true;
  if (frequency === "WEEKLY") return diffDays % 7 === 0;
  if (frequency === "MONTHLY") return day.getDate() === start.getDate();
  return day.getDate() === start.getDate() && day.getMonth() === start.getMonth();
};

const eventLabel = (event: HouseholdEvent, day: string, eventTypes: HouseholdData["eventTypes"]): string => {
  const eventType = event.eventTypeId ? eventTypes.find((type) => type.id === event.eventTypeId)?.icon : null;
  return [timeLabel(event, day), eventType, event.title].filter(Boolean).join(" · ");
};

const dayConfigurationLabel = (configuration: DayConfiguration): string => {
  const category = configuration.category === "school_off" ? "School holiday"
    : configuration.category === "bank_holiday" ? "Bank holiday" : "Bridge day";
  return `${category}${configuration.label ? ` · ${configuration.label}` : ""}`;
};

const getRequestHeaders = (token: string): HeadersInit => ({
  Authorization: ["Bearer", token].join(" "),
  "x-supabase-auth-token": token,
});

export function ReportsPage({ householdData, accessToken, onGoHome }: {
  householdData: HouseholdData;
  accessToken: string;
  onGoHome: () => void;
}) {
  const [range, setRange] = useState(getDefaultRange);
  const [childcareOccurrences, setChildcareOccurrences] = useState<ResolvedChildcareOccurrence[]>([]);
  const [parentingIntervals, setParentingIntervals] = useState<ResolvedParentingInterval[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const days = useMemo(() => buildDateRange(range.startDate, range.endDate), [range.endDate, range.startDate]);
  const isValidRange = days.length > 0;
  const members = useMemo(
    () => [...householdData.familyMembers].filter((member) => member.visibleInCalendar).sort((a, b) => a.order - b.order),
    [householdData.familyMembers]
  );

  useEffect(() => {
    if (!isValidRange || !householdData.householdId || !accessToken) {
      setChildcareOccurrences([]);
      setParentingIntervals([]);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
    const parentingQuery = new URLSearchParams({
      startAt: parseDate(range.startDate)!.toISOString(),
      endAt: addDays(parseDate(range.endDate)!, 1).toISOString(),
    });
    setIsLoading(true);
    setLoadError("");
    setChildcareOccurrences([]);
    setParentingIntervals([]);
    Promise.all([
      fetch(`${API_BASE_URL}/api/households/${encodeURIComponent(householdData.householdId)}/childcare/occurrences?${query}`, {
        headers: getRequestHeaders(accessToken), signal: controller.signal,
      }),
      fetch(`${API_BASE_URL}/api/households/${encodeURIComponent(householdData.householdId)}/parenting-time/resolve?${parentingQuery}`, {
        headers: getRequestHeaders(accessToken), signal: controller.signal,
      }),
    ])
      .then(async ([childcareResponse, parentingResponse]) => {
        if (!childcareResponse.ok) throw new Error("Childcare could not be loaded for this report.");
        if (!parentingResponse.ok) throw new Error("Parenting time could not be loaded for this report.");
        const [childcare, parenting] = await Promise.all([
          childcareResponse.json() as Promise<{ occurrences?: ResolvedChildcareOccurrence[] }>,
          parentingResponse.json() as Promise<{ intervals?: ResolvedParentingInterval[] }>,
        ]);
        if (controller.signal.aborted) return;
        setChildcareOccurrences(Array.isArray(childcare.occurrences) ? childcare.occurrences : []);
        setParentingIntervals(Array.isArray(parenting.intervals) ? parenting.intervals : []);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Calendar specials could not be loaded.");
          setChildcareOccurrences([]);
          setParentingIntervals([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, householdData.householdId, isValidRange, range.endDate, range.startDate]);

  const reportDays = useMemo<CalendarReportDay[]>(() => days.map((day) => {
    const isoDate = toIsoDate(day);
    const memberEntries: Record<string, string[]> = {};
    const sharedEntries: string[] = [];
    householdData.events.filter((event) => occursOnDay(event, day)).forEach((event) => {
      const assignedMembers = members.filter((member) => event.memberIds.includes(member.id));
      const label = eventLabel(event, isoDate, householdData.eventTypes);
      if (assignedMembers.length === 0) sharedEntries.push(label);
      else assignedMembers.forEach((member) => (memberEntries[member.id] ??= []).push(label));
    });
    const birthdays = householdData.contacts
      .filter((contact) => contact.birthDay === day.getDate() && contact.birthMonth === day.getMonth() + 1)
      .map((contact) => `Birthday · ${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`);
    const configurations = householdData.dayConfigurations
      .filter((configuration) => configuration.startDate <= isoDate && configuration.endDate >= isoDate)
      .map(dayConfigurationLabel);
    const childcare = childcareOccurrences.filter((item) => item.date === isoDate).map((item) => {
      const time = item.allDay ? "All day" : `${item.startTime ?? ""}–${item.endTime ?? ""}`;
      const children = item.childIds
        .map((id) => householdData.familyMembers.find((member) => member.id === id)?.firstName)
        .filter((name): name is string => Boolean(name));
      return `Care · ${item.providerName ?? "Care provider"} · ${time}${children.length ? ` · ${children.join(", ")}` : ""}`;
    });
    const handovers = parentingIntervals.filter((interval) => {
      const start = new Date(interval.startAt);
      return start >= day && start < addDays(day, 1)
        && parentingIntervals.some((previous) => previous.endAt === interval.startAt && previous.partyId !== interval.partyId);
    }).map((interval) => {
      const start = new Date(interval.startAt);
      const time = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      return `Parenting · ${interval.partyName ?? "Parenting party"} · ${time}`;
    });
    return {
      date: isoDate,
      label: `${new Intl.DateTimeFormat(REPORT_LOCALE, { weekday: "short" }).format(day)} ${day.getDate()}`,
      memberEntries,
      sharedEntries,
      specials: [...configurations, ...childcare, ...birthdays, ...handovers],
    };
  }), [childcareOccurrences, days, householdData.contacts, householdData.dayConfigurations, householdData.eventTypes,
    householdData.events, householdData.familyMembers, members, parentingIntervals]);

  const reportWeeks = useMemo(() => Array.from(
    { length: Math.ceil(reportDays.length / 7) },
    (_, index) => reportDays.slice(index * 7, index * 7 + 7)
  ), [reportDays]);
  const updateRange = (field: "startDate" | "endDate", value: string) => setRange((current) => ({ ...current, [field]: value }));

  return (
    <div className="reports-page">
      <header className="dashboard-header reports-header">
        <div className="header-branding">
          <div className="icon-badge" aria-hidden="true"><AssessmentOutlinedIcon /></div>
          <div><h1>Reports &amp; exports</h1><p>{householdData.householdName}</p></div>
        </div>
        <div className="reports-header-actions">
          <button type="button" className="secondary-pill" onClick={onGoHome}>
            <CalendarMonthIcon fontSize="small" /> Back to calendar
          </button>
        </div>
      </header>
      <main className="reports-main">
        <section className="report-panel">
          <div className="report-intro">
            <div>
              <h2>Calendar report</h2>
              <p>Choose an inclusive date range and download a landscape A3 calendar with household members as rows.</p>
            </div>
            <div className="report-export">
              {isValidRange && <Suspense fallback={<span role="status">Preparing PDF…</span>}>
                <CalendarReportPdf
                  startDate={range.startDate}
                  endDate={range.endDate}
                  members={members.map((member) => ({ id: member.id, name: member.firstName }))}
                  days={reportDays}
                />
              </Suspense>}
            </div>
          </div>
          <div className="report-date-controls">
            <label>From
              <input type="date" value={range.startDate} onChange={(event) => updateRange("startDate", event.target.value)} />
            </label>
            <label>To
              <input type="date" value={range.endDate} onChange={(event) => updateRange("endDate", event.target.value)} />
            </label>
            <span>Default: first day of next month through the end of the following three months.</span>
          </div>
          {!isValidRange && <p className="report-error" role="alert">Choose valid dates and make sure the end date is not before the start date.</p>}
          {loadError && <p className="report-error" role="status">{loadError} The PDF still includes calendar events and configured special days.</p>}
          {isLoading && <p className="report-loading" role="status">Loading childcare and parenting time…</p>}
          {isValidRange && <div className="report-preview">
            {reportWeeks.map((week, index) => (
              <div className="report-week" key={week[0]?.date ?? index}>
                <table className="report-table">
                  <thead>
                    <tr><th scope="col">Member</th>{week.map((day) => <th scope="col" key={day.date}>{day.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <th scope="row">{member.firstName}</th>
                        {week.map((day) => <td key={day.date}>{(day.memberEntries[member.id] ?? []).map((entry, entryIndex) =>
                          <span className="report-entry" key={entryIndex}>{entry}</span>)}</td>)}
                      </tr>
                    ))}
                    <tr className="report-secondary-row">
                      <th scope="row">Shared</th>
                      {week.map((day) => <td key={day.date}>{day.sharedEntries.map((entry, entryIndex) =>
                        <span className="report-entry" key={entryIndex}>{entry}</span>)}</td>)}
                    </tr>
                    <tr className="report-secondary-row">
                      <th scope="row">Specials</th>
                      {week.map((day) => <td key={day.date}>{day.specials.map((entry, entryIndex) =>
                        <span className="report-entry" key={entryIndex}>{entry}</span>)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>}
        </section>
        <section className="report-future-panel" aria-label="More reports">
          <h2>More reports and exports</h2>
          <p>Additional household reports and export formats will be added here.</p>
        </section>
      </main>
    </div>
  );
}
