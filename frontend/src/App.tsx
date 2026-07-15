import { Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  RedirectIfAuthed,
  RequireAuth,
  RequireConsent,
  RequireDisclaimer,
  RequireVerification,
} from "./components/RouteGuards";
import { Capture } from "./pages/Capture";
import { ClinicalSummary } from "./pages/ClinicalSummary";
import { ConsentFlow } from "./pages/ConsentFlow";
import { CycleTracker } from "./pages/CycleTracker";
import { Disclaimer } from "./pages/Disclaimer";
import { History } from "./pages/History";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import { ResetPassword } from "./pages/ResetPassword";
import { Result } from "./pages/Result";
import { Signup } from "./pages/Signup";
import Terms from "./pages/Terms";
import { VerifyEmail } from "./pages/VerifyEmail";

function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen">
        <AppHeader />
        <main>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route element={<RedirectIfAuthed />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            </Route>
            <Route path="/share/:sessionId" element={<ClinicalSummary />} />
            <Route element={<RequireAuth />}>
              <Route path="/clinical-summary/:sessionId" element={<ClinicalSummary />} />
              <Route path="/consent" element={<ConsentFlow />} />
              <Route element={<RequireConsent />}>
                <Route path="/disclaimer" element={<Disclaimer />} />
                <Route element={<RequireDisclaimer />}>
                  <Route path="/capture" element={<Capture />} />
                  <Route path="/cycle" element={<CycleTracker />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/result" element={<Result />} />
                  <Route path="/result/:sessionId" element={<Result />} />
                </Route>
              </Route>
            </Route>
            <Route element={<RequireVerification />}>
              <Route path="/verify-email" element={<VerifyEmail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;