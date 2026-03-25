import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { getDatabase } from "@/db/database";
import type { PlcPlatform } from "@/lib/plc-address";

export interface Project {
  id: number;
  name: string;
  project_number: string;
  client: string | null;
  description: string | null;
  plc_platform: PlcPlatform;
  custom_address_prefix: string | null;
  custom_address_pattern: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  name: string;
  project_number: string;
  client?: string;
  description?: string;
  plc_platform?: PlcPlatform;
  custom_address_prefix?: string;
  custom_address_pattern?: string;
}

interface ProjectContextValue {
  projects: Project[];
  selectedProject: Project | null;
  selectProject: (id: number | null) => void;
  refreshProjects: () => Promise<void>;
  createProject: (data: CreateProjectData) => Promise<void>;
  updateProject: (id: number, data: Partial<CreateProjectData>) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refreshProjects = useCallback(async () => {
    const db = await getDatabase();
    const rows = await db.select<Project[]>(
      "SELECT * FROM projects ORDER BY updated_at DESC"
    );
    setProjects(rows);
  }, []);

  const createProject = useCallback(
    async (data: CreateProjectData) => {
      const db = await getDatabase();
      await db.execute(
        `INSERT INTO projects (name, project_number, client, description, plc_platform, custom_address_prefix, custom_address_pattern)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.name,
          data.project_number,
          data.client ?? null,
          data.description ?? null,
          data.plc_platform ?? "siemens",
          data.custom_address_prefix ?? null,
          data.custom_address_pattern ?? null,
        ]
      );
      await refreshProjects();
    },
    [refreshProjects]
  );

  const updateProject = useCallback(
    async (id: number, data: Partial<CreateProjectData>) => {
      const db = await getDatabase();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (data.name !== undefined) { fields.push(`name=$${idx++}`); values.push(data.name); }
      if (data.project_number !== undefined) { fields.push(`project_number=$${idx++}`); values.push(data.project_number); }
      if (data.client !== undefined) { fields.push(`client=$${idx++}`); values.push(data.client || null); }
      if (data.description !== undefined) { fields.push(`description=$${idx++}`); values.push(data.description || null); }
      if (data.plc_platform !== undefined) { fields.push(`plc_platform=$${idx++}`); values.push(data.plc_platform); }
      if (data.custom_address_prefix !== undefined) { fields.push(`custom_address_prefix=$${idx++}`); values.push(data.custom_address_prefix || null); }
      if (data.custom_address_pattern !== undefined) { fields.push(`custom_address_pattern=$${idx++}`); values.push(data.custom_address_pattern || null); }

      if (fields.length === 0) return;

      fields.push(`updated_at=datetime('now')`);
      values.push(id);

      await db.execute(
        `UPDATE projects SET ${fields.join(", ")} WHERE id=$${idx}`,
        values
      );
      await refreshProjects();
    },
    [refreshProjects]
  );

  const selectProject = useCallback((id: number | null) => {
    setSelectedId(id);
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        selectedProject,
        selectProject,
        refreshProjects,
        createProject,
        updateProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
