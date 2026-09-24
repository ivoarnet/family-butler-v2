import { useEffect, useMemo, useRef, useState } from "react";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CakeRoundedIcon from "@mui/icons-material/CakeRounded";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SettingsIcon from "@mui/icons-material/Settings";
import { AvatarContextMenu } from "../shared/ui/AvatarContextMenu";
import { Contact } from "../types/family";
import { HouseholdData, NavigationTarget } from "../features/app/types";

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

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-pill">Family Butler</span>
          <h1>{householdData.householdName}</h1>
        </div>
        <div className="header-controls">
          <button type="button" className="ghost-button" onClick={() => onOpenSettings("settings")}>
            <SettingsIcon fontSize="small" />
            Settings
          </button>
          <div className="avatar-context-anchor" ref={avatarMenuRef}>
            <button
              type="button"
              className={`avatar-badge-button${isAvatarMenuOpen ? " open" : ""}`}
              onClick={() => setIsAvatarMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isAvatarMenuOpen}
              aria-label="Open account menu"
            >
              <span className="avatar-badge" aria-hidden>
                {currentUserAvatarUrl ? <img src={currentUserAvatarUrl} alt="" /> : currentUserInitials}
              </span>
            </button>
            {isAvatarMenuOpen ? (
              <AvatarContextMenu
                currentUserLabel={currentUserLabel}
                currentUserEmail={currentUserEmail}
                currentUserInitials={currentUserInitials}
                currentUserAvatarUrl={currentUserAvatarUrl}
                onProfileClick={() => {
                  onOpenSettings("profile");
                  setIsAvatarMenuOpen(false);
                }}
                onHouseholdsClick={() => {
                  onOpenSettings("households");
                  setIsAvatarMenuOpen(false);
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
        <section className="calendar-card">
          <div className="calendar-toolbar">
            <div>
              <p className="toolbar-label">Current period</p>
              <h2>{formatPeriodRange(periodStart, DEMO_LOCALE)}</h2>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="icon-button" aria-label="Previous period" onClick={() => setPeriodStart(addDays(periodStart, -14))}>
                <ChevronLeftIcon fontSize="small" />
              </button>
              <button type="button" className="icon-button" aria-label="Next period" onClick={() => setPeriodStart(addDays(periodStart, 14))}>
                <ChevronRightIcon fontSize="small" />
              </button>
            </div>
          </div>

          <div className="calendar-grid-wrapper">
            <table className="calendar-grid">
              <thead>
                <tr>
                  <th scope="col" className="sticky-col time-col">
                    <span>Time</span>
                  </th>
                  {days.map((day) => {
                    const dayKey = toIsoDate(day);
                    const isToday = day.toDateString() === now.toDateString();
                    return (
                      <th key={dayKey} scope="col" className={isToday ? "today-col" : ""}>
                        <span className="weekday">{getWeekdayAbbreviation(day, DEMO_LOCALE)}</span>
                        <span>{getDayLabel(day, DEMO_LOCALE)}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr className="birthday-row">
                  <th scope="row" className="sticky-col time-col">
                    <span className="time-label">
                      <CakeRoundedIcon fontSize="small" />
                      Birthdays
                    </span>
                  </th>
                  {days.map((day) => {
                    const dayKey = toIsoDate(day);
                    const birthdayEvents = birthdayEventsByDate.get(dayKey) ?? [];
                    return (
                      <td key={`birthday-${dayKey}`} className={birthdayEvents.length ? "birthday-day-cell has-birthday" : "birthday-day-cell"}>
                        {birthdayEvents.length ? (
                          <ul className="birthday-event-list">
                            {birthdayEvents.map((event) => (
                              <li key={event.id} className="birthday-event-item" title={formatBirthdayLabel(event)}>
                                <CakeRoundedIcon fontSize="inherit" />
                                <span>{formatBirthdayLabel(event)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="birthday-empty">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {visibleMembers.map((member) => (
                  <tr key={member.id}>
                    <th scope="row" className="sticky-col member-col">
                      <span className="member-avatar" style={{ backgroundColor: member.avatarColor }}>
                        {member.firstName.charAt(0)}
                      </span>
                      <div>
                        <strong>{member.firstName}</strong>
                        {member.role ? <small>{member.role}</small> : null}
                      </div>
                    </th>
                    {days.map((day) => (
                      <td key={`${member.id}-${toIsoDate(day)}`}>
                        <button
                          type="button"
                          className="slot-button"
                          disabled
                          title={`Add event for ${member.firstName} on ${day.toLocaleDateString(DEMO_LOCALE)}`}
                        >
                          <CalendarMonthIcon fontSize="small" />
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
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
