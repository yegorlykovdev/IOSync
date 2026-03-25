import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/hooks/useTheme";
import { PLC_PLATFORM_LABELS } from "@/lib/plc-address";

export function TopBar() {
  const { selectedProject } = useProject();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        {selectedProject ? (
          <>
            <span className="text-foreground">{selectedProject.name}</span>
            <span className="text-xs">({selectedProject.project_number})</span>
            <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {PLC_PLATFORM_LABELS[selectedProject.plc_platform]}
            </span>
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
