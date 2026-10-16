import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CakeIcon from "@mui/icons-material/Cake";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import FamilyRestroomIcon from "@mui/icons-material/FamilyRestroom";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LooksIcon from "@mui/icons-material/Looks";
import SettingsIcon from "@mui/icons-material/Settings";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import { Fab } from "@mui/material";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { AgentChat } from "../features/agentic/components/AgentChat";
import { CalendarEventCard } from "../features/dashboard/components/CalendarEventCard";
import { EventDialog, EventDialogFormState } from "../features/dashboard/components/EventDialog";
import { EventDetailDialog } from "../features/dashboard/components/EventDetailDialog";
import { ParentingResponsibilityWarning } from "../features/dashboard/components/ParentingResponsibilityWarning";
import { ParentingAwayBackground } from "../features/dashboard/components/ParentingAwayBackground";
import { AvatarContextMenu } from "../shared/ui/AvatarContextMenu";
import { HouseholdData, NavigationTarget } from "../features/app/types";
import { Contact, DayConfiguration, DayConfigurationCategory, FamilyMember, HouseholdEvent, ResolvedChildcareOccurrence, ResolvedParentingInterval, ParentingParty } from "../types/family";
import type { Dispatch, ElementType, ReactNode, SetStateAction } from "react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

interface SpecialEvent {
  id: string;
  type: "birthday" | "other";
  date: string;
  label: string;
  birthYear?: number;
}

interface DayCellDecorations {
  corners: Array<{ id: string; category: DayConfigurationCategory; marker: string; icon: ElementType<SvgIconProps>; label: string | null }>;
}

function ChildcareCalendarEntry({
  occurrence,
  members,
}: {
  occurrence: ResolvedChildcareOccurrence;
  members: FamilyMember[];
}) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const childNames = occurrence.childIds
    .map((childId) => memberById.get(childId)?.firstName)
    .filter((name): name is string => Boolean(name));
  const changeLabel = occurrence.overrideAction === "move"
    ? `Moved from ${occurrence.originalDate}`
    : occurrence.overrideAction === "add" ? "Added care day"
      : occurrence.overrideAction === "replace" ? "One-off adjustment" : null;
  const details = [
    occurrence.allDay ? "All day" : `${occurrence.startTime} – ${occurrence.endTime}`,
    `For ${childNames.join(", ") || "household children"}`,
    changeLabel,
  ].filter(Boolean).join(" · ");
  const providerName = occurrence.providerName ?? "Care provider";

  return (
    <div
      className="specials-entry calendar-childcare-entry"
      title={`${providerName} · ${details}`}
      aria-label={`Childcare: ${providerName}. ${details}`}
    >
      <ChildCareIcon className="calendar-childcare-icon" fontSize="small" aria-hidden="true" />
      <strong>{providerName}</strong>
      <small>{childNames.length ? `For ${childNames.join(", ")}` : "For household children"}</small>
    </div>
  );
}

function BirthdayCalendarEntry({ event }: { event: SpecialEvent }) {
  const label = formatBirthdayLabel(event);

  return (
    <div className="specials-entry calendar-birthday-entry" title={`Birthday: ${label}`} aria-label={`Birthday: ${label}. Birthday`}>
      <CakeIcon className="calendar-special-icon" fontSize="small" aria-hidden="true" />
      <strong>{label}</strong>
      <small>Birthday</small>
    </div>
  );
}

function ParentingCalendarEntry({ interval, day, intervals }: {
  interval: ResolvedParentingInterval;
  day: Date;
  intervals: ResolvedParentingInterval[];
}) {
  const start = new Date(interval.startAt);
  const end = new Date(interval.endAt);
  const nextDay = addDays(day, 1);
  const time = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const previous = intervals.find((item) => item.endAt === interval.startAt && item.partyId !== interval.partyId);
  const next = intervals.find((item) => item.startAt === interval.endAt && item.partyId !== interval.partyId);
  const change = interval.source.type === "change";
  const partyName = interval.partyName ?? "Parenting party";
  const timeLabel = start <= day && end >= nextDay ? "All day"
    : `${start <= day ? "00:00" : time(start)} – ${end >= nextDay ? "24:00" : time(end)}`;
  const handOffTime = previous && start >= day && start < nextDay ? time(start) : null;
  const details = [
    timeLabel,
    `${change ? "Adjusted responsibility" : "Normal plan"}: ${start.toLocaleString()} – ${end.toLocaleString()}`,
    change && `One-off change${interval.source.type === "change" && interval.source.label ? ` · ${interval.source.label}` : ""}`,
    previous && start >= day && start < nextDay && `Handover from ${previous.partyName} at ${time(start)}`,
    next && end > day && end <= nextDay && `Handover to ${next.partyName} at ${time(end)}`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="specials-entry calendar-parenting-entry"
      title={`Parenting · ${partyName} · ${details}`}
      aria-label={`Parenting: ${partyName}. ${details}`}>
      <FamilyRestroomIcon className="calendar-special-icon" fontSize="small" aria-hidden="true" />
      <strong>Parenting</strong>
      <small>{handOffTime ? `${handOffTime} → ${partyName}` : partyName}</small>
    </div>
  );
}

const DEMO_LOCALE = "de-CH";
const DAY_CONFIGURATION_META: Record<DayConfigurationCategory, { defaultMarker: string; icon: ElementType<SvgIconProps>; className: string }> = {
  school_off: { defaultMarker: "SH", icon: WbSunnyIcon, className: "school-off" },
  bank_holiday: { defaultMarker: "BH", icon: AccountBalanceIcon, className: "bank-holiday" },
  bridge_day: { defaultMarker: "BD", icon: LooksIcon, className: "bridge-day" },
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const startOfWeekMonday = (date: Date): Date => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dayOfWeek);
  return copy;
};

const getIsoWeekNumber = (date: Date): number => {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - dayOfWeek + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);

  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
};

const formatPeriodRange = (start: Date, locale: string): string => {
  const end = addDays(start, 13);
  const startDay = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(start);
  const startMonth = new Intl.DateTimeFormat(locale, { month: "long" }).format(start);
  const endDay = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(end);
  const endMonth = new Intl.DateTimeFormat(locale, { month: "long" }).format(end);
  const endYear = new Intl.DateTimeFormat(locale, { year: "numeric" }).format(end);

  if (start.getMonth() === end.getMonth()) {
    return `${startDay}. ${startMonth} – ${endDay}. ${startMonth} ${endYear}`;
  }

  return `${startDay}. ${startMonth} – ${endDay}. ${endMonth} ${endYear}`;
};

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
};

const buildChildcareListDays = (date: Date): Date[] => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = addMonths(start, 3);
  return Array.from({ length: Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1 },
    (_, index) => addDays(start, index));
};

const getWeekdayAbbreviation = (date: Date, locale: string): string => {
  const abbreviation = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(",", "");
  return abbreviation.endsWith(".") ? abbreviation.toUpperCase() : `${abbreviation.toUpperCase()}.`;
};

const getDayLabel = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);

const formatBirthdayLabel = (specialEvent: SpecialEvent): string => {
  if (!specialEvent.birthYear) {
    return specialEvent.label;
  }

  const occurringYear = Number.parseInt(specialEvent.date.slice(0, 4), 10);
  const age = occurringYear - specialEvent.birthYear;

  if (!Number.isFinite(age) || age < 0) {
    return specialEvent.label;
  }

  return `${specialEvent.label} (${age})`;
};

const buildBirthdayEvents = (contacts: Contact[], days: Date[]): SpecialEvent[] => {
  const birthdayEvents: SpecialEvent[] = [];

  for (const day of days) {
    for (const contact of contacts) {
      if (!contact.birthDay || !contact.birthMonth) {
        continue;
      }

      if (day.getDate() !== contact.birthDay || day.getMonth() + 1 !== contact.birthMonth) {
        continue;
      }

      birthdayEvents.push({
        id: `${contact.id}-${toIsoDate(day)}`,
        type: "birthday",
        date: toIsoDate(day),
        label: `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`,
        birthYear: contact.birthYear,
      });
    }
  }

  return birthdayEvents;
};

const getDayConfigurationMarker = (dayConfiguration: DayConfiguration): string => {
  return DAY_CONFIGURATION_META[dayConfiguration.category].defaultMarker;
};

const buildEventFormState = (date: string): EventDialogFormState => ({
  title: "",
  memberIds: [],
  date,
  multiDay: false,
  endDate: "",
  allDay: true,
  startTime: "",
  endTime: "",
  eventTypeId: "",
  repeatRule: "",
  location: "",
  notes: "",
});

const normalizeTime24Hour = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return "";
  }
  return `${match[1]}:${match[2]}`;
};

const isFiveMinuteStepTime = (value: string): boolean => {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return false;
  }
  return Number.parseInt(match[2], 10) % 5 === 0;
};

const buildEventFormStateFromEvent = (event: HouseholdEvent): EventDialogFormState => ({
  title: event.title,
  memberIds: [...event.memberIds],
  date: event.date,
  multiDay: Boolean(event.endDate && event.endDate > event.date),
  endDate: event.endDate ?? "",
  allDay: event.allDay,
  startTime: normalizeTime24Hour(event.startTime),
  endTime: normalizeTime24Hour(event.endTime),
  eventTypeId: event.eventTypeId ?? "",
  repeatRule: event.repeatRule ?? "",
  location: event.location ?? "",
  notes: event.notes ?? "",
});

const parseDateOnly = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getRepeatFrequency = (repeatRule: string | undefined): "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null => {
  if (!repeatRule) {
    return null;
  }
  const match = repeatRule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
  const frequency = match?.[1];
  return frequency === "DAILY" || frequency === "WEEKLY" || frequency === "MONTHLY" || frequency === "YEARLY"
    ? frequency
    : null;
};

const eventOccursOnDay = (event: HouseholdEvent, day: Date): boolean => {
  const eventDate = parseDateOnly(event.date);
  if (!eventDate) {
    return false;
  }
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const eventStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const dayIso = toIsoDate(dayStart);
  if (dayStart.getTime() < eventStart.getTime()) {
    return false;
  }

  const repeatFrequency = getRepeatFrequency(event.repeatRule);
  if (!repeatFrequency) {
    return dayIso >= event.date && dayIso <= (event.endDate || event.date);
  }

  const diffDays = Math.floor((dayStart.getTime() - eventStart.getTime()) / (24 * 60 * 60 * 1000));
  if (repeatFrequency === "DAILY") {
    return true;
  }
  if (repeatFrequency === "WEEKLY") {
    return diffDays % 7 === 0;
  }
  if (repeatFrequency === "MONTHLY") {
    return dayStart.getDate() === eventStart.getDate();
  }
  if (repeatFrequency === "YEARLY") {
    return dayStart.getDate() === eventStart.getDate() && dayStart.getMonth() === eventStart.getMonth();
  }
  return false;
};

const formatEventTimeLabel = (event: HouseholdEvent, day: string): string => {
  if (event.allDay) {
    return "All day";
  }
  const start = normalizeTime24Hour(event.startTime);
  const end = normalizeTime24Hour(event.endTime);
  if (event.endDate && event.endDate > event.date) {
    if (day === event.date) {
      return start ? `${start} →` : "Starts";
    }
    if (day === event.endDate && end) {
      return `← ${end}`;
    }
    return "Continues";
  }
  if (start && end) {
    return `${start}-${end}`;
  }
  return start || end || "";
};

export function DashboardPage({
  householdData,
  setHouseholdData,
  onOpenSettings,
  onOpenReports,
  moduleNavigation,
  currentUserLabel,
  currentUserEmail,
  currentUserInitials,
  currentUserAvatarUrl,
  accessToken,
  onAgentDataChanged,
  onSignOut,
}: {
  householdData: HouseholdData;
  setHouseholdData: Dispatch<SetStateAction<HouseholdData>>;
  onOpenSettings: (target: NavigationTarget) => void;
  onOpenReports: () => void;
  moduleNavigation?: ReactNode;
  currentUserLabel: string;
  currentUserEmail: string;
  currentUserInitials: string;
  currentUserAvatarUrl: string | null;
  accessToken: string;
  onAgentDataChanged: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => new Date());
  const [periodStart, setPeriodStart] = useState(() => startOfWeekMonday(new Date()));
  const [viewMode, setViewMode] = useState<"two-weeks" | "list">("two-weeks");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [cancellingOccurrenceId, setCancellingOccurrenceId] = useState<string | null>(null);
  const [childcareActionError, setChildcareActionError] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [viewingEventId, setViewingEventId] = useState<string | null>(null);
  const [eventFormState, setEventFormState] = useState<EventDialogFormState>(() => buildEventFormState(toIsoDate(new Date())));
  const [eventFormSubmitted, setEventFormSubmitted] = useState(false);
  const [childcareOccurrences, setChildcareOccurrences] = useState<ResolvedChildcareOccurrence[]>([]);
  const [childcareProviders, setChildcareProviders] = useState<Array<[string, string]>>([]);
  const [childcareLoadError, setChildcareLoadError] = useState(false);
  const [parentingIntervals, setParentingIntervals] = useState<ResolvedParentingInterval[]>([]);
  const [parentingParties, setParentingParties] = useState<ParentingParty[]>([]);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  const orderedMembers = useMemo(
    () => [...householdData.familyMembers].sort((a, b) => a.order - b.order),
    [householdData.familyMembers]
  );
  const visibleMembers = useMemo(() => orderedMembers.filter((member) => member.visibleInCalendar), [orderedMembers]);
  const selectedMember = visibleMembers.find((member) => member.id === selectedMemberId);
  const currentDateIso = toIsoDate(now);
  const days = useMemo(
    () => viewMode === "list" ? buildChildcareListDays(new Date(`${currentDateIso}T00:00:00`))
      : Array.from({ length: 14 }, (_, index) => addDays(periodStart, index)),
    [currentDateIso, periodStart, viewMode]
  );
  const specialEvents = useMemo(() => buildBirthdayEvents(householdData.contacts, days), [householdData.contacts, days]);

  useEffect(() => {
    if (!householdData.householdId || !accessToken || days.length === 0) {
      setChildcareOccurrences([]);
      setChildcareProviders([]);
      setChildcareLoadError(false);
      return;
    }

    const controller = new AbortController();
    const startDate = toIsoDate(days[0]);
    const endDate = toIsoDate(days[days.length - 1]);
    setChildcareOccurrences([]);
    setChildcareLoadError(false);
    fetch(`${API_BASE_URL}/api/households/${encodeURIComponent(householdData.householdId)}/childcare/occurrences?startDate=${startDate}&endDate=${endDate}`, {
      headers: {
        Authorization: ["Bearer", accessToken].join(" "),
        "x-supabase-auth-token": accessToken,
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Childcare could not be loaded");
        }
        return response.json() as Promise<{ occurrences?: ResolvedChildcareOccurrence[] }>;
      })
      .then((result) => {
        const occurrences = Array.isArray(result.occurrences) ? result.occurrences : [];
        setChildcareOccurrences(occurrences);
        setChildcareProviders([...new Map(occurrences.map((occurrence) =>
          [occurrence.providerId, occurrence.providerName ?? "Care provider"])).entries()]
          .sort((left, right) => left[1].localeCompare(right[1])));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setChildcareOccurrences([]);
          setChildcareLoadError(true);
        }
      });

    return () => controller.abort();
  }, [accessToken, days, householdData.householdId]);

  useEffect(() => {
    setParentingIntervals([]);
    setParentingParties([]);
    if (!householdData.householdId || !accessToken) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      startAt: days[0].toISOString(),
      endAt: addDays(days[days.length - 1], 1).toISOString(),
    });
    fetch(`${API_BASE_URL}/api/households/${encodeURIComponent(householdData.householdId)}/parenting-time/resolve?${query}`, {
      headers: { Authorization: ["Bearer", accessToken].join(" "), "x-supabase-auth-token": accessToken },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Parenting time could not be loaded");
        return response.json() as Promise<{ intervals: ResolvedParentingInterval[]; parties?: ParentingParty[] }>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setParentingIntervals(data.intervals);
        setParentingParties(data.parties ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setParentingIntervals([]);
          setParentingParties([]);
        }
      });
    return () => controller.abort();
  }, [accessToken, days, householdData.householdId]);

  const activeParentingPartyIds = parentingParties.filter((party) => party.active === true
    && (party.memberId == null || orderedMembers.some((member) => member.id === party.memberId))).map((party) => party.id);
  const householdParentingPartyIds = parentingParties.filter((party) => party.active === true
    && orderedMembers.some((member) => member.id === party.memberId)).map((party) => party.id);
  const isHatchedChild = (memberId: string) => householdParentingPartyIds.length > 0
    && orderedMembers.some((member) => member.id === memberId && member.isChild === true && member.hatchParentingAway === true);

  const birthdayEventsByDate = useMemo(() => {
    const grouped = new Map<string, SpecialEvent[]>();
    specialEvents
      .filter((event) => event.type === "birthday")
      .forEach((event) => {
        const list = grouped.get(event.date) ?? [];
        list.push(event);
        grouped.set(event.date, list);
      });
    return grouped;
  }, [specialEvents]);

  const dayDecorationsByDate = useMemo(() => {
    const grouped = new Map<string, DayCellDecorations>();
    if (days.length === 0) {
      return grouped;
    }

    const dayIsoValues = days.map((day) => toIsoDate(day));
    const firstIso = dayIsoValues[0];
    const lastIso = dayIsoValues[dayIsoValues.length - 1];
    const sortedDayConfigurations = [...householdData.dayConfigurations]
      .filter(
        (dayConfiguration) =>
          /^\d{4}-\d{2}-\d{2}$/.test(dayConfiguration.startDate) &&
          /^\d{4}-\d{2}-\d{2}$/.test(dayConfiguration.endDate) &&
          dayConfiguration.endDate >= dayConfiguration.startDate
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));

    const dayIndexByIso = new Map(dayIsoValues.map((iso, index) => [iso, index]));

    sortedDayConfigurations.forEach((dayConfiguration) => {
      const marker = getDayConfigurationMarker(dayConfiguration);
      if (dayConfiguration.endDate < firstIso || dayConfiguration.startDate > lastIso) {
        return;
      }

      const clampedStartIso = dayConfiguration.startDate < firstIso ? firstIso : dayConfiguration.startDate;
      const clampedEndIso = dayConfiguration.endDate > lastIso ? lastIso : dayConfiguration.endDate;
      const startIndex = dayIndexByIso.get(clampedStartIso);
      const endIndex = dayIndexByIso.get(clampedEndIso);
      if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
        return;
      }

      for (let index = startIndex; index <= endIndex; index += 1) {
        const isoDate = dayIsoValues[index];
        const entry = grouped.get(isoDate) ?? { corners: [] };
        entry.corners.push({
          id: `${dayConfiguration.id}-${isoDate}`,
          category: dayConfiguration.category,
          marker,
          icon: DAY_CONFIGURATION_META[dayConfiguration.category].icon,
          label: dayConfiguration.label?.trim() || null,
        });
        grouped.set(isoDate, entry);
      }
    });

    return grouped;
  }, [days, householdData.dayConfigurations]);

  const eventTypeById = useMemo(() => {
    const entries = householdData.eventTypes.map((eventType) => [eventType.id, eventType] as const);
    return new Map(entries);
  }, [householdData.eventTypes]);
  const memberById = useMemo(() => {
    const entries = orderedMembers.map((member) => [member.id, member] as const);
    return new Map(entries);
  }, [orderedMembers]);

  const eventsByDateAndMember = useMemo(() => {
    const grouped = new Map<string, HouseholdEvent[]>();
    for (const day of days) {
      const dayIso = toIsoDate(day);
      for (const event of householdData.events) {
        if (!eventOccursOnDay(event, day)) {
          continue;
        }
        const dayEntries = grouped.get(dayIso) ?? [];
        dayEntries.push(event);
        grouped.set(dayIso, dayEntries);
        const memberIds = event.memberIds.length > 0 ? event.memberIds : [""];
        memberIds.forEach((memberId) => {
          const key = `${dayIso}|${memberId}`;
          const list = grouped.get(key) ?? [];
          list.push(event);
          grouped.set(key, list);
        });
      }
    }
    grouped.forEach((entries) => {
      entries.sort((a, b) => {
        const aStart = normalizeTime24Hour(a.startTime) || "";
        const bStart = normalizeTime24Hour(b.startTime) || "";
        return aStart.localeCompare(bStart);
      });
    });
    return grouped;
  }, [days, householdData.events]);

  const childcareByDate = useMemo(() => {
    const grouped = new Map<string, ResolvedChildcareOccurrence[]>();
    childcareOccurrences.forEach((occurrence) => {
      const entries = grouped.get(occurrence.date) ?? [];
      entries.push(occurrence);
      grouped.set(occurrence.date, entries);
    });
    return grouped;
  }, [childcareOccurrences]);
  const filteredChildcareOccurrences = childcareOccurrences.filter((occurrence) =>
    !selectedProviderId || occurrence.providerId === selectedProviderId);

  const viewingEvent = useMemo(() => householdData.events.find((event) => event.id === viewingEventId) ?? null, [householdData.events, viewingEventId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAvatarMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!avatarMenuRef.current?.contains(event.target as Node)) {
        setIsAvatarMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAvatarMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAvatarMenuOpen]);

  const openEventDialog = () => {
    setEditingEventId(null);
    setViewingEventId(null);
    setEventFormSubmitted(false);
    setEventFormState(buildEventFormState(toIsoDate(new Date())));
    setIsEventDialogOpen(true);
  };

  const closeEventDialog = () => {
    setIsEventDialogOpen(false);
    setEditingEventId(null);
    setEventFormSubmitted(false);
  };

  const openEventViewDialog = (eventId: string) => {
    setViewingEventId(eventId);
  };

  const closeEventViewDialog = () => {
    setViewingEventId(null);
  };

  const openEditEventDialog = (eventToEdit: HouseholdEvent) => {
    setViewingEventId(null);
    setEditingEventId(eventToEdit.id);
    setEventFormSubmitted(false);
    setEventFormState(buildEventFormStateFromEvent(eventToEdit));
    setIsEventDialogOpen(true);
  };

  const deleteViewingEvent = () => {
    if (!viewingEventId) {
      return;
    }
    setHouseholdData((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== viewingEventId),
    }));
    closeEventViewDialog();
  };

  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEventFormSubmitted(true);
    const title = eventFormState.title.trim();
    const date = eventFormState.date.trim();
    const endDate = eventFormState.multiDay ? eventFormState.endDate.trim() : "";
    if (
      !title ||
      !date ||
      (eventFormState.multiDay && (!endDate || endDate < date)) ||
      eventFormState.memberIds.length === 0
    ) {
      return;
    }

    const startTime = eventFormState.startTime.trim();
    const endTime = eventFormState.endTime.trim();
    if (
      !eventFormState.allDay &&
      ((!eventFormState.multiDay && (!startTime || !endTime)) ||
        (startTime && !isFiveMinuteStepTime(startTime)) ||
        (endTime && !isFiveMinuteStepTime(endTime)) ||
        (startTime && endTime && (!eventFormState.multiDay || endDate === date) && startTime >= endTime))
    ) {
      return;
    }

    const preparedEvent: HouseholdEvent = {
      id: editingEventId ?? crypto.randomUUID(),
      title,
      date,
      endDate: endDate || undefined,
      memberIds: eventFormState.memberIds,
      allDay: eventFormState.allDay || (!startTime && !endTime),
      startTime: eventFormState.allDay ? undefined : startTime || undefined,
      endTime: eventFormState.allDay ? undefined : endTime || undefined,
      eventTypeId: eventFormState.eventTypeId || undefined,
      repeatRule: eventFormState.repeatRule || undefined,
      location: eventFormState.location.trim() || undefined,
      notes: eventFormState.notes.trim() || undefined,
    };

    setHouseholdData((current) => ({
      ...current,
      events: editingEventId
        ? current.events.map((existingEvent) => (existingEvent.id === editingEventId ? preparedEvent : existingEvent))
        : [...current.events, preparedEvent],
    }));
    closeEventDialog();
  };

  const eventTitleError = eventFormSubmitted && !eventFormState.title.trim();
  const eventDateError = eventFormSubmitted && !eventFormState.date.trim();
  const eventEndDateError =
    eventFormSubmitted &&
    eventFormState.multiDay &&
    (!eventFormState.endDate.trim() || eventFormState.endDate < eventFormState.date);
  const eventMemberSelectionError = eventFormSubmitted && eventFormState.memberIds.length === 0;
  const eventTimeErrorMessage =
    eventFormSubmitted && !eventFormState.allDay
      ? !eventFormState.multiDay && (!eventFormState.startTime.trim() || !eventFormState.endTime.trim())
        ? "Begin and end time are required for non all-day events."
        : (eventFormState.startTime.trim() && !isFiveMinuteStepTime(eventFormState.startTime.trim())) ||
            (eventFormState.endTime.trim() && !isFiveMinuteStepTime(eventFormState.endTime.trim()))
          ? "Use 24-hour HH:MM time with 5-minute steps."
        : eventFormState.startTime &&
            eventFormState.endTime &&
            (!eventFormState.multiDay || eventFormState.endDate === eventFormState.date) &&
            eventFormState.startTime >= eventFormState.endTime
          ? "Begin time must be before end time."
          : null
      : null;

  const listDays = viewMode === "list" ? days : [];
  const periodLabel = viewMode === "list"
    ? `Childcare · ${new Intl.DateTimeFormat(DEMO_LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(listDays[0])}`
      + ` – ${new Intl.DateTimeFormat(DEMO_LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(listDays[listDays.length - 1])}`
    : formatPeriodRange(periodStart, DEMO_LOCALE);
  const todayIso = currentDateIso;
  const cancelChildcareOccurrence = async (occurrence: ResolvedChildcareOccurrence) => {
    if (cancellingOccurrenceId) return;
    setCancellingOccurrenceId(occurrence.id);
    setChildcareActionError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/households/${encodeURIComponent(householdData.householdId)}/childcare/overrides`, {
        method: "PUT",
        headers: {
          Authorization: ["Bearer", accessToken].join(" "),
          "x-supabase-auth-token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ arrangementId: occurrence.arrangementId, originalDate: occurrence.originalDate, action: "cancel" }),
      });
      if (!response.ok) throw new Error("Childcare could not be cancelled.");
      setChildcareOccurrences((current) => current.filter((item) => item.id !== occurrence.id));
    } catch (error) {
      setChildcareActionError(error instanceof Error ? error.message : "Childcare could not be cancelled.");
    } finally {
      setCancellingOccurrenceId(null);
    }
  };
  return (
    <div className="dashboard-page">
      <header className="dashboard-header" role="banner">
        <div className="header-branding">
          {moduleNavigation ?? <div className="icon-badge" aria-hidden>
            <CalendarMonthIcon fontSize="medium" />
          </div>}
          <div>
            <h1>{householdData.householdName}</h1>
            <p>{periodLabel}</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-controls">
            <div className="pill-group period-navigation" role="group" aria-label="Period navigation">
              {viewMode !== "list" && <><button
                type="button"
                className="icon-button"
                title="Previous two-week period"
                onClick={() => setPeriodStart((current) => addDays(current, -14))}
              >
                <ChevronLeftIcon fontSize="small" />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Jump to current period"
                onClick={() => setPeriodStart(startOfWeekMonday(new Date()))}
              >
                <CalendarMonthIcon fontSize="small" />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Next two-week period"
                onClick={() => setPeriodStart((current) => addDays(current, 14))}
              >
                <ChevronRightIcon fontSize="small" />
              </button></>}
            </div>

            <div className="pill-group view-switcher" role="group" aria-label="View switcher">
              <button type="button" className={viewMode === "two-weeks" ? "active" : ""} aria-pressed={viewMode === "two-weeks"}
                onClick={() => setViewMode("two-weeks")}>
                2 Weeks
              </button>
              <button type="button" className={viewMode === "list" ? "active" : ""} aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}>
                List
              </button>
            </div>
          </div>

          <div className="header-meta">
            <button type="button" className="icon-button" onClick={onOpenReports} title="Open reports" aria-label="Open reports">
              <AssessmentOutlinedIcon fontSize="small" />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => onOpenSettings("settings")}
              title="Open settings"
              aria-label="Open settings"
            >
              <SettingsIcon fontSize="small" />
            </button>

            <div className="avatar-menu-wrapper" ref={avatarMenuRef}>
              <button
                type="button"
                className="icon-button user-avatar-button"
                onClick={() => setIsAvatarMenuOpen((current) => !current)}
                title={`${currentUserLabel} · Open account menu`}
                aria-label={`${currentUserLabel} · Open account menu`}
                aria-expanded={isAvatarMenuOpen}
                aria-haspopup="menu"
              >
                {currentUserInitials}
              </button>

              {isAvatarMenuOpen ? (
                <AvatarContextMenu
                  currentUserLabel={currentUserLabel}
                  currentUserEmail={currentUserEmail}
                  currentUserInitials={currentUserInitials}
                  currentUserAvatarUrl={currentUserAvatarUrl}
                  onProfileClick={() => {
                    setIsAvatarMenuOpen(false);
                    onOpenSettings("profile");
                  }}
                  onHouseholdsClick={() => {
                    setIsAvatarMenuOpen(false);
                    onOpenSettings("households");
                  }}
                  onLogoutClick={() => {
                    setIsAvatarMenuOpen(false);
                    void onSignOut();
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className={`calendar-card${viewMode === "list" ? " childcare-list-card" : ""}`}
          aria-label={viewMode === "list" ? "Childcare list" : "Two week family calendar"}>
          <div className="calendar-member-filters" role="group"
            aria-label={viewMode === "list" ? "Filter childcare list" : "Filter events by household member"}>
            {viewMode === "list" ? <label className="childcare-provider-filter">
              Provider
              <select aria-label="Filter childcare by provider" value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
                <option value="">All providers</option>
                {childcareProviders.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
              </select>
            </label> : visibleMembers.map((member) => (
              <Fab
                key={member.id}
                size="medium"
                color={selectedMember?.id === member.id ? "primary" : "default"}
                aria-label={`Filter events for ${member.firstName}`}
                aria-pressed={selectedMember?.id === member.id}
                title={member.firstName}
                onClick={() => setSelectedMemberId((current) => current === member.id ? null : member.id)}
                sx={{
                  flexShrink: 0,
                  padding: 0,
                  outline: selectedMember?.id === member.id ? "2px solid var(--accent)" : undefined,
                  outlineOffset: 3,
                  "&.Mui-focusVisible": { outline: "3px solid var(--text-primary)", outlineOffset: 3 },
                }}
              >
                <span className="avatar" style={{ backgroundColor: member.avatarColor, width: "100%", height: "100%" }} aria-hidden="true">
                  {member.firstName.charAt(0)}
                </span>
              </Fab>
            ))}
            <div className="pill-group view-switcher compact-calendar-view-switcher" role="group" aria-label="Calendar view">
              <button type="button" className={viewMode === "two-weeks" ? "active" : ""} aria-pressed={viewMode === "two-weeks"}
                onClick={() => setViewMode("two-weeks")}>2 Weeks</button>
              <button type="button" className={viewMode === "list" ? "active" : ""} aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}>List</button>
            </div>
            <div className="pill-group period-navigation calendar-period-navigation" role="group" aria-label="Period navigation">
              {viewMode !== "list" && <><button
                type="button"
                className="icon-button"
                title="Previous two-week period"
                onClick={() => setPeriodStart((current) => addDays(current, -14))}
              >
                <ChevronLeftIcon fontSize="small" />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Jump to current period"
                onClick={() => setPeriodStart(startOfWeekMonday(new Date()))}
              >
                <CalendarMonthIcon fontSize="small" />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Next two-week period"
                onClick={() => setPeriodStart((current) => addDays(current, 14))}
              >
                <ChevronRightIcon fontSize="small" />
              </button></>}
            </div>
            <span className="calendar-filter-status" role="status">
              {childcareLoadError
                ? "Childcare could not be loaded."
                : viewMode === "list" ? "Childcare entries for the next three months"
                  : selectedMember ? `Events for ${selectedMember.firstName}` : "All events"}
            </span>
          </div>
          {viewMode === "list" ? <div className="calendar-scroll">
            {childcareActionError && <p role="alert">{childcareActionError}</p>}
            <div className="table-scroll"><table className="settings-table childcare-list-table" aria-label="Childcare entries">
              <thead><tr><th>Week number</th><th>Day</th><th>Time</th><th>Day configuration</th><th>Provider</th><th>Actions</th></tr></thead>
              <tbody>{filteredChildcareOccurrences.map((occurrence) => {
                const date = parseDateOnly(occurrence.date);
                const configurations = (dayDecorationsByDate.get(occurrence.date)?.corners ?? []).map((corner) => {
                  const category = corner.category === "school_off" ? "School Off"
                    : corner.category === "bank_holiday" ? "Bank Holiday" : "Bridge Day";
                  return corner.label ? `${category} · ${corner.label}` : category;
                });
                return <tr key={occurrence.id}>
                  <td>{date ? getIsoWeekNumber(date) : "—"}</td>
                  <td>{date ? new Intl.DateTimeFormat(DEMO_LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(date) : occurrence.date}</td>
                  <td>{occurrence.allDay ? "All day" : `${occurrence.startTime ?? ""}–${occurrence.endTime ?? ""}`}</td>
                  <td>{configurations.join(", ") || "—"}</td>
                  <td>{occurrence.providerName ?? "Care provider"}</td>
                  <td><button type="button" className="primary-pill no-wrap-button"
                    aria-label={`Cancel childcare for ${occurrence.date} with ${occurrence.providerName ?? "Care provider"}`}
                    disabled={cancellingOccurrenceId !== null}
                    onClick={() => void cancelChildcareOccurrence(occurrence)}>
                    {cancellingOccurrenceId === occurrence.id ? "Cancelling…" : "Cancel"}
                  </button></td>
                </tr>;
              })}</tbody>
            </table></div>
            {!filteredChildcareOccurrences.length && <p>No childcare entries in this range.</p>}
          </div> : <div className="calendar-scroll">
            <table className="calendar-grid">
              <thead>
                <tr>
                  <th className="week-column-header" scope="col">WEEK</th>
                  <th className="day-column-header" scope="col">DAY</th>
                  {visibleMembers.map((member) => (
                    <th key={member.id} className="member-column-header">
                      <div className="member-header">
                        <span className="avatar" style={{ backgroundColor: member.avatarColor }}>
                          {member.firstName.charAt(0)}
                        </span>
                        <span>{member.firstName}</span>
                      </div>
                    </th>
                  ))}
                  <th className="shared-events-column" scope="col">Events</th>
                  <th className="specials-column-header" scope="col">Specials</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day, dayIndex) => {
                  const isoDate = toIsoDate(day);
                  const isToday = isoDate === todayIso;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const birthdayEntries = birthdayEventsByDate.get(isoDate) ?? [];
                  const childcareEntries = childcareByDate.get(isoDate) ?? [];
                  const parentingEntries = parentingIntervals.filter((interval) =>
                    new Date(interval.startAt) >= day && new Date(interval.startAt) < addDays(day, 1)
                    && parentingIntervals.some((previous) =>
                      previous.endAt === interval.startAt && previous.partyId !== interval.partyId));
                  const dayDecorations = dayDecorationsByDate.get(isoDate) ?? { corners: [] };
                  const isFirstDayOfWeek = dayIndex % 7 === 0;
                  const weekNumber = getIsoWeekNumber(day);

                  return (
                    <tr
                      key={isoDate}
                      className={`${isToday ? "today-row" : ""} ${!isToday && isWeekend ? "weekend-row" : ""}`.trim()}
                    >
                      {isFirstDayOfWeek && (
                        <td className="week-number-cell" rowSpan={7} aria-label={`Week ${weekNumber}`}>
                          {weekNumber}
                        </td>
                      )}
                      <th className="day-cell" scope="row">
                        {dayDecorations.corners.map((corner, index) => {
                          const CornerIcon = corner.icon;
                          return (
                            <span
                              key={corner.id}
                              className={`day-special-corner ${DAY_CONFIGURATION_META[corner.category].className}`}
                              style={{ top: `${0.3 + index * 2.05}rem` }}
                              title={corner.label ?? corner.marker}
                            >
                              <CornerIcon className="day-special-corner-icon" fontSize="inherit" />
                            </span>
                          );
                        })}
                        <div className="weekday-label-wrap">
                          <span className="weekday-label">{getWeekdayAbbreviation(day, DEMO_LOCALE)}</span>
                          {isToday && <span className="today-pill">Today</span>}
                        </div>
                        <strong>{getDayLabel(day, DEMO_LOCALE)}</strong>
                      </th>

                      {visibleMembers.map((member) => {
                        const entries = eventsByDateAndMember.get(`${isoDate}|${member.id}`) ?? [];
                        return (
                          <td key={`${isoDate}-${member.id}`} className={`event-cell member-event-cell${isHatchedChild(member.id) ? " parenting-hatched-cell" : ""}`}>
                            {isHatchedChild(member.id) && <ParentingAwayBackground day={day}
                              intervals={parentingIntervals} householdPartyIds={householdParentingPartyIds} activePartyIds={activeParentingPartyIds} />}
                            {entries.map((entry) => {
                              const eventType = entry.eventTypeId ? eventTypeById.get(entry.eventTypeId) : null;
                              const assignedMembers = entry.memberIds
                                .map((memberId) => memberById.get(memberId))
                                .filter((member): member is NonNullable<typeof member> => Boolean(member));
                              const eventTypeLabel = eventType?.icon ?? null;
                              return (
                                <CalendarEventCard
                                  key={`${entry.id}-${member.id}`}
                                  event={entry}
                                  eventTypeLabel={eventTypeLabel}
                                  timeLabel={formatEventTimeLabel(entry, isoDate)}
                                  members={assignedMembers}
                                  onClick={() => openEventViewDialog(entry.id)}
                                />
                              );
                            })}
                          </td>
                        );
                      })}

                      <td className={`event-cell shared-events-column${selectedMember && isHatchedChild(selectedMember.id) ? " parenting-hatched-cell" : ""}`}>
                        {selectedMember && isHatchedChild(selectedMember.id) && <ParentingAwayBackground day={day}
                          intervals={parentingIntervals} householdPartyIds={householdParentingPartyIds} activePartyIds={activeParentingPartyIds} />}
                        {(eventsByDateAndMember.get(isoDate) ?? [])
                          .filter((entry) => !selectedMember || entry.memberIds.length === 0 || entry.memberIds.includes(selectedMember.id))
                          .map((entry) => (
                            <CalendarEventCard
                              key={entry.id}
                              event={entry}
                              eventTypeLabel={entry.eventTypeId ? eventTypeById.get(entry.eventTypeId)?.icon ?? null : null}
                              timeLabel={formatEventTimeLabel(entry, isoDate)}
                              members={orderedMembers}
                              onClick={() => openEventViewDialog(entry.id)}
                            />
                          ))}
                      </td>

                      <td className={`specials-cell${childcareEntries.length > 0 || birthdayEntries.length > 0 || parentingEntries.length > 0 ? " has-specials-entries" : ""}`}>
                        {parentingEntries.map((interval) => (
                          <ParentingCalendarEntry key={`${interval.startAt}-${interval.partyId}`} interval={interval} day={day} intervals={parentingIntervals} />
                        ))}
                        {childcareEntries.map((occurrence) => (
                          <ChildcareCalendarEntry
                            key={occurrence.id}
                            occurrence={occurrence}
                            members={orderedMembers}
                          />
                        ))}
                        {birthdayEntries.map((entry) => (
                          <BirthdayCalendarEntry key={entry.id} event={entry} />
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </section>
      </main>

      <div className="fab-stack">
        <AgentChat accessToken={accessToken} householdId={householdData.householdId} onCloseChat={onAgentDataChanged} />
        <button type="button" className="fab" onClick={openEventDialog} title="Create event">
          + Event
        </button>
      </div>

      <EventDialog
        open={isEventDialogOpen}
        editing={Boolean(editingEventId)}
        members={orderedMembers}
        eventTypes={householdData.eventTypes}
        formState={eventFormState}
        titleError={eventTitleError}
        dateError={eventDateError}
        endDateError={eventEndDateError}
        memberSelectionError={eventMemberSelectionError}
        timeErrorMessage={eventTimeErrorMessage}
        planningAssistance={isEventDialogOpen ? <ParentingResponsibilityWarning
          key={householdData.householdId} householdId={householdData.householdId} accessToken={accessToken} formState={eventFormState} /> : null}
        onClose={closeEventDialog}
        onSubmit={submitEvent}
        onFormStateChange={(updater) => setEventFormState((current) => updater(current))}
      />

      <EventDetailDialog
        open={Boolean(viewingEvent)}
        event={viewingEvent}
        eventType={viewingEvent?.eventTypeId ? (eventTypeById.get(viewingEvent.eventTypeId) ?? null) : null}
        members={orderedMembers}
        onClose={closeEventViewDialog}
        onEdit={() => {
          if (viewingEvent) {
            openEditEventDialog(viewingEvent);
          }
        }}
        onDelete={deleteViewingEvent}
      />
    </div>
  );
}
