import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./Button";

export function AppHeader() {
  const { user, signOut, loading } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-sand-100 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl font-heading font-semibold text-ink-900">
            BCD
          </span>
          <span className="hidden text-sm text-ink-700 md:inline">
            Visual Change Awareness
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-ink-700">
          {loading ? (
            <span className="text-xs uppercase tracking-[0.2em] text-ink-700">
              Loading...
            </span>
          ) : user ? (
            <>
              <NavLink
                to="/capture"
                className={({ isActive }) =>
                  isActive ? "font-semibold text-ink-900" : "hover:text-ink-900"
                }
              >
                Capture
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  isActive ? "font-semibold text-ink-900" : "hover:text-ink-900"
                }
              >
                History
              </NavLink>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  isActive ? "font-semibold text-ink-900" : "hover:text-ink-900"
                }
              >
                Log in
              </NavLink>
              <NavLink
                to="/signup"
                className={({ isActive }) =>
                  isActive ? "font-semibold text-ink-900" : "hover:text-ink-900"
                }
              >
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
