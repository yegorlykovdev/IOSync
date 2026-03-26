import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";

interface LockInfo {
  locked: boolean;
  username: string | null;
  timestamp: string | null;
}

interface FileLockState {
  readOnly: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  dbPath: string | null;
}

export function useFileLock() {
  const [state, setState] = useState<FileLockState>({
    readOnly: false,
    lockedBy: null,
    lockedAt: null,
    dbPath: null,
  });
  const dbPathRef = useRef<string | null>(null);

  const acquireLock = useCallback(async () => {
    try {
      const dataDir = await appDataDir();
      const dbPath = `${dataDir}iosync.db`;
      const result = await invoke<LockInfo>("acquire_lock", { dbPath });
      dbPathRef.current = dbPath;

      setState({
        readOnly: result.locked,
        lockedBy: result.username,
        lockedAt: result.timestamp,
        dbPath,
      });

      return result.locked;
    } catch (err) {
      console.error("Failed to acquire lock:", err);
      return false;
    }
  }, []);

  const releaseLock = useCallback(async () => {
    const dbPath = dbPathRef.current;
    if (!dbPath) return;
    try {
      await invoke("release_lock", { dbPath });
      dbPathRef.current = null;
    } catch (err) {
      console.error("Failed to release lock:", err);
    }
  }, []);

  // Acquire lock on mount, release on unmount
  useEffect(() => {
    acquireLock();

    const handleBeforeUnload = () => {
      const dbPath = dbPathRef.current;
      if (dbPath) {
        invoke("release_lock", { dbPath }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      releaseLock();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
