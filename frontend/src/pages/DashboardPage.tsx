import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import CakeRoundedIcon from "@mui/icons-material/CakeRounded";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SettingsIcon from "@mui/icons-material/Settings";
import { AgentChatFeature } from "../features/dashboard/components/AgentChatFeature";
import { CalendarEventCard } from "../features/dashboard/components/CalendarEventCard";
import { EventDialog, EventDialogFormState } from "../features/dashboard/components/EventDialog";
import { EventViewDialog } from "../features/dashboard/components/EventViewDialog";
import { AvatarContextMenu } from "../shared/ui/AvatarContextMenu";
import { HouseholdData, NavigationTarget } from "../features/app/types";
import { Contact, DayConfiguration, DayConfigurationCategory, HouseholdEvent } from "../types/family";
import type { Dispatch, SetStateAction } from "react";

interface SpecialEvent {
  id: string;
  type: "birthday" | "other";
  date: string;
  label: string;
  birthYear?: number;
}

interface DayCellDecorations {
  corners: Array<{ id: string; category: DayConfigurationCategory; marker: string }>;
}

const DEMO_LOCALE = "de-CH";
const DAY_CONFIGURATION_META: Record<DayConfigurationCategory, { defaultMarker: string; className: string }> = {
  school_off: { defaultMarker: "SH", className: "school-off" },
  bank_holiday: { defaultMarker: "BH", className: "bank-holiday" },
  bridge_day: { defaultMarker: "BD", className: "bridge-day" },
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

const buildBirthdayEvents = (contacts: Contact[], periodStart: Date): SpecialEvent[] => {
  const days = Array.from({ length: 14 }, (_, index) => addDays(periodStart, index));
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
  const customMarker = dayConfiguration.label?.trim().toUpperCase();
  if (customMarker) {
    return customMarker.slice(0, 4);
  }
  return DAY_CONFIGURATION_META[dayConfiguration.category].defaultMarker;
};

const buildEventFormState = (date: string): EventDialogFormState => ({
  title: "",
  memberIds: [],
  date,
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
  if (dayStart.getTime() < eventStart.getTime()) {
    return false;
  }

  const repeatFrequency = getRepeatFrequency(event.repeatRule);
  if (!repeatFrequency) {
    return toIsoDate(eventStart) === toIsoDate(dayStart);
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

const formatEventTimeLabel = (event: HouseholdEvent): string => {
  if (event.allDay) {
    return "All day";
  }
  const start = normalizeTime24Hour(event.startTime);
  const end = normalizeTime24Hour(event.endTime);
  if (start && end) {
    return `${start}-${end}`;
  }
  return start || end || "";
};

export function DashboardPage({
  householdData,
  setHouseholdData,
  onOpenSettings,
  currentUserLabel,
  currentUserEmail,
  currentUserInitials,
  currentUserAvatarUrl,
  onSignOut,
}: {
  householdData: HouseholdData;
  setHouseholdData: Dispatch<SetStateAction<HouseholdData>>;
  onOpenSettings: (target: NavigationTarget) => void;
  currentUserLabel: string;
  currentUserEmail: string;
  currentUserInitials: string;
  currentUserAvatarUrl: string | null;
  onSignOut: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => new Date());
  const [periodStart, setPeriodStart] = useState(() => startOfWeekMonday(new Date()));
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [viewingEventId, setViewingEventId] = useState<string | null>(null);
  const [eventFormState, setEventFormState] = useState<EventDialogFormState>(() => buildEventFormState(toIsoDate(new Date())));
  const [eventFormSubmitted, setEventFormSubmitted] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  const orderedMembers = useMemo(
    () => [...householdData.familyMembers].sort((a, b) => a.order - b.order),
    [householdData.familyMembers]
  );
  const visibleMembers = useMemo(() => orderedMembers.filter((member) => member.visibleInCalendar), [orderedMembers]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(periodStart, index)), [periodStart]);
  const specialEvents = useMemo(() => buildBirthdayEvents(householdData.contacts, periodStart), [householdData.contacts, periodStart]);

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
        entry.corners.push({ id: `${dayConfiguration.id}-${isoDate}`, category: dayConfiguration.category, marker });
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
        const memberIds = event.memberIds.length > 0 ? event.memberIds : [""];
        memberIds.forEach((memberId) => {
          const key = `${dayIso}|${memberId}`;
          const list = grouped.get(key) ?? [];
          list.push(event);
          grouped.set(key, list);
        });
      }
    }
    return grouped;
  }, [days, householdData.events]);

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

  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEventFormSubmitted(true);
    const title = eventFormState.title.trim();
    const date = eventFormState.date.trim();
    if (!title || !date || eventFormState.memberIds.length === 0) {
      return;
    }

    const startTime = eventFormState.startTime.trim();
    const endTime = eventFormState.endTime.trim();
    if (
      !eventFormState.allDay &&
      (!startTime || !endTime || !isFiveMinuteStepTime(startTime) || !isFiveMinuteStepTime(endTime) || startTime >= endTime)
    ) {
      return;
    }

    const preparedEvent: HouseholdEvent = {
      id: editingEventId ?? crypto.randomUUID(),
      title,
      date,
      memberIds: eventFormState.memberIds,
      allDay: eventFormState.allDay,
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
  const eventMemberSelectionError = eventFormSubmitted && eventFormState.memberIds.length === 0;
  const eventTimeErrorMessage =
    eventFormSubmitted && !eventFormState.allDay
      ? !eventFormState.startTime.trim() || !eventFormState.endTime.trim()
        ? "Begin and end time are required for non all-day events."
        : !isFiveMinuteStepTime(eventFormState.startTime.trim()) || !isFiveMinuteStepTime(eventFormState.endTime.trim())
          ? "Use 24-hour HH:MM time with 5-minute steps."
        : eventFormState.startTime >= eventFormState.endTime
          ? "Begin time must be before end time."
          : null
      : null;

  const periodLabel = useMemo(() => formatPeriodRange(periodStart, DEMO_LOCALE), [periodStart]);
  const todayIso = toIsoDate(now);
  return (
    <div className="dashboard-page">
      <header className="dashboard-header" role="banner">
        <div className="header-branding">
          <div className="icon-badge" aria-hidden>
            <CalendarMonthIcon fontSize="medium" />
          </div>
          <div>
            <h1>{householdData.householdName}</h1>
            <p>{periodLabel}</p>
          </div>
        </div>

        <div className="header-controls">
          <div className="pill-group" role="group" aria-label="Period navigation">
            <button
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
            </button>
          </div>

          <div className="pill-group view-switcher" role="group" aria-label="View switcher">
            <button type="button" className="active" aria-pressed="true">
              2 Weeks
            </button>
            <button type="button" disabled title="Month view is coming soon">
              Month
            </button>
          </div>
        </div>

        <div className="header-meta">
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
      </header>

      <main className="dashboard-main">
        <section className="calendar-card" aria-label="Two week family calendar">
          <div className="calendar-scroll">
            <table className="calendar-grid">
              <thead>
                <tr>
                  <th className="day-column-header">DAY</th>
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
                  <th className="birthday-column-header">
                    <div className="member-header">
                      <span className="avatar avatar-birthday">
                        <CakeRoundedIcon fontSize="small" />
                      </span>
                      <span>Birthdays</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const isoDate = toIsoDate(day);
                  const isToday = isoDate === todayIso;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const birthdayEntries = birthdayEventsByDate.get(isoDate) ?? [];
                  const dayDecorations = dayDecorationsByDate.get(isoDate) ?? { corners: [] };

                  return (
                    <tr
                      key={isoDate}
                      className={`${isToday ? "today-row" : ""} ${!isToday && isWeekend ? "weekend-row" : ""}`.trim()}
                    >
                      <td className="day-cell">
                        {dayDecorations.corners.map((corner, index) => (
                          <span
                            key={corner.id}
                            className={`day-special-corner ${DAY_CONFIGURATION_META[corner.category].className}`}
                            style={{ top: `${0.3 + index * 1.1}rem` }}
                            title={corner.marker}
                          >
                            {corner.marker}
                          </span>
                        ))}
                        <div className="weekday-label-wrap">
                          <span className="weekday-label">{getWeekdayAbbreviation(day, DEMO_LOCALE)}</span>
                          {isToday && <span className="today-pill">Today</span>}
                        </div>
                        <strong>{getDayLabel(day, DEMO_LOCALE)}</strong>
                      </td>

                      {visibleMembers.map((member) => {
                        const entries = eventsByDateAndMember.get(`${isoDate}|${member.id}`) ?? [];
                        return (
                          <td key={`${isoDate}-${member.id}`} className="event-cell">
                            {entries.map((entry) => {
                              const eventType = entry.eventTypeId ? eventTypeById.get(entry.eventTypeId) : null;
                              const assignedMembers = entry.memberIds
                                .map((memberId) => memberById.get(memberId))
                                .filter((member): member is NonNullable<typeof member> => Boolean(member));
                              const eventTypeLabel = eventType ? `${eventType.icon ? `${eventType.icon} ` : ""}${eventType.name}` : null;
                              return (
                                <CalendarEventCard
                                  key={`${entry.id}-${member.id}`}
                                  event={entry}
                                  eventTypeLabel={eventTypeLabel}
                                  timeLabel={formatEventTimeLabel(entry)}
                                  members={assignedMembers}
                                  onClick={() => openEventViewDialog(entry.id)}
                                />
                              );
                            })}
                          </td>
                        );
                      })}

                      <td className="birthday-cell">
                        {birthdayEntries.map((entry) => (
                          <span className="birthday-item" key={entry.id}>
                            {formatBirthdayLabel(entry)}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <div className="fab-stack">
        <AgentChatFeature />
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
        memberSelectionError={eventMemberSelectionError}
        timeErrorMessage={eventTimeErrorMessage}
        onClose={closeEventDialog}
        onSubmit={submitEvent}
        onFormStateChange={(updater) => setEventFormState((current) => updater(current))}
      />

      <EventViewDialog
        open={Boolean(viewingEvent)}
        event={viewingEvent}
        eventType={viewingEvent?.eventTypeId ? (eventTypeById.get(viewingEvent.eventTypeId) ?? null) : null}
        members={orderedMembers}
        timeLabel={viewingEvent ? formatEventTimeLabel(viewingEvent) : ""}
        onClose={closeEventViewDialog}
        onEdit={() => {
          if (viewingEvent) {
            openEditEventDialog(viewingEvent);
          }
        }}
      />
    </div>
  );
}
