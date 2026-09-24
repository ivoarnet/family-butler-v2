import { useEffect, useMemo, useRef, useState } from "react";
import CakeRoundedIcon from "@mui/icons-material/CakeRounded";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SettingsIcon from "@mui/icons-material/Settings";
import { AvatarContextMenu } from "../shared/ui/AvatarContextMenu";
import { HouseholdData, NavigationTarget } from "../features/app/types";
import { Contact } from "../types/family";

interface SpecialEvent {
  id: string;
  type: "birthday" | "other";
  date: string;
  label: string;
  birthYear?: number;
}

const DEMO_LOCALE = "de-CH";

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

export function DashboardPage({
  householdData,
  onOpenSettings,
  currentUserLabel,
  currentUserEmail,
  currentUserInitials,
  currentUserAvatarUrl,
  onSignOut,
}: {
  householdData: HouseholdData;
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
                    <th key={member.id}>
                      <div className="member-header">
                        <span className="avatar" style={{ backgroundColor: member.avatarColor }}>
                          {member.firstName.charAt(0)}
                        </span>
                        <span>{member.firstName}</span>
                      </div>
                    </th>
                  ))}
                  <th>
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

                  return (
                    <tr
                      key={isoDate}
                      className={`${isToday ? "today-row" : ""} ${!isToday && isWeekend ? "weekend-row" : ""}`.trim()}
                    >
                      <td className="day-cell">
                        <div className="weekday-label-wrap">
                          <span className="weekday-label">{getWeekdayAbbreviation(day, DEMO_LOCALE)}</span>
                          {isToday && <span className="today-pill">Today</span>}
                        </div>
                        <strong>{getDayLabel(day, DEMO_LOCALE)}</strong>
                      </td>

                      {visibleMembers.map((member) => (
                        <td key={`${isoDate}-${member.id}`} className="event-cell" />
                      ))}

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

      <button type="button" className="fab" disabled aria-disabled="true" title="Event creation is coming soon">
        + Event
      </button>
    </div>
  );
}
