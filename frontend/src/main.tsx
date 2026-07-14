import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { DraftProvider } from "./context/DraftContext";
import { SessionCacheProvider } from "./context/SessionCacheContext";
import "./index.css";

// ── Sentry error monitoring (guarded — no-op without DSN) ──────────────────
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  import("./sentry").then(({ initSentry }) => initSentry(SENTRY_DSN));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SessionCacheProvider>
          <DraftProvider>
            <App />
          </DraftProvider>
        </SessionCacheProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
