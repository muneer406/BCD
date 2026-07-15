import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth() {
  const { user, loading, isVerified } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-700">
        Loading your space...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return <Outlet />;
}

export function RequireVerification() {
  const { user, loading, isVerified } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-700">
        Loading your space...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isVerified) {
    return <Navigate to="/capture" replace />;
  }

  return <Outlet />;
}

export function RequireConsent() {
  const consent = (() => {
    try {
      const stored = localStorage.getItem("bcd_consent");
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();

  if (!consent?.completed) {
    return <Navigate to="/consent" replace />;
  }

  return <Outlet />;
}

export function RequireDisclaimer() {
  const { disclaimerAccepted, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-700">
        Checking your disclaimer status...
      </div>
    );
  }

  if (!disclaimerAccepted) {
    return <Navigate to="/disclaimer" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export function RedirectIfAuthed() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-700">
        Loading your space...
      </div>
    );
  }

  if (user) {
    return <Navigate to="/capture" replace />;
  }

  return <Outlet />;
}
