import { useEffect, useMemo, useState } from "react";
import { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { AuthScreen } from "./features/auth/components/AuthScreen";
import { HouseholdData, HouseholdSummary, NavigationTarget, SettingsSection, ThemeMode } from "./features/app/types";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { createSupabaseClient, getBuildTimeSupabaseAuthConfig } from "./lib/supabaseClient";
import { Contact, DayConfiguration, DayConfigurationCategory, EventType, FamilyMember, HouseholdEvent } from "./types/family";
import { normalizeMemberColor } from "./shared/family/memberAvatarColors";

const THEME_STORAGE_KEY = "family-butler-theme";
const ACTIVE_HOUSEHOLD_STORAGE_KEY = "family-butler-active-household-id";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const defaultHouseholdData: HouseholdData = {
  householdId: "",
  householdName: "",
  familyMembers: [],
  contacts: [],
  eventTypes: [],
  events: [],
  dayConfigurations: [],
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

const normalizeEventTypes = (eventTypes: EventType[]): EventType[] =>
  [...eventTypes]
    .filter((eventType) => eventType && typeof eventType.name === "string" && eventType.name.trim())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((eventType, index) => ({
      id: eventType.id,
      name: eventType.name.trim(),
      icon: eventType.icon?.trim() || undefined,
      sortOrder: index,
    }));

const normalizeTime24Hour = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return undefined;
  }
  return `${match[1]}:${match[2]}`;
};

const normalizeEvents = (events: HouseholdEvent[]): HouseholdEvent[] =>
  events
    .filter((event) => event && typeof event.title === "string" && event.title.trim())
    .map((event) => ({
      id: event.id,
      title: event.title.trim(),
      date: event.date,
      memberIds: Array.isArray(event.memberIds) ? [...new Set(event.memberIds.filter((memberId) => typeof memberId === "string" && memberId))] : [],
      allDay: event.allDay !== false,
      startTime: event.allDay ? undefined : normalizeTime24Hour(event.startTime),
      endTime: event.allDay ? undefined : normalizeTime24Hour(event.endTime),
      eventTypeId: event.eventTypeId?.trim() || undefined,
      repeatRule: event.repeatRule?.trim() || undefined,
      location: event.location?.trim() || undefined,
      notes: event.notes?.trim() || undefined,
    }));

const DAY_CONFIGURATION_CATEGORIES = new Set<DayConfigurationCategory>(["school_off", "bank_holiday", "bridge_day"]);

const normalizeDayConfigurations = (dayConfigurations: DayConfiguration[]): DayConfiguration[] =>
  dayConfigurations
    .filter((dayConfiguration) => dayConfiguration && DAY_CONFIGURATION_CATEGORIES.has(dayConfiguration.category))
    .filter(
      (dayConfiguration) =>
        /^\d{4}-\d{2}-\d{2}$/.test(dayConfiguration.startDate) &&
        /^\d{4}-\d{2}-\d{2}$/.test(dayConfiguration.endDate) &&
        dayConfiguration.endDate >= dayConfiguration.startDate
    )
    .map((dayConfiguration) => ({
      id: dayConfiguration.id,
      category: dayConfiguration.category,
      startDate: dayConfiguration.startDate,
      endDate: dayConfiguration.endDate,
      label: dayConfiguration.label?.trim() || undefined,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));

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
    eventTypes: Array.isArray(payload.eventTypes) ? normalizeEventTypes(payload.eventTypes.filter(Boolean) as EventType[]) : fallback.eventTypes,
    events: Array.isArray(payload.events) ? normalizeEvents(payload.events.filter(Boolean) as HouseholdEvent[]) : fallback.events,
    dayConfigurations: Array.isArray(payload.dayConfigurations)
      ? normalizeDayConfigurations(payload.dayConfigurations.filter(Boolean) as DayConfiguration[])
      : fallback.dayConfigurations,
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

const createRequestHeaders = (accessToken: string, includeJsonContentType = false): HeadersInit => {
  const headers: Record<string, string> = {
    Authorization: ["Bearer", accessToken].join(" "),
    "x-supabase-auth-token": accessToken,
  };
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const readHouseholds = async (accessToken: string): Promise<HouseholdSummary[]> => {
  const response = await fetch(`${API_BASE_URL}/api/households`, {
    headers: createRequestHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Failed to load households"));
  }

  const payload = (await response.json()) as { households?: HouseholdSummary[] };
  return Array.isArray(payload.households) ? payload.households.filter(Boolean) : [];
};

const readHousehold = async (accessToken: string, householdId: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}`, {
    headers: createRequestHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await parseResponseError(response, "Failed to load household data"));
  }
  return toHouseholdData((await response.json()) as Partial<HouseholdData>, householdId);
};

const createHousehold = async (accessToken: string, householdName: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households`, {
    method: "POST",
    headers: createRequestHeaders(accessToken, true),
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

const writeHousehold = async (accessToken: string, household: HouseholdData): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${household.householdId}`, {
    method: "PUT",
    headers: createRequestHeaders(accessToken, true),
    body: JSON.stringify({
      householdName: household.householdName,
      familyMembers: normalizeFamilyMembers(household.familyMembers),
      contacts: household.contacts,
      eventTypes: normalizeEventTypes(household.eventTypes),
      events: normalizeEvents(household.events),
      dayConfigurations: normalizeDayConfigurations(household.dayConfigurations),
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
    if (!authSession?.user?.id || !authSession.access_token) {
      setInitialLoadComplete(false);
      return;
    }

    let cancelled = false;
    const accessToken = authSession.access_token;

    const loadInitialHouseholdContext = async () => {
      try {
        setIsContextLoading(true);
        const loadedHouseholds = await readHouseholds(accessToken);
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
        const loadedHousehold = await readHousehold(accessToken, preferredHouseholdId);
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
  }, [authSession?.user?.id, authSession?.access_token]);

  useEffect(() => {
    if (!initialLoadComplete || !activeHouseholdId || isContextLoading) {
      return;
    }

    let cancelled = false;

    const persistHouseholdData = async () => {
      try {
        if (!authSession?.access_token) {
          throw new Error("You need to sign in again.");
        }
        setIsSaving(true);
        const persisted = await writeHousehold(authSession.access_token, householdData);
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
  }, [activeHouseholdId, authSession?.access_token, householdData, initialLoadComplete, isContextLoading]);

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
      if (!authSession?.access_token) {
        throw new Error("You need to sign in again.");
      }
      setIsContextLoading(true);
      const loaded = await readHousehold(authSession.access_token, householdId);
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
      if (!authSession?.access_token) {
        throw new Error("You need to sign in again.");
      }
      setIsCreatingHousehold(true);
      const created = await createHousehold(authSession.access_token, householdName);
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

  const updateHouseholdName = async (householdId: string, householdName: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (!authSession?.access_token) {
        throw new Error("You need to sign in again.");
      }
      setIsCreatingHousehold(true);
      const sourceHousehold =
        householdData.householdId === householdId ? householdData : await readHousehold(authSession.access_token, householdId);
      const persisted = await writeHousehold(authSession.access_token, { ...sourceHousehold, householdName });
      setHouseholds((current) =>
        current.map((household) => (household.id === householdId ? { ...household, name: persisted.householdName } : household))
      );
      if (activeHouseholdId === householdId) {
        setHouseholdData(persisted);
      }
      setDataError(null);
      setFailedAction(null);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update household.";
      setDataError(message);
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
        onUpdateHousehold={updateHouseholdName}
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
        onUpdateHousehold={updateHouseholdName}
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
      <DashboardPage
        householdData={householdData}
        setHouseholdData={setHouseholdData}
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
