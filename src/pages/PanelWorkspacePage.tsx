import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel } from "@/contexts/PanelContext";
import { PlcHardwarePage } from "./PlcHardwarePage";
import { IoListPage } from "./IoListPage";
import { CablesPage } from "./CablesPage";
import { RevisionsPage } from "./RevisionsPage";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Cpu, List, Cable as CableIcon, PanelTop, History } from "lucide-react";

// ── Tabs ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "plc-hardware", label: "PLC Hardware", icon: Cpu },
  { id: "io-list", label: "IO List", icon: List },
  { id: "cables", label: "Cable Schedule", icon: CableIcon },
  { id: "panel-drawing", label: "Panel Drawing", icon: PanelTop },
  { id: "revisions", label: "Revisions", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Page ───────────────────────────────────────────────────────────────

export function PanelWorkspacePage() {
  const { panelId } = useParams<{ panelId: string }>();
  const navigate = useNavigate();
  const { selectedProject } = useProject();
  const { panels, selectPanel } = usePanel();
  const [activeTab, setActiveTab] = useState<TabId>("io-list");

  const panel = panels.find((p) => p.id === Number(panelId));

  // Select panel in context when workspace loads; clear on unmount
  useEffect(() => {
    const id = Number(panelId);
    if (id) selectPanel(id);
    return () => selectPanel(null);
  }, [panelId, selectPanel]);

  if (!selectedProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">Select a project</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Go to Projects and select one to continue.
        </p>
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">Panel not found</p>
        <Button
          variant="link"
          className="mt-2"
          onClick={() => navigate("/panels")}
        >
          Back to Panels
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => navigate("/panels")}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Panels
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{panel.panel_name}</h1>
            {panel.signal_count > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {panel.signal_count} signal{panel.signal_count !== 1 && "s"}
              </Badge>
            )}
            {panel.cable_count > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {panel.cable_count} cable{panel.cable_count !== 1 && "s"}
              </Badge>
            )}
          </div>
          {(panel.panel_description || panel.location) && (
            <p className="text-xs text-muted-foreground">
              {[panel.panel_description, panel.location]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 pt-3">
        {activeTab === "plc-hardware" && <PlcHardwarePage />}
        {activeTab === "io-list" && <IoListPage />}
        {activeTab === "cables" && <CablesPage />}
        {activeTab === "panel-drawing" && (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed">
            <PanelTop className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Panel Drawing</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Panel drawing editor will be available in a future update.
            </p>
          </div>
        )}
        {activeTab === "revisions" && <RevisionsPage />}
      </div>
    </div>
  );
}
