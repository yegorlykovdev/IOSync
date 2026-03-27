import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getDatabase } from "./db/database";
import { ProjectProvider } from "./contexts/ProjectContext";
import { PanelProvider } from "./contexts/PanelContext";
import { UserProvider } from "./contexts/UserContext";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppLayout } from "./components/layout/AppLayout";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PanelsPage } from "./pages/PanelsPage";
import { PanelWorkspacePage } from "./pages/PanelWorkspacePage";
import { RevisionsPage } from "./pages/RevisionsPage";
import { useFileLock } from "./hooks/useFileLock";
import "./App.css";

function AppRoutes() {
  const fileLock = useFileLock();

  return (
    <BrowserRouter>
      <TooltipProvider>
        <ProjectProvider readOnly={fileLock.readOnly}>
          <PanelProvider>
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
                <Route path="/panels" element={<PanelsPage />} />
                <Route path="/panels/:panelId" element={<PanelWorkspacePage />} />
                <Route path="/revisions" element={<RevisionsPage />} />
                <Route path="*" element={<Navigate to="/projects" replace />} />
              </Route>
            </Routes>
          </PanelProvider>
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
