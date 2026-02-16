import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

// Session timeout in milliseconds (default: 30 minutes of inactivity)
const SESSION_TIMEOUT = 30 * 60 * 1000;

async function fetchDisclaimer(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("disclaimer_acceptance")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return false;
    }

    return Boolean(data?.user_id);
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState(true);

  // Use refs to avoid stale closures
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const authListenerRef = useRef<(() => void) | null>(null);

  // Setup and cleanup auth listener
  useEffect(() => {
    isMountedRef.current = true;
    let isMounted = true;

    const initializeAuth = async () => {
      try {
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
      } catch (error) {
        console.error("Auth initialization error:", error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIsSessionValid(!!nextSession);
      },
    );

    authListenerRef.current = authListener.subscription.unsubscribe;

    return () => {
      isMounted = false;
      isMountedRef.current = false;
      authListenerRef.current?.();
    };
  }, []);

  // Activity tracking effect - consolidated timeout management
  useEffect(() => {
    if (!user || !isSessionValid) {
      // Clean up timeout when session ends
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
      return;
    }

    const handleActivity = () => {
      // Clear existing timeout
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }

      // Set new timeout
      sessionTimeoutRef.current = setTimeout(async () => {
        if (isMountedRef.current) {
          setIsSessionValid(false);
          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error("Sign out error:", error);
          }
        }
      }, SESSION_TIMEOUT);
    };

    // Track common user activities
    const events = ["mousedown", "keydown", "touchstart", "click"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Initial timeout setup
    handleActivity();

    return () => {
      // Cleanup event listeners
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      // Cleanup timeout
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
        sessionTimeoutRef.current = null;
      }
    };
  }, [user, isSessionValid]);

  // Fetch disclaimer when user changes
  useEffect(() => {
    if (!user) {
      setDisclaimerAccepted(false);
      return;
    }

    let isMounted = true;

    fetchDisclaimer(user.id).then((accepted) => {
      if (isMounted && isMountedRef.current) {
        setDisclaimerAccepted(accepted);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const refreshDisclaimer = async () => {
    if (!user) return;
    try {
      const accepted = await fetchDisclaimer(user.id);
      if (isMountedRef.current) {
        setDisclaimerAccepted(accepted);
      }
    } catch (error) {
      console.error("Disclaimer refresh error:", error);
    }
  };

  const signOut = async () => {
    // Clean up timeout
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }

    if (isMountedRef.current) {
      setIsSessionValid(false);
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    }
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
