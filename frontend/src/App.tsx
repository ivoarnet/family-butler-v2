import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CakeRoundedIcon from "@mui/icons-material/CakeRounded";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HomeIcon from "@mui/icons-material/Home";
import LightModeIcon from "@mui/icons-material/LightMode";
import SettingsIcon from "@mui/icons-material/Settings";
import { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { AuthScreen } from "./components/auth/AuthScreen";
import { AvatarContextMenu } from "./components/AvatarContextMenu";
import { ContactDialog } from "./components/ContactDialog";
import { HouseholdDialog } from "./components/HouseholdDialog";
import { MemberDialog } from "./components/MemberDialog";
import { createSupabaseClient, getBuildTimeSupabaseAuthConfig } from "./lib/supabaseClient";
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

interface HouseholdSummary {
  id: string;
  name: string;
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

type SettingsSection = "profile" | "households";
type NavigationTarget = "settings" | "profile" | "households";

const THEME_STORAGE_KEY = "family-butler-theme";
const ACTIVE_HOUSEHOLD_STORAGE_KEY = "family-butler-active-household-id";
const DEMO_LOCALE = "de-CH";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
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
  householdId: "",
  householdName: "",
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
    householdName: typeof payload.householdName === "string" && payload.householdName.trim() ? payload.householdName : fallback.householdName || "Unnamed household",
    familyMembers: Array.isArray(payload.familyMembers)
      ? normalizeFamilyMembers(payload.familyMembers.filter(Boolean) as FamilyMember[])
      : fallback.familyMembers,
    contacts: Array.isArray(payload.contacts) ? (payload.contacts.filter(Boolean) as Contact[]) : fallback.contacts,
  };
};

const parseResponseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // ignore parsing errors
  }
  return fallback;
};

const readHouseholds = async (): Promise<HouseholdSummary[]> => {
  const response = await fetch(`${API_BASE_URL}/api/households`);
  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Failed to load households"));
  }

  const payload = (await response.json()) as { households?: HouseholdSummary[] };
  return Array.isArray(payload.households) ? payload.households.filter(Boolean) : [];
};

const readHousehold = async (householdId: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}`);
  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Failed to load household data"));
  }
  return toHouseholdData((await response.json()) as Partial<HouseholdData>, householdId);
};

const createHousehold = async (householdName: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ householdName }),
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Failed to create household"));
  }

  const payload = (await response.json()) as Partial<HouseholdData>;
  if (typeof payload.householdId !== "string" || !payload.householdId) {
    throw new Error("Created household response was incomplete");
  }

  return toHouseholdData(payload, payload.householdId);
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
    throw new Error(await parseResponseError(response, "Failed to save household data"));
  }

  return toHouseholdData((await response.json()) as Partial<HouseholdData>, household.householdId);
};

const readRuntimeAuthConfig = async (): Promise<{ supabaseUrl: string; supabasePublishableKey: string } | null> => {
  const response = await fetch(`${API_BASE_URL}/api/auth-config`);
  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Failed to load auth configuration"));
  }

  const payload = (await response.json()) as {
    supabaseUrl?: unknown;
    supabasePublishableKey?: unknown;
  };
  const supabaseUrl = typeof payload.supabaseUrl === "string" ? payload.supabaseUrl.trim() : "";
  const supabasePublishableKey = typeof payload.supabasePublishableKey === "string" ? payload.supabasePublishableKey.trim() : "";

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return { supabaseUrl, supabasePublishableKey };
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

const getUserDisplayName = (user: User): string => {
  const metadataName = user.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }
  return user.email?.trim() || "Signed in user";
};

const getUserInitials = (label: string): string => {
  const parts = label
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const splitProfileName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

function DashboardApp({
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

function SettingsPage({
  mode,
  households,
  activeHouseholdId,
  onSwitchHousehold,
  onCreateHousehold,
  isContextLoading,
  isCreatingHousehold,
  householdData,
  setHouseholdData,
  contextError,
  onRetryContextAction,
  onGoHome,
  initialSection,
  currentUserEmail,
  initialProfileFirstName,
  initialProfileLastName,
  isProfileSaving,
  onSaveProfile,
  theme,
  setTheme,
}: {
  mode: "profile" | "settings";
  households: HouseholdSummary[];
  activeHouseholdId: string | null;
  onSwitchHousehold: (householdId: string) => void;
  onCreateHousehold: (householdName: string) => Promise<{ ok: boolean; error?: string }>;
  isContextLoading: boolean;
  isCreatingHousehold: boolean;
  householdData: HouseholdData;
  setHouseholdData: React.Dispatch<React.SetStateAction<HouseholdData>>;
  contextError: string | null;
  onRetryContextAction: () => void;
  onGoHome: () => void;
  initialSection: SettingsSection;
  currentUserEmail: string;
  initialProfileFirstName: string;
  initialProfileLastName: string;
  isProfileSaving: boolean;
  onSaveProfile: (firstName: string, lastName: string) => Promise<{ ok: boolean; error?: string }>;
  theme: ThemeMode;
  setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>;
}) {
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialSection);
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [createHouseholdSubmitted, setCreateHouseholdSubmitted] = useState(false);
  const [createHouseholdError, setCreateHouseholdError] = useState<string | null>(null);
  const [householdModalOpen, setHouseholdModalOpen] = useState(false);
  const [memberFormState, setMemberFormState] = useState<MemberFormState>(buildMemberFormState);
  const [contactFormState, setContactFormState] = useState<ContactFormState>(buildContactFormState);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberFormSubmitted, setMemberFormSubmitted] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactFormSubmitted, setContactFormSubmitted] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [profileFirstName, setProfileFirstName] = useState(initialProfileFirstName);
  const [profileLastName, setProfileLastName] = useState(initialProfileLastName);
  const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveInfo, setProfileSaveInfo] = useState<string | null>(null);

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
  const canEditActiveHousehold = Boolean(activeHouseholdId) && !isContextLoading;
  const showHouseholdWorkspace = mode === "profile" && settingsSection === "households";
  const showProfileWorkspace = mode === "profile" && settingsSection === "profile";
  const showSettingsWorkspace = mode === "settings";

  const createHouseholdNameError = createHouseholdSubmitted && !newHouseholdName.trim();
  const profileFirstNameError = profileSubmitAttempted && !profileFirstName.trim();

  useEffect(() => {
    setSettingsSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setProfileFirstName(initialProfileFirstName);
    setProfileLastName(initialProfileLastName);
  }, [initialProfileFirstName, initialProfileLastName]);

  const openAddHousehold = () => {
    setCreateHouseholdSubmitted(false);
    setCreateHouseholdError(null);
    setNewHouseholdName("");
    setHouseholdModalOpen(true);
  };

  const closeAddHousehold = () => {
    if (isCreatingHousehold) {
      return;
    }
    setHouseholdModalOpen(false);
    setCreateHouseholdSubmitted(false);
    setCreateHouseholdError(null);
  };

  const submitCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateHouseholdSubmitted(true);
    const trimmedName = newHouseholdName.trim();
    if (!trimmedName) {
      return;
    }

    const result = await onCreateHousehold(trimmedName);
    if (!result.ok) {
      setCreateHouseholdError(result.error ?? "Could not create household.");
      return;
    }

    setCreateHouseholdError(null);
    setCreateHouseholdSubmitted(false);
    setNewHouseholdName("");
    setHouseholdModalOpen(false);
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSubmitAttempted(true);
    setProfileSaveInfo(null);
    setProfileSaveError(null);

    const firstName = profileFirstName.trim();
    const lastName = profileLastName.trim();
    if (!firstName) {
      return;
    }

    const result = await onSaveProfile(firstName, lastName);
    if (!result.ok) {
      setProfileSaveError(result.error ?? "Could not save profile.");
      return;
    }

    setProfileSaveInfo("Profile updated.");
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
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className="header-branding">
          <div>
            <h1>{mode === "profile" ? "Profile" : "Settings"}</h1>
            <p>
              {mode === "profile"
                ? "Manage your personal details and households"
                : activeHouseholdId
                  ? `Selected household: ${householdData.householdName}`
                  : "Select a household in Profile before editing household settings"}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onGoHome}
          title="Go to dashboard"
          aria-label="Go to dashboard"
        >
          <HomeIcon fontSize="small" />
        </button>
      </header>

      <main className="settings-main">
        {mode === "profile" ? (
          <section className="settings-card">
            <div className="section-toolbar">
              <h2>My account</h2>
              <div className="pill-group view-switcher" role="tablist" aria-label="Profile sections">
                <button type="button" className={settingsSection === "profile" ? "active" : ""} onClick={() => setSettingsSection("profile")}>
                  My profile
                </button>
                <button
                  type="button"
                  className={settingsSection === "households" ? "active" : ""}
                  onClick={() => setSettingsSection("households")}
                >
                  My households
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {showProfileWorkspace ? (
          <section className="settings-card">
            <h2>My profile</h2>
            <form className="auth-form" onSubmit={submitProfile}>
              <div className="edit-grid">
                <label>
                  First name
                  <input
                    type="text"
                    value={profileFirstName}
                    onChange={(event) => setProfileFirstName(event.target.value)}
                    placeholder="First name"
                    autoComplete="given-name"
                  />
                </label>
                <label>
                  Last name
                  <input
                    type="text"
                    value={profileLastName}
                    onChange={(event) => setProfileLastName(event.target.value)}
                    placeholder="Last name"
                    autoComplete="family-name"
                  />
                </label>
              </div>
              <label>
                Email
                <input type="email" value={currentUserEmail} readOnly />
              </label>
              <label>
                Appearance
                <button
                  type="button"
                  className="primary-pill"
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}{" "}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
              </label>
              {profileFirstNameError ? <div role="alert">First name is required.</div> : null}
              {profileSaveError ? <div role="alert">{profileSaveError}</div> : null}
              {profileSaveInfo ? <div aria-live="polite">{profileSaveInfo}</div> : null}
              <div className="sheet-actions">
                <button type="submit" disabled={isProfileSaving}>
                  {isProfileSaving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {showHouseholdWorkspace ? (
        <section className="settings-card">
          <div className="section-toolbar">
            <h2>Households</h2>
            <button type="button" className="primary-pill no-wrap-button" onClick={openAddHousehold} disabled={isCreatingHousehold || isContextLoading}>
              Create household
            </button>
          </div>

          {households.length === 0 ? (
            <div className="coming-soon-card">
              <strong>No households yet.</strong>
              <div>Create your first household to begin adding members and contacts.</div>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="settings-table" aria-label="Households">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {households.map((household) => {
                    const isSelected = household.id === activeHouseholdId;
                    return (
                      <tr key={household.id} className={isSelected ? "selected-household-row" : ""}>
                        <td>{household.name}</td>
                        <td>{isSelected ? <span className="selected-pill">Selected</span> : "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="primary-pill"
                            onClick={() => onSwitchHousehold(household.id)}
                            disabled={isSelected || isContextLoading}
                          >
                            {isSelected ? "Active" : "Select"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {contextError ? (
            <div className="coming-soon-card">
              <strong>{contextError}</strong>
              <div>
                <button type="button" className="primary-pill" onClick={onRetryContextAction}>
                  Try again
                </button>
              </div>
            </div>
          ) : null}

          {isContextLoading ? (
            <div className="coming-soon-card">
              <strong>Loading selected household…</strong>
            </div>
          ) : null}

          <HouseholdDialog
            open={householdModalOpen}
            householdName={newHouseholdName}
            householdNameError={createHouseholdNameError}
            requestError={createHouseholdError}
            isSubmitting={isCreatingHousehold}
            onClose={closeAddHousehold}
            onSubmit={submitCreateHousehold}
            onHouseholdNameChange={(value) => {
              setNewHouseholdName(value);
              setCreateHouseholdError(null);
            }}
          />
        </section>
        ) : null}

        {showSettingsWorkspace ? (
        <section className="settings-card">
          <div className="section-toolbar">
            <h2>Household Members</h2>
            <button type="button" className="primary-pill" onClick={openAddMember} disabled={!canEditActiveHousehold}>
              + Member
            </button>
          </div>

          {!activeHouseholdId ? <div className="coming-soon-card">Select or create a household to manage members.</div> : null}

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
                {(canEditActiveHousehold ? orderedMembers : []).map((member, index) => (
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
                          <ArrowUpwardIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          onClick={() => moveMember(member.id, 1)}
                          disabled={index === orderedMembers.length - 1}
                          title="Move down"
                        >
                          <ArrowDownwardIcon fontSize="small" />
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
                        <EditOutlinedIcon fontSize="small" />
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
        ) : null}

        {showSettingsWorkspace ? (
        <section className="settings-card">
          <div className="section-toolbar responsive-toolbar">
            <h2>Contact List</h2>
            <div className="toolbar-controls">
              <input
                type="search"
                placeholder="Search contacts"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                disabled={!canEditActiveHousehold}
              />
              <button
                type="button"
                className="primary-pill no-wrap-button"
                onClick={openAddContact}
                disabled={!canEditActiveHousehold}
              >
                + Contact
              </button>
            </div>
          </div>

          {!activeHouseholdId ? <div className="coming-soon-card">Select or create a household to manage contacts.</div> : null}

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
                {(canEditActiveHousehold ? filteredContacts : []).map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="member-header">
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
                          <EditOutlinedIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          title="Delete contact"
                          onClick={() => deleteContact(contact.id)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
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
        ) : null}
      </main>
    </div>
  );
}

type FailedAction = { type: "initialLoad" } | { type: "switch"; householdId: string } | { type: "create"; householdName: string } | null;

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [authClient, setAuthClient] = useState<SupabaseClient | null>(null);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [householdData, setHouseholdData] = useState<HouseholdData>(getInitialHouseholdData);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isContextLoading, setIsContextLoading] = useState(false);
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [failedAction, setFailedAction] = useState<FailedAction>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const bootstrapAuth = async () => {
      try {
        let config = getBuildTimeSupabaseAuthConfig();
        if (!config) {
          config = await readRuntimeAuthConfig();
        }

        if (!config) {
          setAuthError(
            "Authentication setup required. Configure either frontend VITE auth variables at build time or Azure app settings for runtime auth configuration."
          );
          return;
        }

        const client = createSupabaseClient(config);
        if (!active) {
          return;
        }
        setAuthClient(client);

        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((_event, session) => {
          if (!active) {
            return;
          }
          setAuthSession(session);
          setAuthError(null);
        });
        unsubscribe = () => subscription.unsubscribe();

        const { data, error } = await client.auth.getSession();
        if (!active) {
          return;
        }
        if (error) {
          setAuthError(error.message);
        } else {
          setAuthSession(data.session);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setAuthError(error instanceof Error ? error.message : "Could not initialize authentication.");
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!authSession?.user?.id) {
      setInitialLoadComplete(false);
      return;
    }

    let cancelled = false;

    const loadInitialHouseholdContext = async () => {
      try {
        setIsContextLoading(true);
        const loadedHouseholds = await readHouseholds();
        if (cancelled) {
          return;
        }

        setHouseholds(loadedHouseholds);

        if (loadedHouseholds.length === 0) {
          setActiveHouseholdId(null);
          setHouseholdData(getInitialHouseholdData());
          setDataError(null);
          setFailedAction(null);
          return;
        }

        const storedActiveHousehold = window.localStorage.getItem(ACTIVE_HOUSEHOLD_STORAGE_KEY);
        const preferredHouseholdId =
          storedActiveHousehold && loadedHouseholds.some((household) => household.id === storedActiveHousehold)
            ? storedActiveHousehold
            : loadedHouseholds[0].id;
        const loadedHousehold = await readHousehold(preferredHouseholdId);
        if (cancelled) {
          return;
        }

        setHouseholdData(loadedHousehold);
        setActiveHouseholdId(preferredHouseholdId);
        window.localStorage.setItem(ACTIVE_HOUSEHOLD_STORAGE_KEY, preferredHouseholdId);
        setDataError(null);
        setFailedAction(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setDataError(error instanceof Error ? error.message : "Could not load households from the server.");
        setFailedAction({ type: "initialLoad" });
      } finally {
        if (!cancelled) {
          setIsContextLoading(false);
          setInitialLoadComplete(true);
        }
      }
    };

    loadInitialHouseholdContext();
    return () => {
      cancelled = true;
    };
  }, [authSession?.user?.id]);

  useEffect(() => {
    if (!initialLoadComplete || !activeHouseholdId || isContextLoading) {
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
      } catch (error) {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : "Could not save household data to the server.");
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
  }, [activeHouseholdId, householdData, initialLoadComplete, isContextLoading]);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const switchActiveHousehold = async (householdId: string) => {
    if (!householdId || householdId === activeHouseholdId) {
      return;
    }

    try {
      setIsContextLoading(true);
      const loaded = await readHousehold(householdId);
      setHouseholdData(loaded);
      setActiveHouseholdId(householdId);
      window.localStorage.setItem(ACTIVE_HOUSEHOLD_STORAGE_KEY, householdId);
      setDataError(null);
      setFailedAction(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not switch household.");
      setFailedAction({ type: "switch", householdId });
    } finally {
      setIsContextLoading(false);
    }
  };

  const createAndSelectHousehold = async (householdName: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      setIsCreatingHousehold(true);
      const created = await createHousehold(householdName);
      setHouseholds((current) => [...current, { id: created.householdId, name: created.householdName }]);
      setHouseholdData(created);
      setActiveHouseholdId(created.householdId);
      window.localStorage.setItem(ACTIVE_HOUSEHOLD_STORAGE_KEY, created.householdId);
      setDataError(null);
      setFailedAction(null);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create household.";
      setDataError(message);
      setFailedAction({ type: "create", householdName });
      return { ok: false, error: message };
    } finally {
      setIsCreatingHousehold(false);
    }
  };

  const retryLastContextAction = () => {
    if (!failedAction) {
      return;
    }

    if (failedAction.type === "switch") {
      void switchActiveHousehold(failedAction.householdId);
      return;
    }

    if (failedAction.type === "create") {
      void createAndSelectHousehold(failedAction.householdName);
      return;
    }

    window.location.reload();
  };

  const navigateTo = (nextPathname: "/" | "/profile" | "/settings") => {
    if (window.location.pathname === nextPathname) {
      return;
    }
    window.history.pushState({}, "", nextPathname);
    setPathname(nextPathname);
  };

  const currentUser = authSession?.user ?? null;
  const currentUserLabel = useMemo(() => (currentUser ? getUserDisplayName(currentUser) : ""), [currentUser]);
  const currentUserInitials = useMemo(() => getUserInitials(currentUserLabel), [currentUserLabel]);
  const currentUserEmail = currentUser?.email?.trim() ?? "";
  const currentUserAvatarUrl =
    typeof currentUser?.user_metadata?.avatar_url === "string" && currentUser.user_metadata.avatar_url.trim()
      ? currentUser.user_metadata.avatar_url.trim()
      : null;

  useEffect(() => {
    if (!currentUser) {
      setProfileFirstName("");
      setProfileLastName("");
      return;
    }

    const metadataFirst =
      typeof currentUser.user_metadata?.first_name === "string" ? currentUser.user_metadata.first_name.trim() : "";
    const metadataLast =
      typeof currentUser.user_metadata?.last_name === "string" ? currentUser.user_metadata.last_name.trim() : "";
    const metadataFull =
      typeof currentUser.user_metadata?.full_name === "string" ? currentUser.user_metadata.full_name.trim() : "";
    const derived = splitProfileName(metadataFull || currentUserLabel);

    setProfileFirstName(metadataFirst || derived.firstName);
    setProfileLastName(metadataLast || derived.lastName);
  }, [currentUser, currentUserLabel]);

  const openSettingsSection = (target: NavigationTarget) => {
    if (target === "settings") {
      navigateTo("/settings");
      return;
    }

    setSettingsSection(target);
    navigateTo("/profile");
  };

  const saveProfile = async (firstName: string, lastName: string): Promise<{ ok: boolean; error?: string }> => {
    if (!authClient) {
      return { ok: false, error: "Authentication client is not configured." };
    }

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    if (!normalizedFirstName) {
      return { ok: false, error: "First name is required." };
    }

    const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ");

    setIsProfileSaving(true);
    try {
      const { error } = await authClient.auth.updateUser({
        data: {
          first_name: normalizedFirstName,
          last_name: normalizedLastName || undefined,
          full_name: fullName,
        },
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      setProfileFirstName(normalizedFirstName);
      setProfileLastName(normalizedLastName);
      setAuthSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              user: {
                ...currentSession.user,
                user_metadata: {
                  ...currentSession.user.user_metadata,
                  first_name: normalizedFirstName,
                  last_name: normalizedLastName || undefined,
                  full_name: fullName,
                },
              },
            }
          : currentSession
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not save profile." };
    } finally {
      setIsProfileSaving(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    if (!authClient) {
      setAuthError("Authentication client is not configured.");
      return;
    }
    setAuthPending(true);
    setAuthError(null);
    setAuthInfo(null);

    const { error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
    }
    setAuthPending(false);
  };

  const register = async (email: string, password: string, fullName: string) => {
    if (!authClient) {
      setAuthError("Authentication client is not configured.");
      return;
    }
    setAuthPending(true);
    setAuthError(null);
    setAuthInfo(null);

    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
      },
    });

    if (error) {
      setAuthError(error.message);
      setAuthPending(false);
      return;
    }

    if (!data.session) {
      setAuthInfo("Account created. Check your email to confirm your account before signing in.");
    }

    setAuthPending(false);
  };

  const signOut = async () => {
    if (!authClient) {
      setAuthError("Authentication client is not configured.");
      return;
    }

    const { error } = await authClient.auth.signOut();
    if (error) {
      setAuthError(error.message);
    }
  };

  if (!authReady) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <section className="calendar-card">Checking authentication…</section>
        </main>
      </div>
    );
  }

  if (!authClient) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <section className="calendar-card">
            <h2>Authentication setup required</h2>
            <p>{authError ?? "Set Supabase auth environment variables to continue."}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!authSession) {
    return (
      <AuthScreen isSubmitting={authPending} errorMessage={authError} infoMessage={authInfo} onLogin={signIn} onRegister={register} />
    );
  }

  if (!initialLoadComplete || (isContextLoading && !activeHouseholdId && households.length > 0)) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <section className="calendar-card">Loading household data…</section>
        </main>
      </div>
    );
  }

  if (!activeHouseholdId && pathname === "/settings") {
    return (
      <>
        {dataError ? <div role="alert">{dataError}</div> : null}
        <div className="dashboard-page">
          <main className="dashboard-main">
            <section className="calendar-card">
              <p>Select a household in Profile before editing household settings.</p>
              <button type="button" className="primary-pill" onClick={() => openSettingsSection("households")}>
                Go to Profile Households
              </button>
            </section>
          </main>
        </div>
      </>
    );
  }

  if (!activeHouseholdId && pathname !== "/profile") {
    return (
      <>
        {dataError ? <div role="alert">{dataError}</div> : null}
        <div className="dashboard-page">
          <main className="dashboard-main">
            <section className="calendar-card">
              <p>No household selected.</p>
              <button type="button" className="primary-pill" onClick={() => openSettingsSection("households")}>
                Go to Households
              </button>
            </section>
          </main>
        </div>
      </>
    );
  }

  return pathname === "/profile" ? (
    <>
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      <SettingsPage
        mode="profile"
        households={households}
        activeHouseholdId={activeHouseholdId}
        onSwitchHousehold={(householdId) => {
          void switchActiveHousehold(householdId);
        }}
        onCreateHousehold={createAndSelectHousehold}
        isContextLoading={isContextLoading}
        isCreatingHousehold={isCreatingHousehold}
        householdData={householdData}
        setHouseholdData={setHouseholdData}
        contextError={dataError}
        onRetryContextAction={retryLastContextAction}
        onGoHome={() => navigateTo("/")}
        initialSection={settingsSection}
        currentUserEmail={currentUserEmail}
        initialProfileFirstName={profileFirstName}
        initialProfileLastName={profileLastName}
        isProfileSaving={isProfileSaving}
        onSaveProfile={saveProfile}
        theme={theme}
        setTheme={setTheme}
      />
    </>
  ) : pathname === "/settings" ? (
    <>
      {dataError ? <div role="alert">{dataError}</div> : null}
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      {isContextLoading ? <div aria-live="polite">Loading selected household…</div> : null}
      <SettingsPage
        mode="settings"
        households={households}
        activeHouseholdId={activeHouseholdId}
        onSwitchHousehold={(householdId) => {
          void switchActiveHousehold(householdId);
        }}
        onCreateHousehold={createAndSelectHousehold}
        isContextLoading={isContextLoading}
        isCreatingHousehold={isCreatingHousehold}
        householdData={householdData}
        setHouseholdData={setHouseholdData}
        contextError={dataError}
        onRetryContextAction={retryLastContextAction}
        onGoHome={() => navigateTo("/")}
        initialSection={settingsSection}
        currentUserEmail={currentUserEmail}
        initialProfileFirstName={profileFirstName}
        initialProfileLastName={profileLastName}
        isProfileSaving={isProfileSaving}
        onSaveProfile={saveProfile}
        theme={theme}
        setTheme={setTheme}
      />
    </>
  ) : (
    <>
      {dataError ? <div role="alert">{dataError}</div> : null}
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      {isContextLoading ? <div aria-live="polite">Loading selected household…</div> : null}
      <DashboardApp
        householdData={householdData}
        onOpenSettings={openSettingsSection}
        currentUserLabel={currentUserLabel}
        currentUserEmail={currentUserEmail}
        currentUserInitials={currentUserInitials}
        currentUserAvatarUrl={currentUserAvatarUrl}
        onSignOut={signOut}
      />
    </>
  );
}
