import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { DraftProvider } from "./context/DraftContext";
import { SessionCacheProvider } from "./context/SessionCacheContext";
import "./index.css";

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
