import { Navigate, Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import {
  RedirectIfAuthed,
  RequireAuth,
  RequireDisclaimer,
} from "./components/RouteGuards";
import { Capture } from "./pages/Capture";
import { Disclaimer } from "./pages/Disclaimer";
import { History } from "./pages/History";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Result } from "./pages/Result";
import { Review } from "./pages/Review";
import { Signup } from "./pages/Signup";

function App() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<RedirectIfAuthed />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/disclaimer" element={<Disclaimer />} />
            <Route element={<RequireDisclaimer />}>
              <Route path="/capture" element={<Capture />} />
              <Route path="/review" element={<Review />} />
              <Route path="/history" element={<History />} />
              <Route path="/result" element={<Result />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
