import { Camera, History, LogIn, LogOut, UserPlus } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AppHeader() {
  const { user, signOut, loading } = useAuth();
  const navBase =
    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition";
  const navIdle = "text-ink-700 hover:bg-sand-100 hover:text-ink-900";
  const navDanger =
    "text-red-700 hover:text-red-800 hover:bg-red-50 border border-transparent";
  const navActive = "bg-ink-900 text-sand-50 shadow-lift";

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
        <nav className="flex items-center gap-2 rounded-full border border-sand-100 bg-white/80 px-2 py-1 text-sm text-ink-700 shadow-sm">
          {loading ? (
            <span className="text-xs uppercase tracking-[0.2em] text-ink-700">
              Loading...
            </span>
          ) : user ? (
            <>
              <NavLink
                to="/capture"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? navActive : navIdle}`
                }
              >
                <Camera className="h-4 w-4" />
                Capture
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? navActive : navIdle}`
                }
              >
                <History className="h-4 w-4" />
                History
              </NavLink>
              <button
                type="button"
                className={`${navBase} ${navDanger}`}
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? navActive : navIdle}`
                }
              >
                <LogIn className="h-4 w-4" />
                Log in
              </NavLink>
              <NavLink
                to="/signup"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? navActive : navIdle}`
                }
              >
                <UserPlus className="h-4 w-4" />
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
