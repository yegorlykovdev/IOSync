import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { getDatabase } from "@/db/database";
import { useTrackedUpdate } from "@/hooks/useTrackedUpdate";
import { useUser } from "@/contexts/UserContext";
import { handleCellKeyDown, useGridClipboard } from "@/hooks/useGridNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Cable as CableIcon,
  Zap,
} from "lucide-react";
import { generateCableSchedule, type GenerationResult } from "@/lib/generate-cables";

// ── Types ──────────────────────────────────────────────────────────────

interface Cable {
  id: number;
  project_id: number;
  cable_tag: string;
  cable_type: string | null;
  core_count: number | null;
  from_location: string | null;
  to_location: string | null;
  from_device: string | null;
  to_device: string | null;
  length_m: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  signal_count: number;
}

interface CableCore {
  id: number;
  cable_id: number;
  core_number: number;
  core_color: string | null;
  signal_id: number | null;
  from_terminal: string | null;
  to_terminal: string | null;
  notes: string | null;
  signal_tag: string | null;
}

interface FormState {
  cable_tag: string;
  cable_type: string;
  core_count: string;
  from_location: string;
  to_location: string;
  from_device: string;
  to_device: string;
  length_m: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  cable_tag: "",
  cable_type: "",
  core_count: "",
  from_location: "",
  to_location: "",
  from_device: "",
  to_device: "",
  length_m: "",
  notes: "",
};

const CABLE_TYPES = [
  "Power",
  "Control",
  "Instrumentation",
  "Communication",
  "Fiber Optic",
  "Thermocouple",
  "RTD",
  "Shielded",
  "Unshielded",
];

const CORE_COLORS = [
  "Brown", "Red", "Orange", "Yellow", "Green", "Blue", "Violet", "Grey", "White", "Black",
  "Brown/White", "Red/White", "Blue/White", "Green/White", "Shield",
];

// ── Signal for linking ─────────────────────────────────────────────────

interface SignalOption {
  id: number;
  tag_name: string | null;
  io_type: string;
  item_number: number | null;
}

// ── Page ───────────────────────────────────────────────────────────────

export function CablesPage() {
  const { selectedProject, readOnly } = useProject();
  const { username } = useUser();
  const { trackedCreate, trackedDelete, trackedUpdateFields } = useTrackedUpdate(selectedProject?.id);
  const [cables, setCables] = useState<Cable[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [cores, setCores] = useState<CableCore[]>([]);
  const [signals, setSignals] = useState<SignalOption[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const coreTableRef = useRef<HTMLTableElement>(null);
  useGridClipboard(coreTableRef, readOnly);
  const [generating, setGenerating] = useState(false);
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerationResult | null>(null);

  // ── Load data ──────────────────────────────────────────────────────

  const loadCables = useCallback(async () => {
    if (!selectedProject) return;
    const db = await getDatabase();
    const rows = await db.select<Cable[]>(
      `SELECT c.*,
        (SELECT COUNT(*) FROM cable_cores cc JOIN signals s ON cc.signal_id = s.id WHERE cc.cable_id = c.id) as signal_count
       FROM cables c
       WHERE c.project_id = $1
       ORDER BY c.cable_tag`,
      [selectedProject.id]
    );
    setCables(rows);
  }, [selectedProject]);

  const loadSignals = useCallback(async () => {
    if (!selectedProject) return;
    const db = await getDatabase();
    const rows = await db.select<SignalOption[]>(
      `SELECT id, tag_name, io_type, item_number FROM signals WHERE project_id = $1 ORDER BY item_number`,
      [selectedProject.id]
    );
    setSignals(rows);
  }, [selectedProject]);

  useEffect(() => {
    loadCables();
    loadSignals();
  }, [loadCables, loadSignals]);

  // ── Load cores for expanded cable ──────────────────────────────────

  const loadCores = useCallback(async (cableId: number) => {
    const db = await getDatabase();
    const rows = await db.select<CableCore[]>(
      `SELECT cc.*, s.tag_name as signal_tag
       FROM cable_cores cc
       LEFT JOIN signals s ON cc.signal_id = s.id
       WHERE cc.cable_id = $1
       ORDER BY cc.core_number`,
      [cableId]
    );
    setCores(rows);
  }, []);

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setCores([]);
    } else {
      setExpandedId(id);
      loadCores(id);
    }
  };

  // ── Cable CRUD ─────────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (cable: Cable) => {
    setEditingId(cable.id);
    setForm({
      cable_tag: cable.cable_tag,
      cable_type: cable.cable_type ?? "",
      core_count: cable.core_count != null ? String(cable.core_count) : "",
      from_location: cable.from_location ?? "",
      to_location: cable.to_location ?? "",
      from_device: cable.from_device ?? "",
      to_device: cable.to_device ?? "",
      length_m: cable.length_m != null ? String(cable.length_m) : "",
      notes: cable.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedProject || !form.cable_tag.trim()) return;
    const db = await getDatabase();

    const coreCount = form.core_count ? parseInt(form.core_count) : null;
    const lengthM = form.length_m ? parseFloat(form.length_m) : null;

    const fieldValues: Record<string, string | number | null> = {
      cable_tag: form.cable_tag.trim(),
      cable_type: form.cable_type || null,
      core_count: coreCount,
      from_location: form.from_location.trim() || null,
      to_location: form.to_location.trim() || null,
      from_device: form.from_device.trim() || null,
      to_device: form.to_device.trim() || null,
      length_m: lengthM,
      notes: form.notes.trim() || null,
    };

    if (editingId) {
      await trackedUpdateFields("cable", editingId, "cables", fieldValues);

      // Sync core count: add/remove cores if core_count changed
      const cable = cables.find((c) => c.id === editingId);
      if (cable && coreCount != null && coreCount !== cable.core_count) {
        await syncCores(editingId, coreCount);
      }
    } else {
      const result = await db.execute(
        `INSERT INTO cables (project_id, cable_tag, cable_type, core_count, from_location, to_location,
           from_device, to_device, length_m, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          selectedProject.id,
          fieldValues.cable_tag,
          fieldValues.cable_type,
          fieldValues.core_count,
          fieldValues.from_location,
          fieldValues.to_location,
          fieldValues.from_device,
          fieldValues.to_device,
          fieldValues.length_m,
          fieldValues.notes,
        ]
      );
      const newId = result.lastInsertId;
      if (newId) {
        await trackedCreate("cable", newId, fieldValues);
        // Auto-create cores
        if (coreCount && coreCount > 0) {
          await syncCores(newId, coreCount);
        }
      }
    }

    setDialogOpen(false);
    await loadCables();
    if (expandedId) await loadCores(expandedId);
  };

  const syncCores = async (cableId: number, targetCount: number) => {
    const db = await getDatabase();
    const existing = await db.select<{ id: number; core_number: number }[]>(
      `SELECT id, core_number FROM cable_cores WHERE cable_id = $1`,
      [cableId]
    );

    // Add missing cores
    for (let i = 1; i <= targetCount; i++) {
      if (!existing.find((e) => e.core_number === i)) {
        await db.execute(
          `INSERT INTO cable_cores (cable_id, core_number) VALUES ($1, $2)`,
          [cableId, i]
        );
      }
    }

    // Remove excess cores (only ones with no signal attached)
    for (const e of existing) {
      if (e.core_number > targetCount) {
        await db.execute(
          `DELETE FROM cable_cores WHERE id = $1 AND signal_id IS NULL`,
          [e.id]
        );
      }
    }
  };

  const handleDelete = async (id: number) => {
    const db = await getDatabase();
    await trackedDelete("cable", id, "cables");
    await db.execute("DELETE FROM cables WHERE id = $1", [id]);
    setDeleteConfirmId(null);
    if (expandedId === id) {
      setExpandedId(null);
      setCores([]);
    }
    await loadCables();
  };

  // ── Core editing ───────────────────────────────────────────────────

  const updateCore = useCallback(
    async (coreId: number, field: string, value: string | number | null) => {
      const db = await getDatabase();
      await db.execute(
        `UPDATE cable_cores SET ${field} = $1 WHERE id = $2`,
        [value, coreId]
      );
      if (expandedId) await loadCores(expandedId);
    },
    [expandedId, loadCores]
  );

  // ── Generate cables from IO List ───────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!selectedProject || generating) return;
    setGenerating(true);
    setGenerateConfirmOpen(false);
    try {
      const result = await generateCableSchedule(selectedProject.id, username);
      setGenerateResult(result);
      await loadCables();
      await loadSignals();
    } catch (err) {
      console.error("Cable generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [selectedProject, generating, username, loadCables, loadSignals]);

  // ── Filters ────────────────────────────────────────────────────────

  const cableTypes = useMemo(() => {
    const types = new Set(cables.map((c) => c.cable_type).filter(Boolean));
    return [...types].sort() as string[];
  }, [cables]);

  const filtered = useMemo(() => {
    let result = cables;
    if (typeFilter !== "all") {
      result = result.filter((c) => c.cable_type === typeFilter);
    }
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.cable_tag.toLowerCase().includes(q) ||
          (c.from_location ?? "").toLowerCase().includes(q) ||
          (c.to_location ?? "").toLowerCase().includes(q) ||
          (c.from_device ?? "").toLowerCase().includes(q) ||
          (c.to_device ?? "").toLowerCase().includes(q) ||
          (c.notes ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [cables, typeFilter, searchFilter]);

  // ── Render ─────────────────────────────────────────────────────────

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

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Cables</h1>

        <Badge variant="secondary" className="text-xs">
          {cables.length} cable{cables.length !== 1 && "s"}
        </Badge>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="h-8 w-[180px] pl-8 text-xs"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>

        {cableTypes.length > 0 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {cableTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => setGenerateConfirmOpen(true)}
          disabled={readOnly || generating}
        >
          <Zap className="mr-1.5 h-3.5 w-3.5" />
          {generating ? "Generating..." : "Generate from IO List"}
        </Button>

        <Button size="sm" className="h-8 text-xs" onClick={openAddDialog} disabled={readOnly}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Cable
        </Button>
      </div>

      {/* Table */}
      {cables.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <CableIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No cables yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Add Cable" to create your first cable.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-8 px-2 py-2" />
                <TableHead className="px-3 py-2 text-xs">Cable Tag</TableHead>
                <TableHead className="px-3 py-2 text-xs">Type</TableHead>
                <TableHead className="w-[60px] px-3 py-2 text-xs">Cores</TableHead>
                <TableHead className="px-3 py-2 text-xs">From</TableHead>
                <TableHead className="px-3 py-2 text-xs">To</TableHead>
                <TableHead className="w-[70px] px-3 py-2 text-xs">Length</TableHead>
                <TableHead className="w-[70px] px-3 py-2 text-xs">Signals</TableHead>
                <TableHead className="px-3 py-2 text-xs">Notes</TableHead>
                <TableHead className="w-[80px] px-3 py-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cable) => (
                <>
                  <TableRow
                    key={cable.id}
                    className="cursor-pointer hover:bg-accent/30"
                    onClick={() => toggleExpand(cable.id)}
                  >
                    <TableCell className="px-2 py-1.5">
                      {expandedId === cable.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-sm font-medium">{cable.cable_tag}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">{cable.cable_type ?? "—"}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-center">{cable.core_count ?? "—"}</TableCell>
                    <TableCell className="px-3 py-1.5 text-xs">
                      <div>{cable.from_location ?? "—"}</div>
                      {cable.from_device && (
                        <div className="text-muted-foreground">{cable.from_device}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-xs">
                      <div>{cable.to_location ?? "—"}</div>
                      {cable.to_device && (
                        <div className="text-muted-foreground">{cable.to_device}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-center">
                      {cable.length_m != null ? `${cable.length_m}m` : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-center">
                      {cable.signal_count > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">{cable.signal_count}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-1.5 text-xs text-muted-foreground max-w-[200px] truncate">
                      {cable.notes ?? "—"}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="rounded p-1 hover:bg-accent disabled:opacity-30"
                          onClick={() => openEditDialog(cable)}
                          disabled={readOnly}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                          onClick={() => setDeleteConfirmId(cable.id)}
                          disabled={readOnly}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded core mapping */}
                  {expandedId === cable.id && (
                    <TableRow key={`${cable.id}-cores`}>
                      <TableCell colSpan={10} className="bg-muted/30 px-6 py-3">
                        {cores.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No cores. {cable.core_count ? "Click edit and save to generate cores." : "Set core count to generate cores."}
                          </p>
                        ) : (
                          <table ref={coreTableRef} className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="w-[60px] pb-1 text-left font-medium">Core</th>
                                <th className="w-[100px] pb-1 text-left font-medium">Color</th>
                                <th className="w-[180px] pb-1 text-left font-medium">Signal</th>
                                <th className="w-[120px] pb-1 text-left font-medium">From Terminal</th>
                                <th className="w-[120px] pb-1 text-left font-medium">To Terminal</th>
                                <th className="pb-1 text-left font-medium">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cores.map((core) => (
                                <tr key={core.id} className="border-t border-border/50">
                                  <td className="py-1 font-mono">{core.core_number}</td>
                                  <td className="py-1">
                                    <select
                                      className="h-6 w-full rounded border-0 bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring"
                                      value={core.core_color ?? ""}
                                      onChange={(e) => updateCore(core.id, "core_color", e.target.value || null)}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                    >
                                      <option value="">—</option>
                                      {CORE_COLORS.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1">
                                    <select
                                      className="h-6 w-full rounded border-0 bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring"
                                      value={core.signal_id != null ? String(core.signal_id) : ""}
                                      onChange={(e) => updateCore(core.id, "signal_id", e.target.value ? parseInt(e.target.value) : null)}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                    >
                                      <option value="">— No signal —</option>
                                      {signals.map((s) => (
                                        <option key={s.id} value={String(s.id)}>
                                          {s.tag_name || `${s.io_type} #${s.item_number ?? s.id}`}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1">
                                    <input
                                      className="h-6 w-full rounded border-0 bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                                      value={core.from_terminal ?? ""}
                                      onBlur={(e) => updateCore(core.id, "from_terminal", e.target.value.trim() || null)}
                                      onChange={(e) => {
                                        setCores((prev) =>
                                          prev.map((c) => c.id === core.id ? { ...c, from_terminal: e.target.value } : c)
                                        );
                                      }}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                    />
                                  </td>
                                  <td className="py-1">
                                    <input
                                      className="h-6 w-full rounded border-0 bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                                      value={core.to_terminal ?? ""}
                                      onBlur={(e) => updateCore(core.id, "to_terminal", e.target.value.trim() || null)}
                                      onChange={(e) => {
                                        setCores((prev) =>
                                          prev.map((c) => c.id === core.id ? { ...c, to_terminal: e.target.value } : c)
                                        );
                                      }}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                    />
                                  </td>
                                  <td className="py-1">
                                    <input
                                      className="h-6 w-full rounded border-0 bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                                      value={core.notes ?? ""}
                                      onBlur={(e) => updateCore(core.id, "notes", e.target.value.trim() || null)}
                                      onChange={(e) => {
                                        setCores((prev) =>
                                          prev.map((c) => c.id === core.id ? { ...c, notes: e.target.value } : c)
                                        );
                                      }}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Cable" : "Add Cable"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Cable Tag *</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.cable_tag}
                onChange={(e) => setForm((f) => ({ ...f, cable_tag: e.target.value }))}
                placeholder="e.g. CB-001"
              />
            </div>
            <div>
              <Label className="text-xs">Cable Type</Label>
              <Select
                value={form.cable_type || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, cable_type: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {CABLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Core Count</Label>
              <Input
                className="mt-1 h-8 text-sm"
                type="number"
                min="0"
                value={form.core_count}
                onChange={(e) => setForm((f) => ({ ...f, core_count: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">From Location</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.from_location}
                onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">To Location</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.to_location}
                onChange={(e) => setForm((f) => ({ ...f, to_location: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">From Device</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.from_device}
                onChange={(e) => setForm((f) => ({ ...f, from_device: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">To Device</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.to_device}
                onChange={(e) => setForm((f) => ({ ...f, to_device: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Length (m)</Label>
              <Input
                className="mt-1 h-8 text-sm"
                type="number"
                min="0"
                step="0.1"
                value={form.length_m}
                onChange={(e) => setForm((f) => ({ ...f, length_m: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!form.cable_tag.trim()}>
              {editingId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cable</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the cable and all its core mappings. This action cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Generate confirmation */}
      <Dialog open={generateConfirmOpen} onOpenChange={setGenerateConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Cables from IO List</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              This will create <strong>one 3-core cable per hardwired signal</strong>{" "}
              that has a tag name and is not a spare.
            </p>
            <p>
              Spare signals (no tag name, or "spare" in description) and
              SoftComm signals are skipped. Signals already assigned to a
              cable are also skipped, so this is safe to re-run.
            </p>
            <p>
              After generation you can rearrange and group cables as needed.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleGenerate}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generation result */}
      <Dialog
        open={generateResult !== null}
        onOpenChange={(open) => { if (!open) setGenerateResult(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generation Complete</DialogTitle>
          </DialogHeader>
          {generateResult && (
            <div className="space-y-1 text-sm">
              <p><strong>{generateResult.cablesCreated}</strong> cable{generateResult.cablesCreated !== 1 ? "s" : ""} created (3 cores each)</p>
              <p><strong>{generateResult.signalsLinked}</strong> signal{generateResult.signalsLinked !== 1 ? "s" : ""} linked</p>
              {generateResult.skippedSpare > 0 && (
                <p className="text-muted-foreground">
                  {generateResult.skippedSpare} spare/untagged signal{generateResult.skippedSpare !== 1 ? "s" : ""} skipped
                </p>
              )}
              {generateResult.skippedAlreadyAssigned > 0 && (
                <p className="text-muted-foreground">
                  {generateResult.skippedAlreadyAssigned} signal{generateResult.skippedAlreadyAssigned !== 1 ? "s" : ""} already assigned — skipped
                </p>
              )}
              {generateResult.cablesCreated === 0 && generateResult.skippedSpare === 0 && (
                <p className="text-muted-foreground">
                  No unassigned signals found. All eligible signals already have cables.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>OK</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
