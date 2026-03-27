import { NavLink } from "react-router-dom";
import {
  FolderOpen,
  PanelTop,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/panels", label: "Panels", icon: PanelTop },
  { to: "/revisions", label: "Revisions", icon: History },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar-background">
      <div className="flex h-14 items-center px-4">
        <span className="text-lg font-semibold text-sidebar-foreground">
          IOSync
        </span>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
