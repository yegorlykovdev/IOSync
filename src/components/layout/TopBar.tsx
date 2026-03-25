import { Moon, Sun, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useProject } from "@/contexts/ProjectContext";
import { useUser } from "@/contexts/UserContext";
import { useTheme } from "@/hooks/useTheme";
import { PLC_PLATFORM_LABELS } from "@/lib/plc-address";

interface TopBarProps {
  readOnly?: boolean;
  lockedBy?: string | null;
}

export function TopBar({ readOnly, lockedBy }: TopBarProps) {
  const { selectedProject } = useProject();
  const { username } = useUser();
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
        {readOnly && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              <Lock className="h-3 w-3" />
              Read-only
              {lockedBy && ` (locked by ${lockedBy})`}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          {username}
        </span>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
