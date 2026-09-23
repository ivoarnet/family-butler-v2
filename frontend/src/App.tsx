import { FormEvent, useEffect, useMemo, useState } from "react";
import { ContactDialog } from "./components/ContactDialog";
import { MemberDialog } from "./components/MemberDialog";
import { Contact, FamilyMember, MemberAvatarColor } from "./types/family";

type ThemeMode = "light" | "dark";

interface SpecialEvent {
  id: string;
  type: "birthday" | "other";
  date: string;
  label: string;
  birthYear?: number;
}

interface HouseholdData {
  householdId: string;
  householdName: string;
  familyMembers: FamilyMember[];
  contacts: Contact[];
}

interface MemberFormState {
  firstName: string;
  role: string;
  avatarColor: MemberAvatarColor;
  visibleInCalendar: boolean;
}

interface ContactFormState {
  firstName: string;
  lastName: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  email: string;
  mobilePhone: string;
}

const THEME_STORAGE_KEY = "family-butler-theme";
const DEMO_LOCALE = "de-CH";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const DEFAULT_HOUSEHOLD_ID = import.meta.env.VITE_HOUSEHOLD_ID ?? "00000000-0000-0000-0000-000000000001";
const LEGACY_MEMBER_COLOR_MAP: Record<string, MemberAvatarColor> = {
  blue: "#3b82f6",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#7c3aed",
};
const MEMBER_COLORS: MemberAvatarColor[] = ["#3b82f6", "#f97316", "#ec4899", "#7c3aed"];
const MEMBER_COLOR_LABELS: Record<string, string> = {
  "#3b82f6": "Blue",
  "#f97316": "Orange",
  "#ec4899": "Pink",
  "#7c3aed": "Purple",
};
const DEFAULT_MEMBER_COLOR: MemberAvatarColor = MEMBER_COLORS[0];

const normalizeMemberColor = (color: unknown): MemberAvatarColor => {
  if (typeof color !== "string") {
    return DEFAULT_MEMBER_COLOR;
  }
  const trimmed = color.trim();
  if (!trimmed) {
    return DEFAULT_MEMBER_COLOR;
  }
  const legacy = LEGACY_MEMBER_COLOR_MAP[trimmed.toLowerCase()];
  return legacy ?? trimmed;
};

const getMemberColorLabel = (color: MemberAvatarColor): string => MEMBER_COLOR_LABELS[color] ?? color;

const defaultHouseholdData: HouseholdData = {
  householdId: DEFAULT_HOUSEHOLD_ID,
  householdName: "Family Butler",
  familyMembers: [],
  contacts: [],
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

const getThemeFromSystem = (): ThemeMode =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const getInitialTheme = (): ThemeMode => {
  const persistedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (persistedTheme === "light" || persistedTheme === "dark") {
    return persistedTheme;
  }
  return getThemeFromSystem();
};

const normalizeFamilyMembers = (members: FamilyMember[]): FamilyMember[] =>
  [...members]
    .sort((a, b) => a.order - b.order)
    .map((member, index) => ({
      ...member,
      order: index,
      role: member.role?.trim() || undefined,
      avatarColor: normalizeMemberColor(member.avatarColor),
    }));

const getInitialHouseholdData = (): HouseholdData => ({ ...defaultHouseholdData });

const toHouseholdData = (payload: Partial<HouseholdData>, householdId: string): HouseholdData => {
  const fallback = getInitialHouseholdData();
  return {
    householdId,
    householdName: typeof payload.householdName === "string" && payload.householdName.trim() ? payload.householdName : fallback.householdName,
    familyMembers: Array.isArray(payload.familyMembers)
      ? normalizeFamilyMembers(payload.familyMembers.filter(Boolean) as FamilyMember[])
      : fallback.familyMembers,
    contacts: Array.isArray(payload.contacts) ? (payload.contacts.filter(Boolean) as Contact[]) : fallback.contacts,
  };
};

const readHousehold = async (householdId: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}`);
  if (!response.ok) {
    throw new Error("Failed to load household data");
  }
  return toHouseholdData((await response.json()) as Partial<HouseholdData>, householdId);
};

const writeHousehold = async (household: HouseholdData): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${household.householdId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      householdName: household.householdName,
      familyMembers: normalizeFamilyMembers(household.familyMembers),
      contacts: household.contacts,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to save household data");
  }

  return toHouseholdData((await response.json()) as Partial<HouseholdData>, household.householdId);
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

const formatContactBirthday = (contact: Contact): string => {
  if (!contact.birthDay || !contact.birthMonth) {
    return "—";
  }
  if (contact.birthYear) {
    return `${contact.birthDay}.${contact.birthMonth}.${contact.birthYear}`;
  }
  return `${contact.birthDay}.${contact.birthMonth}.`;
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

const buildMemberFormState = (member?: FamilyMember): MemberFormState => ({
  firstName: member?.firstName ?? "",
  role: member?.role ?? "",
  avatarColor: member?.avatarColor ? normalizeMemberColor(member.avatarColor) : DEFAULT_MEMBER_COLOR,
  visibleInCalendar: member?.visibleInCalendar ?? true,
});

const buildContactFormState = (contact?: Contact): ContactFormState => ({
  firstName: contact?.firstName ?? "",
  lastName: contact?.lastName ?? "",
  birthDay: contact?.birthDay ? String(contact.birthDay) : "",
  birthMonth: contact?.birthMonth ? String(contact.birthMonth) : "",
  birthYear: contact?.birthYear ? String(contact.birthYear) : "",
  email: contact?.email ?? "",
  mobilePhone: contact?.mobilePhone ?? "",
});

const getBestAvailableColor = (members: FamilyMember[]): MemberAvatarColor => {
  for (const color of MEMBER_COLORS) {
    if (!members.some((member) => member.avatarColor === color)) {
      return color;
    }
  }
  return DEFAULT_MEMBER_COLOR;
};

function DashboardApp({
  theme,
  setTheme,
  householdData,
  onOpenSettings,
}: {
  theme: ThemeMode;
  setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>;
  householdData: HouseholdData;
  onOpenSettings: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [periodStart, setPeriodStart] = useState(() => startOfWeekMonday(new Date()));

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

  const periodLabel = useMemo(() => formatPeriodRange(periodStart, DEMO_LOCALE), [periodStart]);
  const todayIso = toIsoDate(now);

  return (
    <div className="dashboard-page">
      <header className="dashboard-header" role="banner">
        <div className="header-branding">
          <div className="icon-badge" aria-hidden>
            📅
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
              ‹
            </button>
            <button
              type="button"
              className="icon-button"
              title="Jump to current period"
              onClick={() => setPeriodStart(startOfWeekMonday(new Date()))}
            >
              📅
            </button>
            <button
              type="button"
              className="icon-button"
              title="Next two-week period"
              onClick={() => setPeriodStart((current) => addDays(current, 14))}
            >
              ›
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
          <div className="live-clock" aria-live="polite">
            <strong>
              {now.toLocaleTimeString(DEMO_LOCALE, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
            <span>
              {new Intl.DateTimeFormat(DEMO_LOCALE, {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(now)}
            </span>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={onOpenSettings}
            title="Open settings"
            aria-label="Open settings"
          >
            ⚙
          </button>
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
                      <span className="avatar avatar-birthday">🎂</span>
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

function SettingsPage({
  householdData,
  setHouseholdData,
  onGoHome,
}: {
  householdData: HouseholdData;
  setHouseholdData: React.Dispatch<React.SetStateAction<HouseholdData>>;
  onGoHome: () => void;
}) {
  const [householdNameDraft, setHouseholdNameDraft] = useState(householdData.householdName);
  const [memberFormState, setMemberFormState] = useState<MemberFormState>(buildMemberFormState);
  const [contactFormState, setContactFormState] = useState<ContactFormState>(buildContactFormState);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberFormSubmitted, setMemberFormSubmitted] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactFormSubmitted, setContactFormSubmitted] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  useEffect(() => {
    setHouseholdNameDraft(householdData.householdName);
  }, [householdData.householdName]);

  const orderedMembers = useMemo(
    () => [...householdData.familyMembers].sort((a, b) => a.order - b.order),
    [householdData.familyMembers]
  );

  const filteredContacts = useMemo(() => {
    const search = contactSearch.trim().toLowerCase();
    if (!search) {
      return householdData.contacts;
    }

    return householdData.contacts.filter((contact) => {
      const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim().toLowerCase();
      return fullName.includes(search);
    });
  }, [contactSearch, householdData.contacts]);

  const saveHouseholdName = () => {
    const trimmed = householdNameDraft.trim();
    if (!trimmed) {
      return;
    }
    setHouseholdData((current) => ({ ...current, householdName: trimmed }));
    setHouseholdNameDraft(trimmed);
  };

  const openAddMember = () => {
    setEditingMemberId(null);
    setMemberFormSubmitted(false);
    setMemberFormState({
      firstName: "",
      role: "",
      avatarColor: getBestAvailableColor(orderedMembers),
      visibleInCalendar: true,
    });
    setMemberModalOpen(true);
  };

  const openEditMember = (member: FamilyMember) => {
    setEditingMemberId(member.id);
    setMemberFormSubmitted(false);
    setMemberFormState(buildMemberFormState(member));
    setMemberModalOpen(true);
  };

  const closeMemberModal = () => {
    setMemberModalOpen(false);
    setEditingMemberId(null);
    setMemberFormSubmitted(false);
  };

  const submitMember = (event: FormEvent) => {
    event.preventDefault();
    setMemberFormSubmitted(true);
    const firstName = memberFormState.firstName.trim();
    if (!firstName) {
      return;
    }

    setHouseholdData((current) => {
      const members = [...current.familyMembers];
      if (editingMemberId) {
        const updated = members.map((member) =>
          member.id === editingMemberId
            ? {
                ...member,
                firstName,
                role: memberFormState.role.trim() || undefined,
                avatarColor: memberFormState.avatarColor,
                visibleInCalendar: memberFormState.visibleInCalendar,
              }
            : member
        );
        return { ...current, familyMembers: normalizeFamilyMembers(updated) };
      }

      const newMember: FamilyMember = {
        id: crypto.randomUUID(),
        firstName,
        role: memberFormState.role.trim() || undefined,
        avatarColor: memberFormState.avatarColor,
        visibleInCalendar: memberFormState.visibleInCalendar,
        order: members.length,
      };

      return { ...current, familyMembers: normalizeFamilyMembers([...members, newMember]) };
    });

    closeMemberModal();
  };

  const memberFirstNameError = memberFormSubmitted && !memberFormState.firstName.trim();
  const birthDay = contactFormState.birthDay.trim();
  const birthMonth = contactFormState.birthMonth.trim();
  const birthYear = contactFormState.birthYear.trim();
  const hasAnyBirthdayData = Boolean(birthDay || birthMonth || birthYear);
  const birthDayNumber = birthDay ? Number.parseInt(birthDay, 10) : undefined;
  const birthMonthNumber = birthMonth ? Number.parseInt(birthMonth, 10) : undefined;
  const contactFirstNameError = contactFormSubmitted && !contactFormState.firstName.trim();
  const contactBirthdayMissingError = contactFormSubmitted && hasAnyBirthdayData && (!birthDay || !birthMonth);
  const contactBirthdayRangeError =
    contactFormSubmitted &&
    ((birthDayNumber !== undefined && (birthDayNumber < 1 || birthDayNumber > 31)) ||
      (birthMonthNumber !== undefined && (birthMonthNumber < 1 || birthMonthNumber > 12)));

  const updateMemberRow = (memberId: string, updater: (member: FamilyMember) => FamilyMember) => {
    setHouseholdData((current) => ({
      ...current,
      familyMembers: normalizeFamilyMembers(current.familyMembers.map((member) => (member.id === memberId ? updater(member) : member))),
    }));
  };

  const moveMember = (memberId: string, direction: -1 | 1) => {
    setHouseholdData((current) => {
      const sorted = [...current.familyMembers].sort((a, b) => a.order - b.order);
      const fromIndex = sorted.findIndex((member) => member.id === memberId);
      const targetIndex = fromIndex + direction;

      if (fromIndex < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
        return current;
      }

      const swapped = [...sorted];
      [swapped[fromIndex], swapped[targetIndex]] = [swapped[targetIndex], swapped[fromIndex]];

      return {
        ...current,
        familyMembers: swapped.map((member, index) => ({ ...member, order: index })),
      };
    });
  };

  const openAddContact = () => {
    setEditingContactId(null);
    setContactFormSubmitted(false);
    setContactFormState(buildContactFormState());
    setContactModalOpen(true);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactFormSubmitted(false);
    setContactFormState(buildContactFormState(contact));
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setEditingContactId(null);
    setContactFormSubmitted(false);
  };

  const submitContact = (event: FormEvent) => {
    event.preventDefault();
    setContactFormSubmitted(true);
    const firstName = contactFormState.firstName.trim();
    if (!firstName) {
      return;
    }

    const birthDay = contactFormState.birthDay.trim();
    const birthMonth = contactFormState.birthMonth.trim();
    const birthYear = contactFormState.birthYear.trim();
    const hasAnyBirthdayData = Boolean(birthDay || birthMonth || birthYear);

    if (hasAnyBirthdayData && (!birthDay || !birthMonth)) {
      return;
    }

    const birthDayNumber = birthDay ? Number.parseInt(birthDay, 10) : undefined;
    const birthMonthNumber = birthMonth ? Number.parseInt(birthMonth, 10) : undefined;
    const birthYearNumber = birthYear ? Number.parseInt(birthYear, 10) : undefined;

    if ((birthDayNumber && (birthDayNumber < 1 || birthDayNumber > 31)) || (birthMonthNumber && (birthMonthNumber < 1 || birthMonthNumber > 12))) {
      return;
    }

    const preparedContact: Contact = {
      id: editingContactId ?? crypto.randomUUID(),
      firstName,
      lastName: contactFormState.lastName.trim() || undefined,
      birthDay: birthDayNumber,
      birthMonth: birthMonthNumber,
      birthYear: birthYearNumber,
      email: contactFormState.email.trim() || undefined,
      mobilePhone: contactFormState.mobilePhone.trim() || undefined,
    };

    setHouseholdData((current) => {
      if (!editingContactId) {
        return { ...current, contacts: [...current.contacts, preparedContact] };
      }

      return {
        ...current,
        contacts: current.contacts.map((contact) => (contact.id === editingContactId ? preparedContact : contact)),
      };
    });

    closeContactModal();
  };

  const deleteContact = (contactId: string) => {
    if (!window.confirm("Delete this contact?")) {
      return;
    }
    setHouseholdData((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.id !== contactId),
    }));
  };

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    onGoHome();
  };

  return (
    <div className="dashboard-page settings-page">
      <header className="dashboard-header settings-header" role="banner">
        <button type="button" className="icon-button" onClick={goBack} title="Go back" aria-label="Go back">
          ←
        </button>
        <div className="header-branding">
          <div>
            <h1>Settings</h1>
            <p>Household, family members, contacts</p>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onGoHome}
          title="Go to dashboard"
          aria-label="Go to dashboard"
        >
          ⌂
        </button>
      </header>

      <main className="settings-main">
        <section className="settings-card">
          <h2>Household Setting</h2>
          <div className="settings-form-row">
            <label htmlFor="household-name">Household name</label>
            <div className="inline-controls">
              <input
                id="household-name"
                type="text"
                value={householdNameDraft}
                onChange={(event) => setHouseholdNameDraft(event.target.value)}
              />
              <button type="button" className="primary-pill" onClick={saveHouseholdName}>
                Save
              </button>
            </div>
          </div>
          <div className="coming-soon-card">
            <strong>More household settings are coming soon.</strong>
          </div>
        </section>

        <section className="settings-card">
          <div className="section-toolbar">
            <h2>Household Members</h2>
            <button type="button" className="primary-pill" onClick={openAddMember}>
              + Member
            </button>
          </div>

          <div className="table-scroll">
            <table className="settings-table" aria-label="Household members">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Order</th>
                  <th>Visible</th>
                  <th>Color</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedMembers.map((member, index) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-header">
                        <span className="avatar" style={{ backgroundColor: member.avatarColor }}>
                          {member.firstName.charAt(0)}
                        </span>
                        <span>
                          {member.firstName}
                          {member.role ? <small> · {member.role}</small> : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="icon-actions">
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          onClick={() => moveMember(member.id, -1)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          onClick={() => moveMember(member.id, 1)}
                          disabled={index === orderedMembers.length - 1}
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td>
                      <label className="switch-label">
                        <input
                          type="checkbox"
                          checked={member.visibleInCalendar}
                          onChange={(event) =>
                            updateMemberRow(member.id, (current) => ({ ...current, visibleInCalendar: event.target.checked }))
                          }
                        />
                        <span>{member.visibleInCalendar ? "On" : "Off"}</span>
                      </label>
                    </td>
                    <td>
                      <select
                        value={member.avatarColor}
                        onChange={(event) =>
                          updateMemberRow(member.id, (current) => ({
                            ...current,
                            avatarColor: event.target.value as MemberAvatarColor,
                          }))
                        }
                      >
                        {MEMBER_COLORS.map((color) => (
                          <option key={color} value={color}>
                            {getMemberColorLabel(color)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="icon-button compact-icon-button" onClick={() => openEditMember(member)}>
                        ✎
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <MemberDialog
            open={memberModalOpen}
            editing={Boolean(editingMemberId)}
            colors={MEMBER_COLORS}
            formState={memberFormState}
            firstNameError={memberFirstNameError}
            onClose={closeMemberModal}
            onSubmit={submitMember}
            onFirstNameChange={(value) => setMemberFormState((current) => ({ ...current, firstName: value }))}
            onRoleChange={(value) => setMemberFormState((current) => ({ ...current, role: value }))}
            onAvatarColorChange={(value) => setMemberFormState((current) => ({ ...current, avatarColor: value }))}
            onVisibleInCalendarChange={(value) => setMemberFormState((current) => ({ ...current, visibleInCalendar: value }))}
          />
        </section>

        <section className="settings-card">
          <div className="section-toolbar responsive-toolbar">
            <h2>Contact List</h2>
            <div className="toolbar-controls">
              <input
                type="search"
                placeholder="Search contacts"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
              />
              <button type="button" className="primary-pill no-wrap-button" onClick={openAddContact}>
                + Contact
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="settings-table" aria-label="Contacts">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Birthday</th>
                  <th>Mobile Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="member-header">
                        <span className="avatar avatar-birthday">🎂</span>
                        <span>{`${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`}</span>
                      </div>
                    </td>
                    <td>{formatContactBirthday(contact)}</td>
                    <td>{contact.mobilePhone ?? "—"}</td>
                    <td>
                      <div className="icon-actions">
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          title="Edit contact"
                          onClick={() => openEditContact(contact)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          title="Delete contact"
                          onClick={() => deleteContact(contact.id)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ContactDialog
            open={contactModalOpen}
            editing={Boolean(editingContactId)}
            formState={contactFormState}
            firstNameError={contactFirstNameError}
            birthdayMissingError={contactBirthdayMissingError}
            birthdayRangeError={contactBirthdayRangeError}
            onClose={closeContactModal}
            onSubmit={submitContact}
            onFormStateChange={(updater) => setContactFormState((current) => updater(current))}
          />
        </section>
      </main>
    </div>
  );
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [householdData, setHouseholdData] = useState<HouseholdData>(getInitialHouseholdData);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const loadHouseholdData = async () => {
      try {
        const loaded = await readHousehold(DEFAULT_HOUSEHOLD_ID);
        if (cancelled) {
          return;
        }
        setHouseholdData(loaded);
        setDataError(null);
      } catch {
        if (cancelled) {
          return;
        }
        setDataError("Could not load household data from the server.");
      } finally {
        if (!cancelled) {
          setInitialLoadComplete(true);
        }
      }
    };

    loadHouseholdData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialLoadComplete) {
      return;
    }

    let cancelled = false;

    const persistHouseholdData = async () => {
      try {
        setIsSaving(true);
        const persisted = await writeHousehold(householdData);
        if (cancelled) {
          return;
        }
        setHouseholdData((current) =>
          JSON.stringify(current) === JSON.stringify(persisted)
            ? current
            : {
                ...persisted,
                familyMembers: normalizeFamilyMembers(persisted.familyMembers),
              }
        );
        setDataError(null);
      } catch {
        if (!cancelled) {
          setDataError("Could not save household data to the server.");
        }
      } finally {
        if (!cancelled) {
          setIsSaving(false);
        }
      }
    };

    persistHouseholdData();

    return () => {
      cancelled = true;
    };
  }, [householdData, initialLoadComplete]);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (nextPathname: "/" | "/settings") => {
    if (window.location.pathname === nextPathname) {
      return;
    }
    window.history.pushState({}, "", nextPathname);
    setPathname(nextPathname);
  };

  if (!initialLoadComplete) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <section className="calendar-card">Loading household data…</section>
        </main>
      </div>
    );
  }

  return pathname === "/settings" ? (
    <>
      {dataError ? <div role="alert">{dataError}</div> : null}
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      <SettingsPage householdData={householdData} setHouseholdData={setHouseholdData} onGoHome={() => navigateTo("/")} />
    </>
  ) : (
    <>
      {dataError ? <div role="alert">{dataError}</div> : null}
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      <DashboardApp
        theme={theme}
        setTheme={setTheme}
        householdData={householdData}
        onOpenSettings={() => navigateTo("/settings")}
      />
    </>
  );
}
