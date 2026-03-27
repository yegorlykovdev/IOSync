import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { getDatabase } from "@/db/database";
import { useProject } from "@/contexts/ProjectContext";

export interface Panel {
  id: number;
  project_id: number;
  panel_name: string;
  panel_description: string | null;
  location: string | null;
  width_mm: number | null;
  height_mm: number | null;
  created_at: string;
  updated_at: string;
  signal_count: number;
  cable_count: number;
}

export interface CreatePanelData {
  panel_name: string;
  panel_description?: string;
  location?: string;
}

interface PanelContextValue {
  panels: Panel[];
  selectedPanel: Panel | null;
  selectPanel: (id: number | null) => void;
  refreshPanels: () => Promise<void>;
  createPanel: (data: CreatePanelData) => Promise<void>;
  updatePanel: (id: number, data: Partial<CreatePanelData>) => Promise<void>;
  deletePanel: (id: number) => Promise<void>;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const { selectedProject } = useProject();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refreshPanels = useCallback(async () => {
    if (!selectedProject) {
      setPanels([]);
      return;
    }
    const db = await getDatabase();
    const rows = await db.select<Panel[]>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM signals s WHERE s.panel_id = p.id) as signal_count,
        (SELECT COUNT(*) FROM cables c WHERE c.panel_id = p.id) as cable_count
       FROM panels p
       WHERE p.project_id = $1
       ORDER BY p.panel_name`,
      [selectedProject.id]
    );
    setPanels(rows);
  }, [selectedProject]);

  const createPanel = useCallback(
    async (data: CreatePanelData) => {
      if (!selectedProject) return;
      const db = await getDatabase();
      await db.execute(
        `INSERT INTO panels (project_id, panel_name, panel_description, location)
         VALUES ($1, $2, $3, $4)`,
        [
          selectedProject.id,
          data.panel_name,
          data.panel_description ?? null,
          data.location ?? null,
        ]
      );
      await refreshPanels();
    },
    [selectedProject, refreshPanels]
  );

  const updatePanel = useCallback(
    async (id: number, data: Partial<CreatePanelData>) => {
      const db = await getDatabase();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (data.panel_name !== undefined) { fields.push(`panel_name=$${idx++}`); values.push(data.panel_name); }
      if (data.panel_description !== undefined) { fields.push(`panel_description=$${idx++}`); values.push(data.panel_description || null); }
      if (data.location !== undefined) { fields.push(`location=$${idx++}`); values.push(data.location || null); }

      if (fields.length === 0) return;

      fields.push(`updated_at=datetime('now')`);
      values.push(id);

      await db.execute(
        `UPDATE panels SET ${fields.join(", ")} WHERE id=$${idx}`,
        values
      );
      await refreshPanels();
    },
    [refreshPanels]
  );

  const deletePanel = useCallback(
    async (id: number) => {
      const db = await getDatabase();
      // Unlink signals and cables before deleting
      await db.execute(`UPDATE signals SET panel_id = NULL WHERE panel_id = $1`, [id]);
      await db.execute(`UPDATE cables SET panel_id = NULL WHERE panel_id = $1`, [id]);
      await db.execute(`DELETE FROM panels WHERE id = $1`, [id]);
      if (selectedId === id) setSelectedId(null);
      await refreshPanels();
    },
    [selectedId, refreshPanels]
  );

  const selectPanel = useCallback((id: number | null) => {
    setSelectedId(id);
  }, []);

  // Refresh panels when project changes; clear selection
  useEffect(() => {
    setSelectedId(null);
    refreshPanels();
  }, [selectedProject?.id, refreshPanels]);

  const selectedPanel = panels.find((p) => p.id === selectedId) ?? null;

  return (
    <PanelContext.Provider
      value={{
        panels,
        selectedPanel,
        selectPanel,
        refreshPanels,
        createPanel,
        updatePanel,
        deletePanel,
      }}
    >
      {children}
    </PanelContext.Provider>
  );
}

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used within PanelProvider");
  return ctx;
}
