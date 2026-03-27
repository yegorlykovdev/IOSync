import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel } from "@/contexts/PanelContext";
import { getDatabase } from "@/db/database";
import { computePlcAddress, type ChannelType } from "@/lib/plc-address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Columns3,
  Trash2,
  Copy,
  ArrowUpDown,
  ListPlus,
  RefreshCw,
  X,
  Eraser,
  Download,
  AlertTriangle,
} from "lucide-react";
import { exportIoListToExcel } from "@/lib/export-excel";
import { useTrackedUpdate } from "@/hooks/useTrackedUpdate";
import { handleCellKeyDown, useGridClipboard } from "@/hooks/useGridNav";

// ── Types ──────────────────────────────────────────────────────────────

const IO_TYPES = ["DI", "DO", "AI", "AO", "RTD", "TC", "SoftComm"] as const;
type IoType = (typeof IO_TYPES)[number];

const IO_TYPE_COLORS: Record<IoType, string> = {
  DI: "bg-green-500/15 text-green-700 dark:text-green-400",
  DO: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  AI: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  AO: "bg-red-500/15 text-red-700 dark:text-red-400",
  RTD: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  TC: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  SoftComm: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

const SIGNAL_SPECS = [
  "",
  "24V DC",
  "4-20mA",
  "0-10V",
  "RTD PT100",
  "RTD PT1000",
  "Thermocouple K",
  "Thermocouple J",
  "Modbus TCP",
  "Modbus RTU",
  "BACnet IP",
  "BACnet MSTP",
  "Dry Contact",
];

const ALARM_SEVERITIES = ["", "Critical", "Major", "Warning", "Minor", "Info"];
const YES_NA = ["", "Yes", "N/A"];
const COMMS_ACCESS = ["", "R", "RW"];
const COMMS_DATA_TYPES = ["", "Digital", "Analog", "Int", "Float", "String"];

interface Signal {
  id: number;
  project_id: number;
  item_number: number | null;
  revision: string | null;
  plc_hardware_id: number | null;
  rack: string | null;
  slot: string | null;
  channel: string | null;
  pre_assigned_address: string | null;
  card_part_number: string | null;
  io_type: IoType;
  signal_spec: string | null;
  is_spare: number;
  tag_name: string | null;
  description: string | null;
  state_description: string | null;
  plc_panel: string | null;
  signal_low: string | null;
  signal_high: string | null;
  range_units: string | null;
  history_enabled: string | null;
  cov_deadband: string | null;
  time_delay: string | null;
  forced_storage_interval: string | null;
  alarm_point_activation: string | null;
  alarm_status_mismatch: string | null;
  alarm_loss_of_heartbeat: string | null;
  alarm_power_loss: string | null;
  alarm_sensor_out_of_range: string | null;
  alarm_loss_of_communication: string | null;
  alarm_low_low: string | null;
  alarm_low: string | null;
  alarm_min_operating_value: string | null;
  alarm_max_operating_value: string | null;
  alarm_high: string | null;
  alarm_high_high: string | null;
  alarm_cov_deadband: string | null;
  alarm_time_delay: string | null;
  alarm_severity: string | null;
  alarm_priority: number | null;
  resp_customer: string | null;
  resp_mech: string | null;
  resp_elec: string | null;
  resp_future: string | null;
  resp_dcim: string | null;
  resp_osc: string | null;
  legacy_card_number: string | null;
  legacy_card: string | null;
  legacy_io: string | null;
  legacy_hydronic_tag: string | null;
  legacy_device_id: string | null;
  legacy_description: string | null;
  instrument_model: string | null;
  serial_number: string | null;
  pipe_circumference: string | null;
  field_notes: string | null;
  comms_access: string | null;
  comms_data_type: string | null;
  comments: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

interface PlcModule {
  id: number;
  plc_name: string;
  rack: number;
  slot: number;
  module_type: string;
  channels: number;
  channel_type: ChannelType;
  module_category: string;
  protocol: string | null;
  ip_address: string | null;
  firmware_version: string | null;
}

// ── Validation ────────────────────────────────────────────────────────

type ValidationLevel = "error" | "warning";

interface ValidationError {
  signalId: number;
  field: string;
  level: ValidationLevel;
  message: string;
}

/** Map of signalId → field → errors */
type ValidationMap = Map<number, Map<string, ValidationError[]>>;

function validateSignals(signals: Signal[], modules: PlcModule[]): { errors: ValidationError[]; map: ValidationMap } {
  const errors: ValidationError[] = [];
  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  // Duplicate tag detection (only non-empty, non-spare tags)
  const tagCounts = new Map<string, number[]>();
  for (const s of signals) {
    if (s.tag_name && !s.is_spare) {
      const key = s.tag_name.trim().toLowerCase();
      if (key) {
        const ids = tagCounts.get(key) ?? [];
        ids.push(s.id);
        tagCounts.set(key, ids);
      }
    }
  }
  for (const [, ids] of tagCounts) {
    if (ids.length > 1) {
      for (const id of ids) {
        errors.push({ signalId: id, field: "tag_name", level: "error", message: "Duplicate tag name" });
      }
    }
  }

  // Duplicate PLC address detection (only non-empty addresses)
  const addrCounts = new Map<string, number[]>();
  for (const s of signals) {
    if (s.pre_assigned_address) {
      const key = s.pre_assigned_address.trim().toLowerCase();
      if (key) {
        const ids = addrCounts.get(key) ?? [];
        ids.push(s.id);
        addrCounts.set(key, ids);
      }
    }
  }
  for (const [, ids] of addrCounts) {
    if (ids.length > 1) {
      for (const id of ids) {
        errors.push({ signalId: id, field: "pre_assigned_address", level: "error", message: "Duplicate PLC address" });
      }
    }
  }

  // Per-signal checks
  for (const s of signals) {
    if (s.is_spare) continue;

    const mod = s.plc_hardware_id ? moduleMap.get(s.plc_hardware_id) : null;

    // Channel exceeds module capacity
    if (mod && mod.module_category === "io" && s.channel != null) {
      const ch = parseInt(s.channel);
      if (!isNaN(ch) && ch >= mod.channels) {
        errors.push({
          signalId: s.id, field: "channel", level: "error",
          message: `Channel ${ch} exceeds module capacity (${mod.channels} channels)`,
        });
      }
    }

    // AI/AO without range
    if ((s.io_type === "AI" || s.io_type === "AO") && !s.signal_low && !s.signal_high) {
      errors.push({
        signalId: s.id, field: "signal_low", level: "warning",
        message: "Analog signal has no range defined",
      });
      errors.push({
        signalId: s.id, field: "signal_high", level: "warning",
        message: "Analog signal has no range defined",
      });
    }
  }

  // Build lookup map
  const map: ValidationMap = new Map();
  for (const e of errors) {
    let fieldMap = map.get(e.signalId);
    if (!fieldMap) {
      fieldMap = new Map();
      map.set(e.signalId, fieldMap);
    }
    const list = fieldMap.get(e.field) ?? [];
    list.push(e);
    fieldMap.set(e.field, list);
  }

  return { errors, map };
}

// ── Column group visibility ────────────────────────────────────────────

interface ColumnGroup {
  id: string;
  label: string;
  columns: string[];
}

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    id: "core",
    label: "Core",
    columns: [
      "item_number", "revision", "pre_assigned_address", "rack", "slot",
      "io_type", "channel", "card_part_number", "tag_name", "description",
      "plc_panel", "signal_spec", "signal_low", "signal_high", "range_units",
    ],
  },
  { id: "signal_def", label: "Signal Definition", columns: ["state_description"] },
  {
    id: "historian",
    label: "Historian/Trending",
    columns: ["history_enabled", "cov_deadband", "time_delay", "forced_storage_interval"],
  },
  {
    id: "alarm_state",
    label: "Alarm — State",
    columns: [
      "alarm_point_activation", "alarm_status_mismatch", "alarm_loss_of_heartbeat",
      "alarm_power_loss", "alarm_sensor_out_of_range", "alarm_loss_of_communication",
    ],
  },
  {
    id: "alarm_analog",
    label: "Alarm — Analog",
    columns: [
      "alarm_low_low", "alarm_low", "alarm_min_operating_value",
      "alarm_max_operating_value", "alarm_high", "alarm_high_high",
    ],
  },
  {
    id: "alarm_meta",
    label: "Alarm — Meta",
    columns: ["alarm_cov_deadband", "alarm_time_delay", "alarm_severity", "alarm_priority"],
  },
  {
    id: "responsibility",
    label: "Responsibility",
    columns: ["resp_customer", "resp_mech", "resp_elec", "resp_future", "resp_dcim", "resp_osc"],
  },
  {
    id: "legacy",
    label: "Legacy/Field Info",
    columns: [
      "legacy_card_number", "legacy_card", "legacy_io", "legacy_hydronic_tag",
      "legacy_device_id", "legacy_description", "instrument_model",
      "serial_number", "pipe_circumference", "field_notes",
    ],
  },
  { id: "soft_comms", label: "Soft Comms", columns: ["comms_access", "comms_data_type"] },
  { id: "comments", label: "Comments", columns: ["comments"] },
];

const DEFAULT_VISIBLE: Record<string, boolean> = (() => {
  const vis: Record<string, boolean> = {};
  COLUMN_GROUPS[0].columns.forEach((c) => (vis[c] = true));
  COLUMN_GROUPS.slice(1).forEach((g) => g.columns.forEach((c) => (vis[c] = false)));
  return vis;
})();

function loadColumnVisibility(): VisibilityState {
  try {
    const stored = localStorage.getItem("iosync-io-list-columns");
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE;
}

// ── Inline cell components ─────────────────────────────────────────────

interface CellProps {
  signal: Signal;
  field: string;
  onSave: (id: number, field: string, value: string | null) => void;
  disabled?: boolean;
}

function TextInputCell({ signal, field, onSave, disabled, errors }: CellProps & { errors?: ValidationError[] }) {
  const raw = (signal as unknown as Record<string, unknown>)[field];
  const initial = raw != null ? String(raw) : "";
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(raw != null ? String(raw) : "");
  }, [raw]);

  const commit = () => {
    // Read from DOM ref so programmatic paste (native setter) is picked up
    const current = ref.current?.value ?? value;
    const trimmed = current.trim() || null;
    if (trimmed !== (initial.trim() || null)) {
      onSave(signal.id, field, trimmed);
    }
  };

  const hasError = errors && errors.some((e) => e.level === "error");
  const hasWarning = !hasError && errors && errors.length > 0;
  const errorClass = hasError
    ? "ring-1 ring-red-500 bg-red-500/10"
    : hasWarning
      ? "ring-1 ring-amber-500 bg-amber-500/10"
      : "";

  return (
    <input
      ref={ref}
      className={`h-7 w-full border-0 bg-transparent px-1 text-xs outline-none focus:bg-accent focus:ring-1 focus:ring-ring ${errorClass}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleCellKeyDown}
      disabled={disabled}
      title={errors?.map((e) => e.message).join("; ")}
    />
  );
}

interface SelectCellProps extends CellProps {
  options: string[];
  labels?: Record<string, string>;
}

function SelectInputCell({ signal, field, onSave, disabled, options, labels }: SelectCellProps) {
  const raw = (signal as unknown as Record<string, unknown>)[field];
  const current = raw != null ? String(raw) : "";

  return (
    <select
      className="h-7 w-full border-0 bg-transparent px-0.5 text-xs outline-none focus:bg-accent focus:ring-1 focus:ring-ring"
      value={current}
      onChange={(e) => onSave(signal.id, field, e.target.value || null)}
      onKeyDown={handleCellKeyDown}
      disabled={disabled}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? (o || "—")}
        </option>
      ))}
    </select>
  );
}

interface ModuleCellProps extends CellProps {
  modules: PlcModule[];
  onModuleAssign: (signalId: number, moduleId: number | null) => void;
}

function ModuleSelectCell({ signal, modules, onModuleAssign, disabled }: ModuleCellProps) {
  const current = signal.plc_hardware_id != null ? String(signal.plc_hardware_id) : "";

  return (
    <select
      className="h-7 w-full border-0 bg-transparent px-0.5 text-xs outline-none focus:bg-accent focus:ring-1 focus:ring-ring"
      value={current}
      onChange={(e) => onModuleAssign(signal.id, e.target.value ? parseInt(e.target.value) : null)}
      onKeyDown={handleCellKeyDown}
      disabled={disabled}
    >
      <option value="">—</option>
      {modules.map((m) => (
        <option key={m.id} value={String(m.id)}>
          {m.plc_name}
        </option>
      ))}
    </select>
  );
}

// ── Table meta ─────────────────────────────────────────────────────────

interface TableMeta {
  readOnly: boolean;
  modules: PlcModule[];
  validationMap: ValidationMap;
  updateField: (signalId: number, field: string, value: string | null) => void;
  assignModule: (signalId: number, moduleId: number | null) => void;
}

function isNonIoHardwareShadowRow(signal: Signal, modules: PlcModule[]): boolean {
  if (!signal.plc_hardware_id) return false;
  const mod = modules.find((m) => m.id === signal.plc_hardware_id);
  return !!mod && mod.module_category !== "io" && !signal.tag_name?.trim() && signal.channel == null;
}

// ── Main page ──────────────────────────────────────────────────────────

export function IoListPage() {
  const { selectedProject, readOnly } = useProject();
  const { selectedPanel } = usePanel();
  const { trackedUpdateField, trackedUpdateFields, trackedCreate, trackedDelete } = useTrackedUpdate(selectedProject?.id);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [modules, setModules] = useState<PlcModule[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [ioTypeFilter, setIoTypeFilter] = useState<string>("all");
  const [panelFilter, setPanelFilter] = useState<string>("all");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  useGridClipboard(tableContainerRef, readOnly);

  useEffect(() => {
    localStorage.setItem("iosync-io-list-columns", JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  // ── Load data ──────────────────────────────────────────────────────

  const loadSignals = useCallback(async () => {
    if (!selectedProject || !selectedPanel) { setSignals([]); return; }
    const db = await getDatabase();
    const rows = await db.select<Signal[]>(
      `SELECT * FROM signals WHERE project_id = $1 AND panel_id = $2
       ORDER BY CAST(rack AS INTEGER), CAST(slot AS INTEGER), CAST(channel AS INTEGER), id`,
      [selectedProject.id, selectedPanel.id]
    );
    setSignals(rows);
  }, [selectedProject, selectedPanel]);

  const loadModules = useCallback(async () => {
    if (!selectedProject || !selectedPanel) { setModules([]); return; }
    const db = await getDatabase();
    const rows = await db.select<PlcModule[]>(
      `SELECT id, plc_name, rack, slot, module_type, channels, channel_type,
              module_category, protocol, ip_address, firmware_version
       FROM plc_hardware
       WHERE project_id = $1 AND panel_id = $2
       ORDER BY rack, slot`,
      [selectedProject.id, selectedPanel.id]
    );
    setModules(rows);
  }, [selectedProject, selectedPanel]);

  useEffect(() => {
    loadSignals();
    loadModules();
  }, [loadSignals, loadModules]);

  // ── Field-level save ───────────────────────────────────────────────

  const updateField = useCallback(
    async (signalId: number, field: string, value: string | null) => {
      await trackedUpdateField("signal", signalId, "signals", field, value);
      setSignals((prev) =>
        prev.map((s) => (s.id === signalId ? { ...s, [field]: value } : s))
      );
    },
    [trackedUpdateField]
  );

  // ── Assign module → auto-fill rack/slot/panel/address/card ─────────

  const assignModule = useCallback(
    async (signalId: number, moduleId: number | null) => {
      const mod = moduleId ? modules.find((m) => m.id === moduleId) : null;
      const signal = signals.find((s) => s.id === signalId);
      const isIoModule = mod?.module_category === "io";

      const rack = mod ? String(mod.rack) : null;
      const slot = mod ? String(mod.slot) : null;
      const card = mod ? mod.module_type : null;
      const panel = mod ? mod.plc_name : null;
      const ioType = isIoModule ? mod.channel_type : signal?.io_type ?? "DI";

      const fields: Record<string, string | number | null> = {
        plc_hardware_id: moduleId,
        rack,
        slot,
        card_part_number: card,
        plc_panel: signal?.plc_panel || panel,
        io_type: ioType,
        pre_assigned_address: null,
        channel: null,
      };

      await trackedUpdateFields("signal", signalId, "signals", fields);

      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId
            ? {
                ...s,
                plc_hardware_id: moduleId,
                rack,
                slot,
                card_part_number: card,
                plc_panel: s.plc_panel || panel,
                io_type: ioType as IoType,
                pre_assigned_address: null,
                channel: null,
              }
            : s
        )
      );
    },
    [modules, signals, trackedUpdateFields]
  );

  // ── Update channel → recompute address ─────────────────────────────

  const updateChannel = useCallback(
    async (signalId: number, channel: string | null) => {
      const signal = signals.find((s) => s.id === signalId);
      if (!signal || !selectedProject) return;

      let address: string | null = null;
      const mod = signal.plc_hardware_id
        ? modules.find((m) => m.id === signal.plc_hardware_id)
        : null;

      if (mod && channel) {
        address = computePlcAddress(
          selectedProject.plc_platform,
          {
            rack: mod.rack,
            slot: mod.slot,
            channelType: mod.channel_type,
            channelNumber: parseInt(channel) || 0,
          },
          {
            prefix: selectedProject.custom_address_prefix,
            pattern: selectedProject.custom_address_pattern,
          }
        );
      }

      await trackedUpdateFields("signal", signalId, "signals", {
        channel,
        pre_assigned_address: address,
      });
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId
            ? { ...s, channel, pre_assigned_address: address }
            : s
        )
      );
    },
    [signals, modules, selectedProject, trackedUpdateFields]
  );

  // ── Add new row ────────────────────────────────────────────────────

  const addRow = useCallback(
    async (spare = false) => {
      if (!selectedProject) return;
      const db = await getDatabase();
      const result = await db.select<{ max_num: number | null }[]>(
        `SELECT MAX(item_number) as max_num FROM signals WHERE project_id = $1`,
        [selectedProject.id]
      );
      const nextNum = (result[0]?.max_num ?? 0) + 1;

      const insertResult = await db.execute(
        `INSERT INTO signals (project_id, panel_id, item_number, io_type, description, is_spare, sort_order, signal_type, tag)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [selectedProject.id, selectedPanel?.id ?? null, nextNum, "DI", spare ? "Spare" : "", spare ? 1 : 0, nextNum, "DI", spare ? "Spare" : "New"]
      );
      if (insertResult.lastInsertId) {
        await trackedCreate("signal", insertResult.lastInsertId, {
          io_type: "DI",
          description: spare ? "Spare" : "",
          is_spare: spare ? 1 : 0,
          item_number: nextNum,
        });
      }
      await loadSignals();
      // Scroll to bottom after adding
      setTimeout(() => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
        }
      }, 50);
    },
    [selectedProject, selectedPanel, loadSignals, trackedCreate]
  );

  // ── Copy row ───────────────────────────────────────────────────────

  const copyRow = useCallback(
    async (signal: Signal) => {
      if (!selectedProject) return;
      const db = await getDatabase();
      const result = await db.select<{ max_num: number | null }[]>(
        `SELECT MAX(item_number) as max_num FROM signals WHERE project_id = $1`,
        [selectedProject.id]
      );
      const nextNum = (result[0]?.max_num ?? 0) + 1;

      const insertResult = await db.execute(
        `INSERT INTO signals (
          project_id, panel_id, item_number, plc_hardware_id, io_type, channel, tag_name,
          description, is_spare, signal_spec, plc_panel, signal_low, signal_high,
          range_units, rack, slot, card_part_number, pre_assigned_address,
          state_description, history_enabled, cov_deadband, time_delay, forced_storage_interval,
          alarm_point_activation, alarm_status_mismatch, alarm_loss_of_heartbeat,
          alarm_power_loss, alarm_sensor_out_of_range, alarm_loss_of_communication,
          alarm_low_low, alarm_low, alarm_min_operating_value,
          alarm_max_operating_value, alarm_high, alarm_high_high,
          alarm_cov_deadband, alarm_time_delay, alarm_severity, alarm_priority,
          resp_customer, resp_mech, resp_elec, resp_future, resp_dcim, resp_osc,
          comms_access, comms_data_type, comments, sort_order, signal_type, tag
        ) SELECT
          project_id, panel_id, $1, plc_hardware_id, io_type, channel, tag_name,
          description, is_spare, signal_spec, plc_panel, signal_low, signal_high,
          range_units, rack, slot, card_part_number, pre_assigned_address,
          state_description, history_enabled, cov_deadband, time_delay, forced_storage_interval,
          alarm_point_activation, alarm_status_mismatch, alarm_loss_of_heartbeat,
          alarm_power_loss, alarm_sensor_out_of_range, alarm_loss_of_communication,
          alarm_low_low, alarm_low, alarm_min_operating_value,
          alarm_max_operating_value, alarm_high, alarm_high_high,
          alarm_cov_deadband, alarm_time_delay, alarm_severity, alarm_priority,
          resp_customer, resp_mech, resp_elec, resp_future, resp_dcim, resp_osc,
          comms_access, comms_data_type, comments, $1, signal_type, tag
        FROM signals WHERE id = $2`,
        [nextNum, signal.id]
      );
      if (insertResult.lastInsertId) {
        await trackedCreate("signal", insertResult.lastInsertId, {
          io_type: signal.io_type,
          tag_name: signal.tag_name,
          description: signal.description,
        });
      }
      await loadSignals();
    },
    [selectedProject, loadSignals, trackedCreate]
  );

  // ── Delete ─────────────────────────────────────────────────────────

  const deleteRow = useCallback(
    async (id: number) => {
      await trackedDelete("signal", id, "signals");
      const db = await getDatabase();
      await db.execute("DELETE FROM signals WHERE id = $1", [id]);
      setDeleteConfirmId(null);
      await loadSignals();
    },
    [loadSignals, trackedDelete]
  );

  // ── Filters ────────────────────────────────────────────────────────

  const uniquePanels = useMemo(() => {
    const panels = new Set(signals.map((s) => s.plc_panel).filter(Boolean));
    return Array.from(panels).sort() as string[];
  }, [signals]);

  // ── Validation ──────────────────────────────────────────────────────

  const validation = useMemo(
    () => validateSignals(signals, modules),
    [signals, modules]
  );

  const errorCount = validation.errors.filter((e) => e.level === "error").length;
  const warningCount = validation.errors.filter((e) => e.level === "warning").length;
  const hasBlockingErrors = errorCount > 0;

  const filteredSignals = useMemo(() => {
    let result = signals;
    if (showErrorsOnly) {
      const idsWithErrors = new Set(validation.errors.map((e) => e.signalId));
      result = result.filter((s) => idsWithErrors.has(s.id));
    }
    if (ioTypeFilter !== "all") {
      result =
        ioTypeFilter === "spare"
          ? result.filter((s) => s.is_spare)
          : result.filter((s) => s.io_type === ioTypeFilter);
    }
    if (panelFilter !== "all") {
      result = result.filter((s) => s.plc_panel === panelFilter);
    }
    return result;
  }, [signals, ioTypeFilter, panelFilter, showErrorsOnly, validation.errors]);

  const realSignals = useMemo(
    () => signals.filter((s) => !isNonIoHardwareShadowRow(s, modules)),
    [signals, modules]
  );

  const signalCount = realSignals.length;
  const spareCount = realSignals.filter((s) => s.is_spare).length;

  // ── Bulk actions ────────────────────────────────────────────────────

  const selectedSignalIds = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((k) => rowSelection[k])
      .map((k) => {
        const idx = parseInt(k);
        return filteredSignals[idx]?.id;
      })
      .filter((id): id is number => id != null);
  }, [rowSelection, filteredSignals]);

  const selectedCount = selectedSignalIds.length;

  const bulkDelete = useCallback(async () => {
    if (selectedSignalIds.length === 0) return;
    const db = await getDatabase();
    for (const id of selectedSignalIds) {
      await trackedDelete("signal", id, "signals");
    }
    const placeholders = selectedSignalIds.map((_, i) => `$${i + 1}`).join(",");
    await db.execute(
      `DELETE FROM signals WHERE id IN (${placeholders})`,
      selectedSignalIds
    );
    setRowSelection({});
    setBulkDeleteOpen(false);
    await loadSignals();
  }, [selectedSignalIds, loadSignals, trackedDelete]);

  const bulkSetField = useCallback(
    async (field: string, value: string | null) => {
      if (selectedSignalIds.length === 0) return;
      for (const id of selectedSignalIds) {
        await trackedUpdateField("signal", id, "signals", field, value);
      }
      // If setting io_type, also update legacy signal_type
      if (field === "io_type" && value) {
        const legacy = ["DI", "DO", "AI", "AO"].includes(value) ? value : "DI";
        const db = await getDatabase();
        for (const id of selectedSignalIds) {
          await db.execute(
            `UPDATE signals SET signal_type = $1 WHERE id = $2`,
            [legacy, id]
          );
        }
      }
      setRowSelection({});
      await loadSignals();
    },
    [selectedSignalIds, loadSignals, trackedUpdateField]
  );

  const bulkMarkSpare = useCallback(async () => {
    if (selectedSignalIds.length === 0) return;
    for (const id of selectedSignalIds) {
      await trackedUpdateFields("signal", id, "signals", {
        is_spare: 1,
        description: "Spare",
      });
      // Also update legacy tag field (not tracked)
      const db = await getDatabase();
      await db.execute(`UPDATE signals SET tag = 'Spare' WHERE id = $1`, [id]);
    }
    setRowSelection({});
    await loadSignals();
  }, [selectedSignalIds, loadSignals, trackedUpdateFields]);

  const CLEARABLE_GROUPS: { label: string; fields: string[] }[] = [
    {
      label: "Alarms",
      fields: [
        "alarm_point_activation", "alarm_status_mismatch", "alarm_loss_of_heartbeat",
        "alarm_power_loss", "alarm_sensor_out_of_range", "alarm_loss_of_communication",
        "alarm_low_low", "alarm_low", "alarm_min_operating_value",
        "alarm_max_operating_value", "alarm_high", "alarm_high_high",
        "alarm_cov_deadband", "alarm_time_delay", "alarm_severity", "alarm_priority",
      ],
    },
    {
      label: "Historian",
      fields: ["history_enabled", "cov_deadband", "time_delay", "forced_storage_interval"],
    },
    {
      label: "Responsibility",
      fields: ["resp_customer", "resp_mech", "resp_elec", "resp_future", "resp_dcim", "resp_osc"],
    },
    {
      label: "Legacy",
      fields: [
        "legacy_card_number", "legacy_card", "legacy_io", "legacy_hydronic_tag",
        "legacy_device_id", "legacy_description", "instrument_model",
        "serial_number", "pipe_circumference", "field_notes",
      ],
    },
  ];

  const bulkClearFields = useCallback(
    async (fields: string[]) => {
      if (selectedSignalIds.length === 0) return;
      const nullFields: Record<string, null> = {};
      for (const f of fields) nullFields[f] = null;
      for (const id of selectedSignalIds) {
        await trackedUpdateFields("signal", id, "signals", nullFields);
      }
      setRowSelection({});
      await loadSignals();
    },
    [selectedSignalIds, loadSignals, trackedUpdateFields]
  );

  // ── Sync from Hardware ───────────────────────────────────────────────

  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!selectedProject || exporting) return;
    setExporting(true);
    try {
      await exportIoListToExcel(realSignals, modules, {
        name: selectedProject.name,
        project_number: selectedProject.project_number,
        client: selectedProject.client,
        plc_platform: selectedProject.plc_platform,
      });
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [selectedProject, realSignals, modules, exporting]);

  const syncFromHardware = useCallback(async () => {
    if (!selectedProject || syncing) return;
    setSyncing(true);
    try {
      const db = await getDatabase();

      // Get existing signal → module+channel mappings (panel-scoped)
      const existing = await db.select<{ plc_hardware_id: number; channel: string | null }[]>(
        `SELECT plc_hardware_id, channel FROM signals
         WHERE project_id = $1 AND panel_id = $2 AND plc_hardware_id IS NOT NULL`,
        [selectedProject.id, selectedPanel!.id]
      );
      const existingSet = new Set(
        existing.map((s) => `${s.plc_hardware_id}:${s.channel ?? "null"}`)
      );

      // Get next item number
      const numResult = await db.select<{ max_num: number | null }[]>(
        `SELECT MAX(item_number) as max_num FROM signals WHERE project_id = $1`,
        [selectedProject.id]
      );
      let nextNum = (numResult[0]?.max_num ?? 0) + 1;

      const customConfig = {
        prefix: selectedProject.custom_address_prefix,
        pattern: selectedProject.custom_address_pattern,
      };

      let created = 0;

      for (const mod of modules) {
        if (mod.module_category !== "io") continue;

        // IO module: 1 row per channel
        for (let ch = 0; ch < mod.channels; ch++) {
          const chStr = String(ch);
          if (!existingSet.has(`${mod.id}:${chStr}`)) {
            const address = computePlcAddress(
              selectedProject.plc_platform,
              { rack: mod.rack, slot: mod.slot, channelType: mod.channel_type, channelNumber: ch },
              customConfig
            );
            await db.execute(
              `INSERT INTO signals (
                project_id, panel_id, item_number, plc_hardware_id, io_type, description,
                rack, slot, channel, card_part_number, plc_panel,
                pre_assigned_address, sort_order, signal_type, tag
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [
                selectedProject.id, selectedPanel?.id ?? null, nextNum, mod.id, mod.channel_type,
                "", String(mod.rack), String(mod.slot), chStr,
                mod.module_type, mod.plc_name, address, nextNum,
                ["DI", "DO", "AI", "AO"].includes(mod.channel_type) ? mod.channel_type : "DI",
                `${mod.plc_name}_R${mod.rack}S${mod.slot}_CH${chStr}`,
              ]
            );
            nextNum++;
            created++;
          }
        }
      }

      // Re-sort all signals by rack/slot/channel to match hardware order
      if (created > 0) {
        const allSignals = await db.select<{ id: number; rack: string | null; slot: string | null; channel: string | null }[]>(
          `SELECT id, rack, slot, channel FROM signals WHERE project_id = $1`,
          [selectedProject.id]
        );
        const parseNum = (v: string | null, fallback: number) => {
          if (v == null) return fallback;
          const n = parseInt(v);
          return isNaN(n) ? fallback : n;
        };
        const sorted = allSignals.sort((a, b) => {
          const rackA = parseNum(a.rack, 999);
          const rackB = parseNum(b.rack, 999);
          if (rackA !== rackB) return rackA - rackB;
          const slotA = parseNum(a.slot, 999);
          const slotB = parseNum(b.slot, 999);
          if (slotA !== slotB) return slotA - slotB;
          const chA = a.channel != null ? parseNum(a.channel, -1) : -1;
          const chB = b.channel != null ? parseNum(b.channel, -1) : -1;
          return chA - chB;
        });
        for (let i = 0; i < sorted.length; i++) {
          await db.execute(
            `UPDATE signals SET sort_order = $1, item_number = $2 WHERE id = $3`,
            [i + 1, i + 1, sorted[i].id]
          );
        }
      }

      await loadSignals();
    } finally {
      setSyncing(false);
    }
  }, [selectedProject, selectedPanel, modules, syncing, loadSignals]);

  // ── Helper to build text cell column ───────────────────────────────

  const textCol = (key: string, header: string, size: number): ColumnDef<Signal> => ({
    accessorKey: key,
    header,
    size,
    cell: ({ row, table }) => {
      const meta = table.options.meta as TableMeta;
      const errs = meta.validationMap.get(row.original.id)?.get(key);
      return (
        <TextInputCell
          signal={row.original}
          field={key}
          onSave={meta.updateField}
          disabled={meta.readOnly}
          errors={errs}
        />
      );
    },
  });

  const selectCol = (
    key: string,
    header: string,
    size: number,
    options: string[],
    labels?: Record<string, string>
  ): ColumnDef<Signal> => ({
    accessorKey: key,
    header,
    size,
    cell: ({ row, table }) => (
      <SelectInputCell
        signal={row.original}
        field={key}
        onSave={(table.options.meta as TableMeta).updateField}
        disabled={(table.options.meta as TableMeta).readOnly}
        options={options}
        labels={labels}
      />
    ),
  });

  // ── Column definitions ─────────────────────────────────────────────

  const columns = useMemo<ColumnDef<Signal>[]>(
    () => [
      // Selection checkbox
      {
        id: "select",
        size: 32,
        header: ({ table }) => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border accent-primary"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
      },
      // Row actions
      {
        id: "actions",
        size: 64,
        header: "",
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          return (
            <div className="flex gap-0.5">
              <button
                className="rounded p-1 hover:bg-accent disabled:opacity-30"
                onClick={() => copyRow(row.original)}
                disabled={meta.readOnly}
                title="Copy row"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                onClick={() => setDeleteConfirmId(row.original.id)}
                disabled={meta.readOnly}
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        },
      },
      // Core
      {
        accessorKey: "item_number",
        header: "#",
        size: 44,
        cell: ({ row }) => (
          <span className="block px-1 text-xs text-muted-foreground">
            {row.original.item_number}
          </span>
        ),
      },
      textCol("revision", "Rev", 48),
      {
        accessorKey: "pre_assigned_address",
        header: "Address",
        size: 90,
        cell: ({ row, table }) => {
          const errs = (table.options.meta as TableMeta).validationMap
            .get(row.original.id)?.get("pre_assigned_address");
          const hasErr = errs && errs.some((e) => e.level === "error");
          return (
            <span
              className={`block px-1 font-mono text-xs text-muted-foreground ${hasErr ? "rounded ring-1 ring-red-500 bg-red-500/10" : ""}`}
              title={errs?.map((e) => e.message).join("; ")}
            >
              {row.original.pre_assigned_address ?? ""}
            </span>
          );
        },
      },
      // Module assignment (picks module → auto-fills rack/slot/card)
      {
        id: "plc_module",
        header: "Module",
        size: 140,
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          return (
            <ModuleSelectCell
              signal={row.original}
              field="plc_hardware_id"
              modules={meta.modules}
              onModuleAssign={meta.readOnly ? () => {} : assignModule}
              onSave={() => {}}
              disabled={meta.readOnly}
            />
          );
        },
      },
      {
        accessorKey: "rack",
        header: "Rack",
        size: 44,
        cell: ({ row }) => (
          <span className="block px-1 text-xs text-muted-foreground">{row.original.rack ?? ""}</span>
        ),
      },
      {
        accessorKey: "slot",
        header: "Slot",
        size: 44,
        cell: ({ row }) => (
          <span className="block px-1 text-xs text-muted-foreground">{row.original.slot ?? ""}</span>
        ),
      },
      {
        accessorKey: "io_type",
        header: "IO Type",
        size: 85,
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          // For CPU/comms modules, show category label instead of editable select
          const mod = row.original.plc_hardware_id
            ? meta.modules.find((m) => m.id === row.original.plc_hardware_id)
            : null;
          if (mod && mod.module_category === "cpu") {
            return (
              <span className="block px-1 text-xs font-medium text-cyan-700 dark:text-cyan-400">
                CPU
              </span>
            );
          }
          if (mod && mod.module_category === "communication") {
            return (
              <span className="block px-1 text-xs font-medium text-purple-700 dark:text-purple-400">
                Comm
              </span>
            );
          }
          return (
            <select
              className={`h-7 w-full border-0 bg-transparent px-0.5 text-xs font-medium outline-none focus:ring-1 focus:ring-ring ${IO_TYPE_COLORS[row.original.io_type] ?? ""}`}
              value={row.original.io_type}
              onChange={(e) => {
                meta.updateField(row.original.id, "io_type", e.target.value);
                const legacy = ["DI", "DO", "AI", "AO"].includes(e.target.value) ? e.target.value : "DI";
                meta.updateField(row.original.id, "signal_type", legacy);
              }}
              onKeyDown={handleCellKeyDown}
              disabled={meta.readOnly}
            >
              {IO_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          );
        },
      },
      {
        accessorKey: "channel",
        header: "CH",
        size: 50,
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const mod = row.original.plc_hardware_id
            ? meta.modules.find((m) => m.id === row.original.plc_hardware_id)
            : null;
          if (!mod || mod.module_category !== "io") {
            return <span className="block px-1 text-xs text-muted-foreground">—</span>;
          }
          const channelOptions = Array.from({ length: mod.channels }, (_, i) => String(i));
          const errs = meta.validationMap.get(row.original.id)?.get("channel");
          const hasErr = errs && errs.some((e) => e.level === "error");
          return (
            <select
              className={`h-7 w-full border-0 bg-transparent px-0.5 text-xs outline-none focus:ring-1 focus:ring-ring ${hasErr ? "ring-red-500 bg-red-500/10" : ""}`}
              value={row.original.channel ?? ""}
              onChange={(e) => updateChannel(row.original.id, e.target.value || null)}
              onKeyDown={handleCellKeyDown}
              disabled={meta.readOnly}
              title={errs?.map((e) => e.message).join("; ")}
            >
              <option value="">—</option>
              {channelOptions.map((ch) => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          );
        },
      },
      {
        accessorKey: "card_part_number",
        header: "Card",
        size: 90,
        cell: ({ row }) => (
          <span className="block px-1 text-xs text-muted-foreground">
            {row.original.card_part_number ?? ""}
          </span>
        ),
      },
      textCol("tag_name", "Tag Name", 170),
      textCol("description", "Description", 200),
      textCol("plc_panel", "PLC Panel", 110),
      selectCol("signal_spec", "Signal Type", 100, SIGNAL_SPECS),
      textCol("signal_low", "Low", 65),
      textCol("signal_high", "High", 65),
      textCol("range_units", "Units", 70),
      // Signal definition
      textCol("state_description", "State Desc", 130),
      // Historian
      selectCol("history_enabled", "History", 65, YES_NA),
      textCol("cov_deadband", "COV", 60),
      textCol("time_delay", "Delay", 60),
      textCol("forced_storage_interval", "Interval", 65),
      // Alarm — state
      selectCol("alarm_point_activation", "Pt Act", 65, YES_NA),
      selectCol("alarm_status_mismatch", "Mismatch", 75, YES_NA),
      selectCol("alarm_loss_of_heartbeat", "Heartbeat", 75, YES_NA),
      selectCol("alarm_power_loss", "Pwr Loss", 70, YES_NA),
      selectCol("alarm_sensor_out_of_range", "Sensor OOR", 80, YES_NA),
      selectCol("alarm_loss_of_communication", "Loss Comms", 80, YES_NA),
      // Alarm — analog
      textCol("alarm_low_low", "LL", 48),
      textCol("alarm_low", "L", 48),
      textCol("alarm_min_operating_value", "Min", 48),
      textCol("alarm_max_operating_value", "Max", 48),
      textCol("alarm_high", "H", 48),
      textCol("alarm_high_high", "HH", 48),
      // Alarm — meta
      textCol("alarm_cov_deadband", "A.COV", 55),
      textCol("alarm_time_delay", "A.Delay", 60),
      selectCol("alarm_severity", "Severity", 75, ALARM_SEVERITIES),
      textCol("alarm_priority", "Priority", 60),
      // Responsibility
      selectCol("resp_customer", "Cust", 55, YES_NA),
      selectCol("resp_mech", "Mech", 55, YES_NA),
      selectCol("resp_elec", "Elec", 55, YES_NA),
      selectCol("resp_future", "Future", 55, YES_NA),
      selectCol("resp_dcim", "DCIM", 55, YES_NA),
      selectCol("resp_osc", "OSC", 55, YES_NA),
      // Legacy
      textCol("legacy_card_number", "Lgcy Card#", 85),
      textCol("legacy_card", "Lgcy Card", 85),
      textCol("legacy_io", "Lgcy IO", 65),
      textCol("legacy_hydronic_tag", "Hydro Tag", 85),
      textCol("legacy_device_id", "Device ID", 80),
      textCol("legacy_description", "Lgcy Desc", 100),
      textCol("instrument_model", "Instr Model", 95),
      textCol("serial_number", "Serial#", 80),
      textCol("pipe_circumference", "Pipe Circ", 75),
      textCol("field_notes", "Field Notes", 100),
      // Soft comms
      selectCol("comms_access", "Access", 60, COMMS_ACCESS),
      selectCol("comms_data_type", "Data Type", 75, COMMS_DATA_TYPES),
      // Comments
      textCol("comments", "Comments", 150),
    ],
    [modules, copyRow, assignModule, updateChannel]
  );

  // ── Table instance ─────────────────────────────────────────────────

  const table = useReactTable({
    data: filteredSignals,
    columns,
    state: { sorting, columnVisibility, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const s = row.original;
      return (
        (s.tag_name ?? "").toLowerCase().includes(search) ||
        (s.description ?? "").toLowerCase().includes(search) ||
        (s.plc_panel ?? "").toLowerCase().includes(search) ||
        (s.pre_assigned_address ?? "").toLowerCase().includes(search)
      );
    },
    meta: {
      readOnly,
      modules,
      validationMap: validation.map,
      updateField,
      assignModule,
    } satisfies TableMeta,
  });

  const isGroupVisible = (group: ColumnGroup) =>
    group.columns.some((c) => columnVisibility[c] !== false);

  const toggleGroup = (group: ColumnGroup) => {
    const visible = isGroupVisible(group);
    const update: VisibilityState = {};
    group.columns.forEach((c) => (update[c] = !visible));
    setColumnVisibility((prev) => ({ ...prev, ...update }));
  };

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
        <h1 className="mr-2 text-xl font-semibold">IO List</h1>

        <Badge variant="secondary" className="text-xs">
          {signalCount} signal{signalCount !== 1 && "s"}
          {spareCount > 0 && ` (${spareCount} spare)`}
        </Badge>

        {errorCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {errorCount} error{errorCount !== 1 && "s"}
          </Badge>
        )}
        {warningCount > 0 && errorCount === 0 && (
          <Badge variant="secondary" className="border-amber-500/50 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {warningCount} warning{warningCount !== 1 && "s"}
          </Badge>
        )}

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="h-8 w-[180px] pl-8 text-xs"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>

        <Select value={ioTypeFilter} onValueChange={setIoTypeFilter}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="IO Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {IO_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
            <SelectItem value="spare">Spare</SelectItem>
          </SelectContent>
        </Select>

        {uniquePanels.length > 0 && (
          <Select value={panelFilter} onValueChange={setPanelFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Panel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Panels</SelectItem>
              {uniquePanels.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(errorCount > 0 || warningCount > 0) && (
          <Button
            variant={showErrorsOnly ? "destructive" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowErrorsOnly((v) => !v)}
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            {showErrorsOnly ? "Show All" : "Errors Only"}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Columns3 className="mr-1.5 h-3.5 w-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Column Groups</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMN_GROUPS.map((group) => (
              <DropdownMenuCheckboxItem
                key={group.id}
                checked={isGroupVisible(group)}
                onCheckedChange={() => toggleGroup(group)}
              >
                {group.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={handleExport}
          disabled={exporting || realSignals.length === 0 || hasBlockingErrors}
          title={hasBlockingErrors ? "Fix errors before exporting" : "Export IO List to Excel"}
        >
          <Download className={`mr-1.5 h-3.5 w-3.5 ${exporting ? "animate-pulse" : ""}`} />
          {exporting ? "Exporting…" : "Export"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={syncFromHardware}
          disabled={readOnly || syncing || modules.length === 0}
          title="Generate rows from PLC hardware configuration"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          Sync from Hardware
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => addRow(true)}
          disabled={readOnly}
        >
          <ListPlus className="mr-1.5 h-3.5 w-3.5" />
          Spare
        </Button>

        <Button size="sm" className="h-8 text-xs" onClick={() => addRow(false)} disabled={readOnly}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Row
        </Button>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && !readOnly && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5">
          <span className="text-xs font-medium">
            {selectedCount} selected
          </span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setRowSelection({})}
          >
            <X className="h-3 w-3" />
          </button>

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Delete selected */}
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>

          {/* Set IO Type */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Set IO Type
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {IO_TYPES.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={false}
                  onCheckedChange={() => bulkSetField("io_type", t)}
                >
                  {t}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Set Signal Type */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Set Signal Type
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {SIGNAL_SPECS.filter(Boolean).map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={false}
                  onCheckedChange={() => bulkSetField("signal_spec", s)}
                >
                  {s}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Set PLC Panel */}
          {uniquePanels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Set Panel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {uniquePanels.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={false}
                    onCheckedChange={() => bulkSetField("plc_panel", p)}
                  >
                    {p}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mark as Spare */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={bulkMarkSpare}
          >
            Mark Spare
          </Button>

          {/* Clear fields */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Eraser className="mr-1 h-3 w-3" />
                Clear
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Clear fields on selected rows</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CLEARABLE_GROUPS.map((g) => (
                <DropdownMenuCheckboxItem
                  key={g.label}
                  checked={false}
                  onCheckedChange={() => bulkClearFields(g.fields)}
                >
                  {g.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Table */}
      {signals.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <ListPlus className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No signals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Sync from Hardware" to generate rows from your PLC configuration,
            or "Add Row" to add signals manually.
          </p>
        </div>
      ) : (
        <div ref={tableContainerRef} className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize(), minWidth: header.getSize() }}
                      className={`px-1 py-1 text-xs ${header.column.getCanSort() ? "cursor-pointer select-none" : ""}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-0.5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && <ArrowUpDown className="h-3 w-3" />}
                        {header.column.getIsSorted() === "desc" && <ArrowUpDown className="h-3 w-3 rotate-180" />}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const rowErrors = validation.map.get(row.original.id);
                const hasRowError = rowErrors && Array.from(rowErrors.values()).some((errs) => errs.some((e) => e.level === "error"));
                const hasRowWarning = !hasRowError && rowErrors && rowErrors.size > 0;
                return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={`${row.original.is_spare ? "opacity-50" : ""} hover:bg-accent/30 ${hasRowError ? "border-l-2 border-l-red-500" : hasRowWarning ? "border-l-2 border-l-amber-500" : ""}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                      className="p-0"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Single delete confirmation */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Signal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the signal. This action cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteRow(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} Signal{selectedCount !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete {selectedCount} selected signal{selectedCount !== 1 ? "s" : ""}.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={bulkDelete}>
              Delete {selectedCount} Signal{selectedCount !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
