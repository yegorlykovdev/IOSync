import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getDatabase } from "./db/database";
import { ProjectProvider } from "./contexts/ProjectContext";
import { UserProvider } from "./contexts/UserContext";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppLayout } from "./components/layout/AppLayout";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PlcHardwarePage } from "./pages/PlcHardwarePage";
import { IoListPage } from "./pages/IoListPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RevisionsPage } from "./pages/RevisionsPage";
import { useFileLock } from "./hooks/useFileLock";
import "./App.css";

function AppRoutes() {
  const fileLock = useFileLock();

  return (
    <BrowserRouter>
      <TooltipProvider>
        <ProjectProvider readOnly={fileLock.readOnly}>
          <Routes>
            <Route
              element={
                <AppLayout
                  readOnly={fileLock.readOnly}
                  lockedBy={fileLock.lockedBy}
                />
              }
            >
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/plc-hardware" element={<PlcHardwarePage />} />
              <Route path="/io-list" element={<IoListPage />} />
              <Route
                path="/cables"
                element={<PlaceholderPage title="Cables" />}
              />
              <Route
                path="/panels"
                element={<PlaceholderPage title="Panels" />}
              />
              <Route path="/revisions" element={<RevisionsPage />} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Route>
          </Routes>
        </ProjectProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    getDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("Database initialization failed:", err);
        setDbError(String(err));
      });
  }, []);

  if (dbError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-destructive">Database Error</h1>
        <p className="mt-2 text-muted-foreground">{dbError}</p>
      </main>
    );
  }

  if (!dbReady) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-muted-foreground">Initializing database...</p>
      </main>
    );
  }

  return (
    <UserProvider>
      <AppRoutes />
    </UserProvider>
  );
}

export default App;
