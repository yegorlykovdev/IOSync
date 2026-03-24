import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getDatabase } from "./db/database";
import "./App.css";

function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">IOSync</h1>
      <p className="mt-4 text-muted-foreground">
        Welcome to IOSync
      </p>
    </main>
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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
