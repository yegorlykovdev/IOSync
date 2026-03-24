import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { getDatabase } from "@/db/database";

export interface Project {
  id: number;
  name: string;
  project_number: string;
  client: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectContextValue {
  projects: Project[];
  selectedProject: Project | null;
  selectProject: (id: number | null) => void;
  refreshProjects: () => Promise<void>;
  createProject: (data: {
    name: string;
    project_number: string;
    client?: string;
    description?: string;
  }) => Promise<void>;
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
    async (data: {
      name: string;
      project_number: string;
      client?: string;
      description?: string;
    }) => {
      const db = await getDatabase();
      await db.execute(
        `INSERT INTO projects (name, project_number, client, description)
         VALUES ($1, $2, $3, $4)`,
        [data.name, data.project_number, data.client ?? null, data.description ?? null]
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
