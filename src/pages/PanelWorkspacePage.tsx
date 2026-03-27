import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel } from "@/contexts/PanelContext";
import { getDatabase } from "@/db/database";
import { useTrackedUpdate } from "@/hooks/useTrackedUpdate";
import { PlcHardwarePage } from "./PlcHardwarePage";
import { IoListPage } from "./IoListPage";
import { CablesPage } from "./CablesPage";
import { RevisionsPage } from "./RevisionsPage";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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

type ReplaceFieldKey =
  | "signals.tag_name"
  | "signals.description"
  | "cables.cable_tag"
  | "cables.from_location"
  | "cables.to_location"
  | "cables.from_device"
  | "cables.to_device"
  | "cables.notes";

interface ReplaceFieldConfig {
  key: ReplaceFieldKey;
  table: "signals" | "cables";
  column: string;
  group: "IO List" | "Cable Schedule";
  label: string;
}

interface ReplaceUpdate {
  id: number;
  fields: Record<string, string | null>;
}

interface ReplacePlan {
  totalChanges: number;
  signalRows: number;
  cableRows: number;
  fieldCounts: Record<ReplaceFieldKey, number>;
  signalUpdates: ReplaceUpdate[];
  cableUpdates: ReplaceUpdate[];
}

const REPLACE_FIELDS: ReplaceFieldConfig[] = [
  { key: "signals.tag_name", table: "signals", column: "tag_name", group: "IO List", label: "Tag Name" },
  { key: "signals.description", table: "signals", column: "description", group: "IO List", label: "Description" },
  { key: "cables.cable_tag", table: "cables", column: "cable_tag", group: "Cable Schedule", label: "Cable Tag" },
  { key: "cables.from_location", table: "cables", column: "from_location", group: "Cable Schedule", label: "From Location" },
  { key: "cables.to_location", table: "cables", column: "to_location", group: "Cable Schedule", label: "To Location" },
  { key: "cables.from_device", table: "cables", column: "from_device", group: "Cable Schedule", label: "From Device" },
  { key: "cables.to_device", table: "cables", column: "to_device", group: "Cable Schedule", label: "To Device" },
  { key: "cables.notes", table: "cables", column: "notes", group: "Cable Schedule", label: "Notes" },
];

const DEFAULT_FIELD_SELECTION: Record<ReplaceFieldKey, boolean> = {
  "signals.tag_name": true,
  "signals.description": true,
  "cables.cable_tag": true,
  "cables.from_location": true,
  "cables.to_location": true,
  "cables.from_device": true,
  "cables.to_device": true,
  "cables.notes": true,
};

const EMPTY_REPLACE_PLAN: ReplacePlan = {
  totalChanges: 0,
  signalRows: 0,
  cableRows: 0,
  fieldCounts: {
    "signals.tag_name": 0,
    "signals.description": 0,
    "cables.cable_tag": 0,
    "cables.from_location": 0,
    "cables.to_location": 0,
    "cables.from_device": 0,
    "cables.to_device": 0,
    "cables.notes": 0,
  },
  signalUpdates: [],
  cableUpdates: [],
};

function normalizeReplaceValue(value: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function replaceTextValue(value: string | null, findText: string, replacementText: string) {
  if (value == null || !findText) return normalizeReplaceValue(value);
  return normalizeReplaceValue(value.split(findText).join(replacementText));
}

async function buildReplacePlan(
  projectId: number,
  panelId: number,
  fieldSelection: Record<ReplaceFieldKey, boolean>,
  findText: string,
  replacementText: string
): Promise<ReplacePlan> {
  const trimmedFind = findText.trim();
  if (!trimmedFind) return EMPTY_REPLACE_PLAN;

  const db = await getDatabase();
  const plan: ReplacePlan = {
    totalChanges: 0,
    signalRows: 0,
    cableRows: 0,
    fieldCounts: { ...EMPTY_REPLACE_PLAN.fieldCounts },
    signalUpdates: [],
    cableUpdates: [],
  };

  const enabledFields = REPLACE_FIELDS.filter((field) => fieldSelection[field.key]);

  for (const table of ["signals", "cables"] as const) {
    const tableFields = enabledFields.filter((field) => field.table === table);
    if (tableFields.length === 0) continue;

    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT id, ${tableFields.map((field) => field.column).join(", ")}
       FROM ${table}
       WHERE project_id = $1 AND panel_id = $2`,
      [projectId, panelId]
    );

    for (const row of rows) {
      const updates: Record<string, string | null> = {};

      for (const field of tableFields) {
        const currentValue = row[field.column] != null ? String(row[field.column]) : null;
        const normalizedCurrent = normalizeReplaceValue(currentValue);
        const replacedValue = replaceTextValue(currentValue, trimmedFind, replacementText);

        if (replacedValue !== normalizedCurrent) {
          updates[field.column] = replacedValue;
          plan.fieldCounts[field.key] += 1;
        }
      }

      if (Object.keys(updates).length > 0) {
        const update = { id: Number(row.id), fields: updates };
        if (table === "signals") {
          plan.signalUpdates.push(update);
        } else {
          plan.cableUpdates.push(update);
        }
      }
    }
  }

  plan.signalRows = plan.signalUpdates.length;
  plan.cableRows = plan.cableUpdates.length;
  plan.totalChanges = Object.values(plan.fieldCounts).reduce((sum, count) => sum + count, 0);
  return plan;
}

// ── Page ───────────────────────────────────────────────────────────────

export function PanelWorkspacePage() {
  const { panelId } = useParams<{ panelId: string }>();
  const navigate = useNavigate();
  const { selectedProject, readOnly } = useProject();
  const { panels, selectPanel } = usePanel();
  const { trackedUpdateFields } = useTrackedUpdate(selectedProject?.id);
  const [activeTab, setActiveTab] = useState<TabId>("io-list");
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replacementText, setReplacementText] = useState("");
  const [fieldSelection, setFieldSelection] = useState<Record<ReplaceFieldKey, boolean>>(DEFAULT_FIELD_SELECTION);
  const [replacePlan, setReplacePlan] = useState<ReplacePlan>(EMPTY_REPLACE_PLAN);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applyingReplace, setApplyingReplace] = useState(false);

  const panel = panels.find((p) => p.id === Number(panelId));

  const loadReplacePreview = useCallback(async () => {
    if (!replaceOpen || !selectedProject || !panel) {
      setReplacePlan(EMPTY_REPLACE_PLAN);
      return;
    }

    setLoadingPreview(true);
    try {
      const plan = await buildReplacePlan(
        selectedProject.id,
        panel.id,
        fieldSelection,
        findText,
        replacementText
      );
      setReplacePlan(plan);
    } finally {
      setLoadingPreview(false);
    }
  }, [replaceOpen, selectedProject, panel, fieldSelection, findText, replacementText]);

  // Select panel in context when workspace loads; clear on unmount
  useEffect(() => {
    const id = Number(panelId);
    if (id) selectPanel(id);
    return () => selectPanel(null);
  }, [panelId, selectPanel]);

  useEffect(() => {
    void loadReplacePreview();
  }, [loadReplacePreview]);

  const toggleReplaceField = (key: ReplaceFieldKey, checked: boolean) => {
    setFieldSelection((prev) => ({ ...prev, [key]: checked }));
  };

  const handleApplyReplace = async () => {
    if (!selectedProject || !panel || readOnly) return;

    setApplyingReplace(true);
    try {
      const plan = await buildReplacePlan(
        selectedProject.id,
        panel.id,
        fieldSelection,
        findText,
        replacementText
      );

      if (plan.totalChanges === 0) {
        setReplacePlan(plan);
        return;
      }

      for (const update of plan.signalUpdates) {
        await trackedUpdateFields("signal", update.id, "signals", update.fields);
      }

      for (const update of plan.cableUpdates) {
        await trackedUpdateFields("cable", update.id, "cables", update.fields);
      }

      setReplacePlan(plan);
      setWorkspaceVersion((version) => version + 1);
      setReplaceOpen(false);
    } finally {
      setApplyingReplace(false);
    }
  };

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

        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setReplaceOpen(true)}
            disabled={readOnly}
          >
            Find & Replace
          </Button>
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
        {activeTab === "plc-hardware" && <PlcHardwarePage key={`plc-hardware-${workspaceVersion}`} />}
        {activeTab === "io-list" && <IoListPage key={`io-list-${workspaceVersion}`} />}
        {activeTab === "cables" && <CablesPage key={`cables-${workspaceVersion}`} />}
        {activeTab === "panel-drawing" && (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed">
            <PanelTop className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Panel Drawing</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Panel drawing editor will be available in a future update.
            </p>
          </div>
        )}
        {activeTab === "revisions" && <RevisionsPage key={`revisions-${workspaceVersion}`} />}
      </div>

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Find & Replace in Panel</DialogTitle>
            <DialogDescription>
              Replaces matching text only inside <span className="font-medium text-foreground">{panel.panel_name}</span>.
              Other panels are not touched.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div>
                <Label htmlFor="panel-find-text" className="text-xs">Find Text</Label>
                <Input
                  id="panel-find-text"
                  className="mt-1 h-8 text-sm"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="e.g. MCC-01"
                  disabled={applyingReplace}
                />
              </div>

              <div>
                <Label htmlFor="panel-replace-text" className="text-xs">Replace With</Label>
                <Input
                  id="panel-replace-text"
                  className="mt-1 h-8 text-sm"
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                  placeholder="e.g. MCC-02"
                  disabled={applyingReplace}
                />
              </div>

              <div className="rounded-md border p-3">
                <p className="text-xs font-medium text-foreground">Scope</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Case-sensitive text replacement in the selected panel only.
                </p>
                <div className="mt-3 space-y-3">
                  {(["IO List", "Cable Schedule"] as const).map((group) => (
                    <div key={group}>
                      <p className="text-xs font-medium text-muted-foreground">{group}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {REPLACE_FIELDS.filter((field) => field.group === group).map((field) => (
                          <label key={field.key} className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs">
                            <Checkbox
                              checked={fieldSelection[field.key]}
                              onCheckedChange={(checked) => toggleReplaceField(field.key, checked === true)}
                              disabled={applyingReplace}
                            />
                            <span>{field.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs font-medium text-foreground">Preview</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Matching updates are calculated before anything is written.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded border bg-muted/40 px-2 py-2">
                  <div className="text-[11px] text-muted-foreground">Signal Rows</div>
                  <div className="text-sm font-medium">{replacePlan.signalRows}</div>
                </div>
                <div className="rounded border bg-muted/40 px-2 py-2">
                  <div className="text-[11px] text-muted-foreground">Cable Rows</div>
                  <div className="text-sm font-medium">{replacePlan.cableRows}</div>
                </div>
                <div className="col-span-2 rounded border bg-muted/40 px-2 py-2">
                  <div className="text-[11px] text-muted-foreground">Changed Cells</div>
                  <div className="text-sm font-medium">{replacePlan.totalChanges}</div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {REPLACE_FIELDS.filter((field) => fieldSelection[field.key]).map((field) => (
                  <div key={field.key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {field.group} · {field.label}
                    </span>
                    <span className="font-medium">{replacePlan.fieldCounts[field.key]}</span>
                  </div>
                ))}
              </div>

              {loadingPreview && (
                <p className="mt-3 text-xs text-muted-foreground">Refreshing scope preview…</p>
              )}
              {!loadingPreview && findText.trim() && replacePlan.totalChanges === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  No matching panel-scoped values will change with the current settings.
                </p>
              )}
              {!findText.trim() && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Enter text to preview how many panel records will be updated.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={applyingReplace}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleApplyReplace}
              disabled={readOnly || applyingReplace || !findText.trim() || replacePlan.totalChanges === 0}
            >
              {applyingReplace ? "Replacing..." : `Replace ${replacePlan.totalChanges} Value${replacePlan.totalChanges !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
