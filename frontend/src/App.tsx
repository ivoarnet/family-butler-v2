import { FormEvent, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { DashboardScreen } from "./components/screens/DashboardScreen";
import { SettingsScreen } from "./components/screens/SettingsScreen";
import { SignInScreen } from "./components/screens/SignInScreen";
import { HouseholdData, ThemeMode } from "./types/app";
import { Contact, FamilyMember } from "./types/family";
import { normalizeFamilyMembers } from "./utils/familyUtils";
import { isSupabaseAuthConfigured, supabase } from "./supabaseClient";

type AppRole = "admin" | "demouser";

const THEME_STORAGE_KEY = "family-butler-theme";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const DEFAULT_HOUSEHOLD_ID = import.meta.env.VITE_HOUSEHOLD_ID ?? "00000000-0000-0000-0000-000000000001";
const DEMO_HOUSEHOLD_ID = import.meta.env.VITE_DEMO_HOUSEHOLD_ID ?? "00000000-0000-0000-0000-000000000001";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const role = getRoleFromSession(session);
  const isReadOnly = role === "demouser";
  const householdId = isReadOnly ? DEMO_HOUSEHOLD_ID : DEFAULT_HOUSEHOLD_ID;

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
      setInitialLoadComplete(false);
      setDataError(null);
      return;
    }

    let cancelled = false;
    setInitialLoadComplete(false);

    const loadHouseholdData = async () => {
      try {
        const loaded = await readHousehold(householdId, session.access_token);
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
  }, [householdId, session?.access_token]);

  useEffect(() => {
    if (!initialLoadComplete || !session?.access_token || isReadOnly) {
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
  }, [householdData, initialLoadComplete, isReadOnly, session?.access_token]);

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

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSupabaseAuthConfigured) {
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setPassword("");
    }
    setIsSigningIn(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPathname("/");
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
        email={email}
        credential={password}
        onEmailChange={setEmail}
        onCredentialChange={setPassword}
        onSubmit={signIn}
        isSigningIn={isSigningIn}
        error={authError}
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
      <SettingsScreen householdData={householdData} setHouseholdData={setHouseholdData} onGoHome={() => navigateTo("/")} />
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
