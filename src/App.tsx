import { BrowserRouter, Routes, Route } from "react-router-dom";
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
