import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./brand.css";
import { PreferencesProvider } from "./preferences";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/app/*" element={<App />} />
          <Route
            path="*"
            element={
              <main className="loading-screen">
                <h1>Page not found</h1>
                <a href="/app">Open dashboard</a>
              </main>
            }
          />
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  </StrictMode>,
);
