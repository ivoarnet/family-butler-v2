import { FormEvent, useEffect, useMemo, useState } from "react";
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
const DATA_STORAGE_KEY = "family-butler-household-data";
const DEMO_LOCALE = "de-CH";
const MEMBER_COLORS: MemberAvatarColor[] = ["blue", "orange", "pink", "purple"];

const createDefaultMembers = (): FamilyMember[] => [
  { id: "iwan", firstName: "Iwan", role: "Father", avatarColor: "blue", visibleInCalendar: true, order: 0 },
  { id: "christine", firstName: "Christine", role: "Mother", avatarColor: "orange", visibleInCalendar: false, order: 1 },
  { id: "silvie", firstName: "Silvie", role: "Daughter", avatarColor: "pink", visibleInCalendar: true, order: 2 },
  { id: "fabio", firstName: "Fabio", role: "Son", avatarColor: "purple", visibleInCalendar: true, order: 3 },
];

const defaultHouseholdData: HouseholdData = {
  householdName: "Familie Arnet",
  familyMembers: createDefaultMembers(),
  contacts: [
    {
      id: "contact-toby",
      firstName: "Toby",
      lastName: "Keller",
      birthDay: 30,
      birthMonth: 6,
      birthYear: 2015,
      email: "toby.keller@example.com",
      mobilePhone: "+41 79 123 45 67",
    },
    {
      id: "contact-amelie",
      firstName: "Amelie",
      birthDay: 18,
      birthMonth: 3,
      mobilePhone: "+41 79 987 65 43",
    },
  ],
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
      avatarColor: MEMBER_COLORS.includes(member.avatarColor) ? member.avatarColor : "blue",
    }));

const getInitialHouseholdData = (): HouseholdData => {
  const persistedData = window.localStorage.getItem(DATA_STORAGE_KEY);
  if (!persistedData) {
    return defaultHouseholdData;
  }

  try {
    const parsed = JSON.parse(persistedData) as Partial<HouseholdData>;
    if (!parsed || typeof parsed !== "object") {
      return defaultHouseholdData;
    }

    const householdName = typeof parsed.householdName === "string" ? parsed.householdName : defaultHouseholdData.householdName;
    const familyMembers = Array.isArray(parsed.familyMembers)
      ? normalizeFamilyMembers(parsed.familyMembers.filter(Boolean) as FamilyMember[])
      : defaultHouseholdData.familyMembers;
    const contacts = Array.isArray(parsed.contacts) ? (parsed.contacts.filter(Boolean) as Contact[]) : defaultHouseholdData.contacts;

    return {
      householdName,
      familyMembers: familyMembers.length > 0 ? familyMembers : defaultHouseholdData.familyMembers,
      contacts,
    };
  } catch {
    return defaultHouseholdData;
  }
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

const buildDemoSpecialEvents = (periodStart: Date): SpecialEvent[] => [
  { id: "evt-1", type: "birthday", date: toIsoDate(addDays(periodStart, 6)), label: "Toby", birthYear: 2014 },
  { id: "evt-2", type: "birthday", date: toIsoDate(addDays(periodStart, 11)), label: "Amelie" },
];

const buildMemberFormState = (member?: FamilyMember): MemberFormState => ({
  firstName: member?.firstName ?? "",
  role: member?.role ?? "",
  avatarColor: member?.avatarColor ?? "blue",
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
  return MEMBER_COLORS[0];
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
  const specialEvents = useMemo(() => buildDemoSpecialEvents(periodStart), [periodStart]);

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
                        <span className={`avatar avatar-${member.avatarColor}`}>{member.firstName.charAt(0)}</span>
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
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
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
    setMemberFormState(buildMemberFormState(member));
    setMemberModalOpen(true);
  };

  const closeMemberModal = () => {
    setMemberModalOpen(false);
    setEditingMemberId(null);
  };

  const submitMember = (event: FormEvent) => {
    event.preventDefault();
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
        id: `member-${Math.random().toString(36).slice(2, 10)}`,
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
    setContactFormState(buildContactFormState());
    setContactModalOpen(true);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactFormState(buildContactFormState(contact));
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setEditingContactId(null);
  };

  const submitContact = (event: FormEvent) => {
    event.preventDefault();
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
      id: editingContactId ?? `contact-${Math.random().toString(36).slice(2, 10)}`,
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
                        <span className={`avatar avatar-${member.avatarColor}`}>{member.firstName.charAt(0)}</span>
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
                            {color}
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

          {memberModalOpen ? (
            <form className="edit-sheet" onSubmit={submitMember}>
              <h3>{editingMemberId ? "Edit member" : "Add member"}</h3>
              <div className="edit-grid">
                <label>
                  First name
                  <input
                    type="text"
                    required
                    value={memberFormState.firstName}
                    onChange={(event) => setMemberFormState((current) => ({ ...current, firstName: event.target.value }))}
                  />
                </label>
                <label>
                  Role / relationship
                  <input
                    type="text"
                    value={memberFormState.role}
                    onChange={(event) => setMemberFormState((current) => ({ ...current, role: event.target.value }))}
                  />
                </label>
                <label>
                  Color
                  <select
                    value={memberFormState.avatarColor}
                    onChange={(event) =>
                      setMemberFormState((current) => ({ ...current, avatarColor: event.target.value as MemberAvatarColor }))
                    }
                  >
                    {MEMBER_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Visible in calendar
                  <input
                    type="checkbox"
                    checked={memberFormState.visibleInCalendar}
                    onChange={(event) =>
                      setMemberFormState((current) => ({ ...current, visibleInCalendar: event.target.checked }))
                    }
                  />
                </label>
                <label>
                  Avatar/photo upload (coming soon)
                  <input type="file" disabled aria-disabled="true" />
                </label>
              </div>
              <div className="sheet-actions">
                <button type="button" onClick={closeMemberModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-pill">
                  Save member
                </button>
              </div>
            </form>
          ) : null}
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
              <button type="button" className="primary-pill" onClick={openAddContact}>
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

          {contactModalOpen ? (
            <form className="edit-sheet" onSubmit={submitContact}>
              <h3>{editingContactId ? "Edit contact" : "Add contact"}</h3>
              <div className="edit-grid">
                <label>
                  First name
                  <input
                    type="text"
                    required
                    value={contactFormState.firstName}
                    onChange={(event) => setContactFormState((current) => ({ ...current, firstName: event.target.value }))}
                  />
                </label>
                <label>
                  Last name
                  <input
                    type="text"
                    value={contactFormState.lastName}
                    onChange={(event) => setContactFormState((current) => ({ ...current, lastName: event.target.value }))}
                  />
                </label>
                <label>
                  Birthday day
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={contactFormState.birthDay}
                    onChange={(event) => setContactFormState((current) => ({ ...current, birthDay: event.target.value }))}
                  />
                </label>
                <label>
                  Birthday month
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={contactFormState.birthMonth}
                    onChange={(event) => setContactFormState((current) => ({ ...current, birthMonth: event.target.value }))}
                  />
                </label>
                <label>
                  Birthday year (optional)
                  <input
                    type="number"
                    min={1}
                    value={contactFormState.birthYear}
                    onChange={(event) => setContactFormState((current) => ({ ...current, birthYear: event.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={contactFormState.email}
                    onChange={(event) => setContactFormState((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  Mobile phone
                  <input
                    type="tel"
                    value={contactFormState.mobilePhone}
                    onChange={(event) => setContactFormState((current) => ({ ...current, mobilePhone: event.target.value }))}
                  />
                </label>
              </div>
              <div className="sheet-actions">
                <button type="button" onClick={closeContactModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-pill">
                  Save contact
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [householdData, setHouseholdData] = useState<HouseholdData>(getInitialHouseholdData);
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const toPersist: HouseholdData = {
      householdName: householdData.householdName,
      familyMembers: normalizeFamilyMembers(householdData.familyMembers),
      contacts: householdData.contacts,
    };
    window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(toPersist));
  }, [householdData]);

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

  return pathname === "/settings" ? (
    <SettingsPage householdData={householdData} setHouseholdData={setHouseholdData} onGoHome={() => navigateTo("/")} />
  ) : (
    <DashboardApp
      theme={theme}
      setTheme={setTheme}
      householdData={householdData}
      onOpenSettings={() => navigateTo("/settings")}
    />
  );
}
