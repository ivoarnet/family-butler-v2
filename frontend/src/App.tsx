import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { DashboardScreen } from "./components/screens/DashboardScreen";
import { SettingsScreen } from "./components/screens/SettingsScreen";
import { SignInScreen } from "./components/screens/SignInScreen";
import { HouseholdData, ThemeMode, UserHouseholdMemberLink, UserHouseholdOption, UserSettingsPayload } from "./types/app";
import { Contact, FamilyMember } from "./types/family";
import { normalizeFamilyMembers } from "./utils/familyUtils";
import { isSupabaseAuthConfigured, supabase } from "./supabaseClient";

type AppRole = "admin" | "demouser";

const THEME_STORAGE_KEY = "family-butler-theme";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const DEFAULT_HOUSEHOLD_ID = import.meta.env.VITE_HOUSEHOLD_ID ?? "00000000-0000-0000-0000-000000000001";
const DEMO_HOUSEHOLD_ID = import.meta.env.VITE_DEMO_HOUSEHOLD_ID ?? "00000000-0000-0000-0000-000000000001";
const DEFAULT_HOUSEHOLD_NAME = "Family Butler";

const getThemeFromSystem = (): ThemeMode =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const getInitialTheme = (): ThemeMode => {
  const persistedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (persistedTheme === "light" || persistedTheme === "dark") {
    return persistedTheme;
  }
  return getThemeFromSystem();
};

const defaultHouseholdData: HouseholdData = {
  householdId: DEFAULT_HOUSEHOLD_ID,
  householdName: "Family Butler",
  familyMembers: [],
  contacts: [],
};

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

const getRoleFromSession = (session: Session | null): AppRole =>
  session?.user?.app_metadata?.role === "demouser" ? "demouser" : "admin";

const toUserSettings = (payload: Partial<UserSettingsPayload>, fallbackHouseholdId: string): UserSettingsPayload => {
  const households = Array.isArray(payload.households)
    ? payload.households
        .filter((household): household is UserHouseholdOption => Boolean(household && household.id && household.name))
        .map((household) => ({
          id: household.id,
          name: household.name,
          canManage: Boolean(household.canManage),
          source: household.source ?? "owned",
        }))
    : [];
  const uniqueHouseholds = [...new Map(households.map((household) => [household.id, household])).values()];
  const effectiveHouseholds =
    uniqueHouseholds.length > 0
      ? uniqueHouseholds
      : [{ id: fallbackHouseholdId, name: DEFAULT_HOUSEHOLD_NAME, canManage: true, source: "owned" as const }];
  const householdIds = new Set(effectiveHouseholds.map((household) => household.id));
  const defaultHouseholdId =
    typeof payload.defaultHouseholdId === "string" && householdIds.has(payload.defaultHouseholdId)
      ? payload.defaultHouseholdId
      : effectiveHouseholds[0].id;
  const linkedMembers = Array.isArray(payload.linkedMembers)
    ? payload.linkedMembers
        .filter((link): link is UserHouseholdMemberLink => Boolean(link && link.memberId && link.householdId))
        .map((link) => ({
          memberId: link.memberId,
          householdId: link.householdId,
        }))
    : [];

  return {
    defaultHouseholdId,
    households: effectiveHouseholds,
    linkedMembers,
  };
};

const readHousehold = async (householdId: string, accessToken: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}`, {
    headers: {
      Authorization: ["Bearer", accessToken].join(" "),
    },
  });
  if (!response.ok) {
    throw new Error("Failed to load household data");
  }
  return toHouseholdData((await response.json()) as Partial<HouseholdData>, householdId);
};

const readUserSettings = async (accessToken: string, fallbackHouseholdId: string): Promise<UserSettingsPayload> => {
  const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
    headers: {
      Authorization: ["Bearer", accessToken].join(" "),
    },
  });
  if (!response.ok) {
    throw new Error("Failed to load user settings");
  }

  return toUserSettings((await response.json()) as Partial<UserSettingsPayload>, fallbackHouseholdId);
};

const writeUserSettings = async (
  accessToken: string,
  payload: { defaultHouseholdId: string },
  fallbackHouseholdId: string
): Promise<UserSettingsPayload> => {
  const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
    method: "PUT",
    headers: {
      Authorization: ["Bearer", accessToken].join(" "),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to save user settings");
  }

  return toUserSettings((await response.json()) as Partial<UserSettingsPayload>, fallbackHouseholdId);
};

const createUserHousehold = async (
  accessToken: string,
  householdName: string,
  fallbackHouseholdId: string
): Promise<UserSettingsPayload & { householdId: string }> => {
  const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
    method: "POST",
    headers: {
      Authorization: ["Bearer", accessToken].join(" "),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ householdName }),
  });
  if (!response.ok) {
    throw new Error("Failed to create household");
  }

  const payload = (await response.json()) as Partial<UserSettingsPayload> & { householdId?: string };
  const settings = toUserSettings(payload, fallbackHouseholdId);
  if (!payload.householdId) {
    throw new Error("Failed to create household");
  }

  return {
    householdId: payload.householdId,
    ...settings,
  };
};

const writeHousehold = async (household: HouseholdData, accessToken: string): Promise<HouseholdData> => {
  const response = await fetch(`${API_BASE_URL}/api/households/${household.householdId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: ["Bearer", accessToken].join(" "),
    },
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

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [householdData, setHouseholdData] = useState<HouseholdData>(getInitialHouseholdData);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userHouseholds, setUserHouseholds] = useState<UserHouseholdOption[]>([]);
  const [defaultHouseholdId, setDefaultHouseholdId] = useState(DEFAULT_HOUSEHOLD_ID);
  const [linkedMembers, setLinkedMembers] = useState<UserHouseholdMemberLink[]>([]);
  const role = getRoleFromSession(session);
  const isReadOnly = role === "demouser";
  const fallbackHouseholdId = isReadOnly ? DEMO_HOUSEHOLD_ID : DEFAULT_HOUSEHOLD_ID;
  const selectedHouseholdId = defaultHouseholdId || fallbackHouseholdId;
  const canManageCurrentHousehold = userHouseholds.some((household) => household.id === selectedHouseholdId && household.canManage);

  const navigateTo = (nextPathname: "/" | "/settings") => {
    if (window.location.pathname === nextPathname) {
      return;
    }
    window.history.pushState({}, "", nextPathname);
    setPathname(nextPathname);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!isSupabaseAuthConfigured) {
      setAuthLoading(false);
      setAuthError("Supabase auth is not configured in this environment.");
      return;
    }

    let cancelled = false;
    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) {
        return;
      }
      if (error) {
        setAuthError("Could not restore your session.");
      }
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setHouseholdData(getInitialHouseholdData());
      setDefaultHouseholdId(DEFAULT_HOUSEHOLD_ID);
      setUserHouseholds([]);
      setLinkedMembers([]);
      setInitialLoadComplete(false);
      setDataError(null);
      return;
    }

    let cancelled = false;
    setInitialLoadComplete(false);

    const loadHouseholdData = async () => {
      try {
        const settings = await readUserSettings(session.access_token, fallbackHouseholdId);
        const loaded = await readHousehold(settings.defaultHouseholdId, session.access_token);
        if (cancelled) {
          return;
        }
        setUserHouseholds(settings.households);
        setDefaultHouseholdId(settings.defaultHouseholdId);
        setLinkedMembers(settings.linkedMembers);
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
  }, [fallbackHouseholdId, session?.access_token]);

  useEffect(() => {
    if (!initialLoadComplete || !session?.access_token || isReadOnly || !canManageCurrentHousehold) {
      return;
    }

    let cancelled = false;

    const persistHouseholdData = async () => {
      try {
        setIsSaving(true);
        const persisted = await writeHousehold(householdData, session.access_token);
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
  }, [householdData, initialLoadComplete, isReadOnly, session?.access_token, canManageCurrentHousehold]);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (isReadOnly && pathname === "/settings") {
      navigateTo("/");
    }
  }, [isReadOnly, pathname]);

  const signIn = async ({ email, password }: { email: string; password: string }) => {
    if (!isSupabaseAuthConfigured) {
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError(null);
    setAuthInfo(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message);
    }
    setIsAuthSubmitting(false);
  };

  const register = async ({ fullName, email, password }: { fullName: string; email: string; password: string }) => {
    if (!isSupabaseAuthConfigured) {
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError(null);
    setAuthInfo(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) {
      setAuthError(error.message);
    } else {
      if (data.session?.access_token) {
        await readUserSettings(data.session.access_token, fallbackHouseholdId);
      }
      setAuthInfo("Account created. If email confirmation is enabled, please verify your inbox before signing in.");
    }
    setIsAuthSubmitting(false);
  };

  const forgotPassword = async (email: string) => {
    if (!isSupabaseAuthConfigured) {
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError(null);
    setAuthInfo(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthInfo("Password reset instructions were sent if this account exists.");
    }
    setIsAuthSubmitting(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setDefaultHouseholdId(DEFAULT_HOUSEHOLD_ID);
    setUserHouseholds([]);
    setLinkedMembers([]);
    setPathname("/");
  };

  const changeDefaultHousehold = async (nextHouseholdId: string) => {
    if (!session?.access_token || !nextHouseholdId || nextHouseholdId === selectedHouseholdId || isReadOnly) {
      return;
    }

    try {
      setIsSaving(true);
      const settings = await writeUserSettings(
        session.access_token,
        { defaultHouseholdId: nextHouseholdId },
        fallbackHouseholdId
      );
      const loadedHousehold = await readHousehold(settings.defaultHouseholdId, session.access_token);
      setUserHouseholds(settings.households);
      setDefaultHouseholdId(settings.defaultHouseholdId);
      setLinkedMembers(settings.linkedMembers);
      setHouseholdData(loadedHousehold);
      setDataError(null);
    } catch {
      setDataError("Could not switch default household.");
    } finally {
      setIsSaving(false);
    }
  };

  const createHousehold = async (name: string) => {
    if (!session?.access_token || isReadOnly) {
      return;
    }

    const householdName = name.trim();
    if (!householdName) {
      return;
    }

    try {
      setIsSaving(true);
      const settings = await createUserHousehold(session.access_token, householdName, fallbackHouseholdId);
      const createdHousehold = await readHousehold(settings.householdId, session.access_token);

      setUserHouseholds(settings.households);
      setDefaultHouseholdId(settings.defaultHouseholdId);
      setLinkedMembers(settings.linkedMembers);
      setHouseholdData(createdHousehold);
      setDataError(null);
    } catch {
      setDataError("Could not create household.");
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <section className="calendar-card">Loading authentication…</section>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <SignInScreen
        onSignIn={signIn}
        onRegister={register}
        onForgotPassword={forgotPassword}
        isSubmitting={isAuthSubmitting}
        error={authError}
        info={authInfo}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
    );
  }

  if (!initialLoadComplete) {
    return (
      <div className="dashboard-page">
        <main className="dashboard-main">
          <section className="calendar-card">Loading household data…</section>
        </main>
      </div>
    );
  }

  return pathname === "/settings" && !isReadOnly ? (
    <>
      {dataError ? <div role="alert">{dataError}</div> : null}
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      <SettingsScreen
        householdData={householdData}
        setHouseholdData={setHouseholdData}
        onGoHome={() => navigateTo("/")}
        householdOptions={userHouseholds}
        defaultHouseholdId={selectedHouseholdId}
        onDefaultHouseholdChange={changeDefaultHousehold}
        onCreateHousehold={createHousehold}
        linkedMembers={linkedMembers}
        canManageCurrentHousehold={canManageCurrentHousehold}
      />
    </>
  ) : (
    <>
      {dataError ? <div role="alert">{dataError}</div> : null}
      {isSaving ? <div aria-live="polite">Saving…</div> : null}
      <DashboardScreen
        theme={theme}
        setTheme={setTheme}
        householdData={householdData}
        onOpenSettings={() => navigateTo("/settings")}
        canOpenSettings={!isReadOnly}
        onSignOut={signOut}
      />
    </>
  );
}
