import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  disclaimerAccepted: boolean;
  refreshDisclaimer: () => Promise<void>;
  signOut: () => Promise<void>;
  isSessionValid: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Session timeout in minutes (default: 30 minutes of inactivity)
const SESSION_TIMEOUT = 30 * 60 * 1000;

async function fetchDisclaimer(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("disclaimer_acceptance")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.user_id);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState(true);
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());
  const [sessionTimeoutId, setSessionTimeoutId] =
    useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      const sessionUser = data.session?.user;
      setSession(data.session ?? null);
      setUser(sessionUser ?? null);
      setIsSessionValid(!!data.session);

      // Fetch disclaimer status in parallel
      if (sessionUser) {
        const accepted = await fetchDisclaimer(sessionUser.id);
        if (isMounted) {
          setDisclaimerAccepted(accepted);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIsSessionValid(!!nextSession);
        setLastActivityTime(Date.now());
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Activity tracking effect - tracks user interactions to prevent timeout
  useEffect(() => {
    if (!user || !isSessionValid) return;

    const handleActivity = () => {
      setLastActivityTime(Date.now());

      // Clear existing timeout
      if (sessionTimeoutId) {
        clearTimeout(sessionTimeoutId);
      }

      // Set new timeout
      const timeoutId = setTimeout(() => {
        setIsSessionValid(false);
        supabase.auth.signOut();
      }, SESSION_TIMEOUT);

      setSessionTimeoutId(timeoutId);
    };

    // Track common user activities
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("click", handleActivity);

    // Initial timeout setup
    const initialTimeoutId = setTimeout(() => {
      setIsSessionValid(false);
      supabase.auth.signOut();
    }, SESSION_TIMEOUT);

    setSessionTimeoutId(initialTimeoutId);

    return () => {
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("click", handleActivity);

      if (initialTimeoutId) {
        clearTimeout(initialTimeoutId);
      }
    };
  }, [user, isSessionValid]);

  useEffect(() => {
    if (!user) {
      setDisclaimerAccepted(false);
      return;
    }

    fetchDisclaimer(user.id).then((accepted) => {
      setDisclaimerAccepted(accepted);
    });
  }, [user]);

  const refreshDisclaimer = async () => {
    if (!user) return;
    const accepted = await fetchDisclaimer(user.id);
    setDisclaimerAccepted(accepted);
  };

  const signOut = async () => {
    if (sessionTimeoutId) {
      clearTimeout(sessionTimeoutId);
    }
    setIsSessionValid(false);
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      disclaimerAccepted,
      refreshDisclaimer,
      signOut,
      isSessionValid,
    }),
    [session, user, loading, disclaimerAccepted, isSessionValid],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
