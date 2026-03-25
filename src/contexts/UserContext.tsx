import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UserContextValue {
  username: string;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState("unknown");

  useEffect(() => {
    invoke<string>("get_username").then(setUsername).catch(console.error);
  }, []);

  return (
    <UserContext.Provider value={{ username }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
