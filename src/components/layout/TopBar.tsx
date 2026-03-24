import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/hooks/useTheme";

export function TopBar() {
  const { selectedProject } = useProject();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="text-sm font-medium text-muted-foreground">
        {selectedProject ? (
          <>
            <span className="text-foreground">{selectedProject.name}</span>
            <span className="ml-2 text-xs">({selectedProject.project_number})</span>
          </>
        ) : (
          "No project selected"
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
    </header>
  );
}
