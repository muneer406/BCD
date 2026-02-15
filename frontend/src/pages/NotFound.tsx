import { ArrowLeft, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { PageShell } from "../components/PageShell";

export function NotFound() {
  return (
    <PageShell className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center space-y-6 max-w-lg">
        <div className="space-y-2">
          <div className="text-6xl sm:text-7xl font-heading font-bold text-sand-300 mb-4">
            404
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-semibold text-ink-900">
            Page not found
          </h1>
          <p className="text-sm sm:text-base text-ink-700">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="rounded-2xl sm:rounded-3xl bg-sand-50 border border-sand-100 p-4 sm:p-6">
          <p className="text-xs sm:text-sm text-ink-600 mb-4">
            Here are some helpful links instead:
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/" className="block">
              <button className="w-full flex items-center justify-center gap-2 rounded-full bg-ink-900 text-sand-50 px-4 py-2 text-sm font-semibold hover:bg-ink-800 transition">
                <Home className="h-4 w-4" />
                Back to home
              </button>
            </Link>
            <button
              onClick={() => window.history.back()}
              className="w-full flex items-center justify-center gap-2 rounded-full border border-ink-700 text-ink-900 px-4 py-2 text-sm font-semibold hover:bg-sand-100 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </button>
          </div>
        </div>

        <p className="text-xs text-ink-600">
          If you think this is an error, please contact support.
        </p>
      </div>
    </PageShell>
  );
}
