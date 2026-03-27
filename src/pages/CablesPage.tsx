import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel } from "@/contexts/PanelContext";
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Cable as CableIcon,
  Zap,
  X,
  Merge,
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
  assignment_type: string;
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

const ASSIGNMENT_TYPES = [
  { value: "signal", label: "IO Signal" },
  { value: "common", label: "Common" },
  { value: "ground", label: "Ground" },
  { value: "shield", label: "Shield" },
  { value: "spare", label: "Spare" },
  { value: "empty", label: "Empty" },
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
  const { selectedPanel } = usePanel();
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

  // ── Selection ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);

  const selectedCount = selectedIds.size;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchFilter, typeFilter]);

  // ── Load data ──────────────────────────────────────────────────────

  const loadCables = useCallback(async () => {
    if (!selectedProject) return;
    const db = await getDatabase();
    let query = `SELECT c.*,
        (SELECT COUNT(*) FROM cable_cores cc JOIN signals s ON cc.signal_id = s.id WHERE cc.cable_id = c.id) as signal_count
       FROM cables c
       WHERE c.project_id = $1`;
    const params: unknown[] = [selectedProject.id];
    if (selectedPanel) {
      query += ` AND c.panel_id = $2`;
      params.push(selectedPanel.id);
    }
    query += ` ORDER BY c.cable_tag`;
    const rows = await db.select<Cable[]>(query, params);
    setCables(rows);
  }, [selectedProject, selectedPanel]);

  const loadSignals = useCallback(async () => {
    if (!selectedProject) return;
    const db = await getDatabase();
    let query = `SELECT id, tag_name, io_type, item_number FROM signals WHERE project_id = $1`;
    const params: unknown[] = [selectedProject.id];
    if (selectedPanel) {
      query += ` AND panel_id = $2`;
      params.push(selectedPanel.id);
    }
    query += ` ORDER BY item_number`;
    const rows = await db.select<SignalOption[]>(query, params);
    setSignals(rows);
  }, [selectedProject, selectedPanel]);

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
        `INSERT INTO cables (project_id, panel_id, cable_tag, cable_type, core_count, from_location, to_location,
           from_device, to_device, length_m, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          selectedProject.id,
          selectedPanel?.id ?? null,
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
          `INSERT INTO cable_cores (cable_id, core_number, assignment_type) VALUES ($1, $2, 'empty')`,
          [cableId, i]
        );
      }
    }

    // Remove excess empty cores (preserve cores with a real purpose)
    for (const e of existing) {
      if (e.core_number > targetCount) {
        await db.execute(
          `DELETE FROM cable_cores WHERE id = $1 AND assignment_type = 'empty'`,
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

  const updateCoreAssignment = useCallback(
    async (core: CableCore, newType: string) => {
      const db = await getDatabase();
      if (core.assignment_type === "signal" && newType !== "signal" && core.signal_id) {
        // Changing away from signal: clear signal linkage
        await db.execute(
          `UPDATE signals SET cable_id = NULL, updated_at = datetime('now') WHERE id = $1`,
          [core.signal_id]
        );
        await db.execute(
          `UPDATE cable_cores SET assignment_type = $1, signal_id = NULL WHERE id = $2`,
          [newType, core.id]
        );
      } else {
        await db.execute(
          `UPDATE cable_cores SET assignment_type = $1 WHERE id = $2`,
          [newType, core.id]
        );
      }
      if (expandedId) await loadCores(expandedId);
      await loadCables();
    },
    [expandedId, loadCores, loadCables]
  );

  const updateCoreSignal = useCallback(
    async (core: CableCore, newSignalId: number | null) => {
      const db = await getDatabase();
      // Unlink old signal
      if (core.signal_id) {
        await db.execute(
          `UPDATE signals SET cable_id = NULL, updated_at = datetime('now') WHERE id = $1`,
          [core.signal_id]
        );
      }
      // Link new signal
      if (newSignalId) {
        await db.execute(
          `UPDATE signals SET cable_id = $1, updated_at = datetime('now') WHERE id = $2`,
          [core.cable_id, newSignalId]
        );
      }
      await db.execute(
        `UPDATE cable_cores SET signal_id = $1 WHERE id = $2`,
        [newSignalId, core.id]
      );
      if (expandedId) await loadCores(expandedId);
      await loadCables();
      await loadSignals();
    },
    [expandedId, loadCores, loadCables, loadSignals]
  );

  const addCore = useCallback(
    async (cableId: number) => {
      const db = await getDatabase();
      const maxRows = await db.select<{ mx: number | null }[]>(
        `SELECT MAX(core_number) as mx FROM cable_cores WHERE cable_id = $1`,
        [cableId]
      );
      const nextNum = (maxRows[0]?.mx ?? 0) + 1;
      await db.execute(
        `INSERT INTO cable_cores (cable_id, core_number, assignment_type) VALUES ($1, $2, 'empty')`,
        [cableId, nextNum]
      );
      await db.execute(
        `UPDATE cables SET core_count = (SELECT COUNT(*) FROM cable_cores WHERE cable_id = $1), updated_at = datetime('now') WHERE id = $1`,
        [cableId]
      );
      await loadCores(cableId);
      await loadCables();
    },
    [loadCores, loadCables]
  );

  const removeCore = useCallback(
    async (core: CableCore) => {
      const db = await getDatabase();
      // Unlink signal if linked
      if (core.signal_id) {
        await db.execute(
          `UPDATE signals SET cable_id = NULL, updated_at = datetime('now') WHERE id = $1`,
          [core.signal_id]
        );
      }
      await db.execute(`DELETE FROM cable_cores WHERE id = $1`, [core.id]);
      // Renumber remaining cores sequentially
      const remaining = await db.select<{ id: number }[]>(
        `SELECT id FROM cable_cores WHERE cable_id = $1 ORDER BY core_number`,
        [core.cable_id]
      );
      for (let i = 0; i < remaining.length; i++) {
        await db.execute(
          `UPDATE cable_cores SET core_number = $1 WHERE id = $2`,
          [i + 1, remaining[i].id]
        );
      }
      await db.execute(
        `UPDATE cables SET core_count = $1, updated_at = datetime('now') WHERE id = $2`,
        [remaining.length, core.cable_id]
      );
      await loadCores(core.cable_id);
      await loadCables();
      await loadSignals();
    },
    [loadCores, loadCables, loadSignals]
  );

  // ── Generate cables from IO List ───────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!selectedProject || generating) return;
    setGenerating(true);
    setGenerateConfirmOpen(false);
    try {
      const result = await generateCableSchedule(selectedProject.id, username, selectedPanel?.id);
      setGenerateResult(result);
      await loadCables();
      await loadSignals();
    } catch (err) {
      console.error("Cable generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [selectedProject, selectedPanel, generating, username, loadCables, loadSignals]);

  // ── Bulk actions ──────────────────────────────────────────────────

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const db = await getDatabase();
    for (const id of selectedIds) {
      // Unlink signals that reference this cable
      await db.execute(`UPDATE signals SET cable_id = NULL, updated_at = datetime('now') WHERE cable_id = $1`, [id]);
      await trackedDelete("cable", id, "cables");
      await db.execute("DELETE FROM cables WHERE id = $1", [id]);
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    if (expandedId && selectedIds.has(expandedId)) {
      setExpandedId(null);
      setCores([]);
    }
    await loadCables();
    await loadSignals();
  }, [selectedIds, expandedId, loadCables, loadSignals, trackedDelete]);

  const bulkSetField = useCallback(
    async (field: string, value: string | null) => {
      if (selectedIds.size === 0) return;
      for (const id of selectedIds) {
        await trackedUpdateFields("cable", id, "cables", { [field]: value });
      }
      setSelectedIds(new Set());
      await loadCables();
    },
    [selectedIds, loadCables, trackedUpdateFields]
  );

  /**
   * Merge selected cables into one.
   * Keeps the cable with the lowest tag, moves all cores/signals from the
   * others into it, then deletes the empty cables.
   */
  const mergeCables = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    const db = await getDatabase();

    // Pick target: cable with the lowest cable_tag among selected
    const selected = cables.filter((c) => selectedIds.has(c.id));
    selected.sort((a, b) => a.cable_tag.localeCompare(b.cable_tag));
    const target = selected[0];
    const sources = selected.slice(1);

    // Find current max core_number in target
    const maxCoreRows = await db.select<{ mx: number | null }[]>(
      `SELECT MAX(core_number) as mx FROM cable_cores WHERE cable_id = $1`,
      [target.id]
    );
    let nextCore = (maxCoreRows[0]?.mx ?? 0) + 1;

    for (const src of sources) {
      // Get all cores from source cable
      const srcCores = await db.select<{ id: number; core_number: number; signal_id: number | null }[]>(
        `SELECT id, core_number, signal_id FROM cable_cores WHERE cable_id = $1 ORDER BY core_number`,
        [src.id]
      );

      // Move each core to target with renumbered core_number
      for (const core of srcCores) {
        await db.execute(
          `UPDATE cable_cores SET cable_id = $1, core_number = $2 WHERE id = $3`,
          [target.id, nextCore, core.id]
        );
        // Update signal linkage to point to target cable
        if (core.signal_id) {
          await db.execute(
            `UPDATE signals SET cable_id = $1, updated_at = datetime('now') WHERE id = $2`,
            [target.id, core.signal_id]
          );
        }
        nextCore++;
      }

      // Delete the now-empty source cable
      await trackedDelete("cable", src.id, "cables");
      await db.execute("DELETE FROM cables WHERE id = $1", [src.id]);
    }

    // Update target cable's core_count
    const newCoreCount = nextCore - 1;
    await trackedUpdateFields("cable", target.id, "cables", { core_count: newCoreCount });

    setSelectedIds(new Set());
    setMergeConfirmOpen(false);
    if (expandedId) {
      await loadCores(expandedId);
    }
    await loadCables();
    await loadSignals();
  }, [selectedIds, cables, expandedId, loadCables, loadSignals, loadCores, trackedDelete, trackedUpdateFields]);

  // Unique locations for bulk set dropdowns
  const uniqueFromLocations = useMemo(() => {
    const locs = new Set(cables.map((c) => c.from_location).filter(Boolean));
    return [...locs].sort() as string[];
  }, [cables]);

  const uniqueToLocations = useMemo(() => {
    const locs = new Set(cables.map((c) => c.to_location).filter(Boolean));
    return [...locs].sort() as string[];
  }, [cables]);

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

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5">
          <span className="text-xs font-medium">{selectedCount} selected</span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3 w-3" />
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

          {!readOnly && (
            <>
              {/* Merge */}
              {selectedCount >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMergeConfirmOpen(true)}
                >
                  <Merge className="mr-1 h-3 w-3" />
                  Merge ({selectedCount})
                </Button>
              )}

              {/* Set Cable Type */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    Set Type
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {CABLE_TYPES.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t}
                      checked={false}
                      onCheckedChange={() => bulkSetField("cable_type", t)}
                    >
                      {t}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Set From Location */}
              {uniqueFromLocations.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      Set From
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {uniqueFromLocations.map((l) => (
                      <DropdownMenuCheckboxItem
                        key={l}
                        checked={false}
                        onCheckedChange={() => bulkSetField("from_location", l)}
                      >
                        {l}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Set To Location */}
              {uniqueToLocations.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      Set To
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {uniqueToLocations.map((l) => (
                      <DropdownMenuCheckboxItem
                        key={l}
                        checked={false}
                        onCheckedChange={() => bulkSetField("to_location", l)}
                      >
                        {l}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Clear Notes */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => bulkSetField("notes", null)}
              >
                Clear Notes
              </Button>

              {/* Delete */}
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </>
          )}
        </div>
      )}

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
                <TableHead className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border accent-primary"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
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
                    className={`cursor-pointer hover:bg-accent/30 ${selectedIds.has(cable.id) ? "bg-accent/20" : ""}`}
                    onClick={() => toggleExpand(cable.id)}
                  >
                    <TableCell className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border accent-primary"
                        checked={selectedIds.has(cable.id)}
                        onChange={() => toggleSelect(cable.id)}
                      />
                    </TableCell>
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
                      <TableCell colSpan={11} className="bg-muted/30 px-6 py-3">
                        {cores.length === 0 ? (
                          <div className="flex items-center gap-3">
                            <p className="text-xs text-muted-foreground">No cores defined.</p>
                            {!readOnly && (
                              <button
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => addCore(cable.id)}
                              >
                                <Plus className="h-3 w-3" />
                                Add Core
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                          <table ref={coreTableRef} className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="w-[50px] pb-1 text-left font-medium">Core</th>
                                <th className="w-[100px] pb-1 text-left font-medium">Color</th>
                                <th className="w-[110px] pb-1 text-left font-medium">Purpose</th>
                                <th className="w-[180px] pb-1 text-left font-medium">Signal</th>
                                <th className="w-[110px] pb-1 text-left font-medium">From Terminal</th>
                                <th className="w-[110px] pb-1 text-left font-medium">To Terminal</th>
                                <th className="pb-1 text-left font-medium">Notes</th>
                                {!readOnly && <th className="w-[32px] pb-1" />}
                              </tr>
                            </thead>
                            <tbody>
                              {cores.map((core) => (
                                <tr key={core.id} className="border-t border-border/50">
                                  <td className="py-1">
                                    <input
                                      type="number"
                                      className="h-6 w-[46px] rounded border-0 bg-transparent px-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
                                      value={core.core_number}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value) || 0;
                                        setCores((prev) =>
                                          prev.map((c) => c.id === core.id ? { ...c, core_number: v } : c)
                                        );
                                      }}
                                      onBlur={(e) => updateCore(core.id, "core_number", parseInt(e.target.value) || 1)}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                      min={1}
                                    />
                                  </td>
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
                                      value={core.assignment_type}
                                      onChange={(e) => updateCoreAssignment(core, e.target.value)}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly}
                                    >
                                      {ASSIGNMENT_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-1">
                                    <select
                                      className="h-6 w-full rounded border-0 bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                                      value={core.assignment_type === "signal" && core.signal_id != null ? String(core.signal_id) : ""}
                                      onChange={(e) => updateCoreSignal(core, e.target.value ? parseInt(e.target.value) : null)}
                                      onKeyDown={handleCellKeyDown}
                                      disabled={readOnly || core.assignment_type !== "signal"}
                                    >
                                      <option value="">{core.assignment_type === "signal" ? "— No signal —" : "—"}</option>
                                      {core.assignment_type === "signal" && signals.map((s) => (
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
                                  {!readOnly && (
                                    <td className="py-1">
                                      <button
                                        className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => removeCore(core)}
                                        title="Remove core"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!readOnly && (
                            <button
                              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => addCore(cable.id)}
                            >
                              <Plus className="h-3 w-3" />
                              Add Core
                            </button>
                          )}
                          </>
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

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} Cable{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete {selectedCount} cable{selectedCount !== 1 ? "s" : ""} and
            all their core mappings. Linked signals will be unlinked. This action cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={bulkDelete}>
              Delete {selectedCount} Cable{selectedCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge confirmation */}
      <Dialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selectedCount} Cables</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              This will merge all signals and cores from the selected cables into
              the cable with the lowest tag ({cables
                .filter((c) => selectedIds.has(c.id))
                .sort((a, b) => a.cable_tag.localeCompare(b.cable_tag))[0]?.cable_tag ?? "—"}).
            </p>
            <p>
              The other {selectedCount - 1} cable{selectedCount - 1 !== 1 ? "s" : ""} will
              be deleted after their cores are moved. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={mergeCables}>
              <Merge className="mr-1.5 h-3.5 w-3.5" />
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
