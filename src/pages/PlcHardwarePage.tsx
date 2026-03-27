import { useState, useEffect, useCallback, useMemo } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel } from "@/contexts/PanelContext";
import { getDatabase } from "@/db/database";
import { useTrackedUpdate } from "@/hooks/useTrackedUpdate";
import {
  computePlcAddress,
  PLC_PLATFORM_LABELS,
  type ChannelType,
} from "@/lib/plc-address";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, Cpu } from "lucide-react";

type ModuleCategory = "io" | "communication" | "cpu";

interface PlcModule {
  id: number;
  project_id: number;
  plc_name: string;
  rack: number;
  slot: number;
  module_type: string;
  channels: number;
  channel_type: ChannelType;
  module_category: ModuleCategory;
  protocol: string | null;
  ip_address: string | null;
  port: number | null;
  baud_rate: number | null;
  station_address: number | null;
  firmware_version: string | null;
  created_at: string;
}

interface ModuleUtilization extends PlcModule {
  used_channels: number;
}

const CHANNEL_TYPES: ChannelType[] = ["DI", "DO", "AI", "AO"];

const CHANNEL_TYPE_COLORS: Record<ChannelType, string> = {
  DI: "bg-green-500/15 text-green-700 dark:text-green-400",
  DO: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  AI: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  AO: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const MODULE_CATEGORIES: { value: ModuleCategory; label: string }[] = [
  { value: "io", label: "IO Module" },
  { value: "communication", label: "Communication Module" },
  { value: "cpu", label: "CPU / Processor" },
];

const CATEGORY_COLORS: Record<ModuleCategory, string> = {
  io: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  communication: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  cpu: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
};

const IO_MODULE_TYPES = [
  "Digital Input",
  "Digital Output",
  "Analog Input",
  "Analog Output",
  "Mixed IO",
];

const COMM_MODULE_TYPES = [
  "Communication",
  "Gateway",
  "Network Adapter",
];

const CPU_MODULE_TYPES = [
  "CPU",
  "Safety CPU",
  "Coprocessor",
];

const PROTOCOLS = [
  "Modbus RTU",
  "Modbus TCP",
  "BACnet",
  "PROFINET",
  "PROFIBUS",
  "EtherNet/IP",
  "DeviceNet",
  "Custom",
];

function getModuleTypesForCategory(category: ModuleCategory): string[] {
  switch (category) {
    case "io":
      return IO_MODULE_TYPES;
    case "communication":
      return COMM_MODULE_TYPES;
    case "cpu":
      return CPU_MODULE_TYPES;
  }
}

interface FormState {
  plc_name: string;
  rack: string;
  slot: string;
  module_type: string;
  channels: string;
  channel_type: ChannelType;
  module_category: ModuleCategory;
  protocol: string;
  ip_address: string;
  port: string;
  baud_rate: string;
  station_address: string;
  firmware_version: string;
}

const EMPTY_FORM: FormState = {
  plc_name: "",
  rack: "0",
  slot: "",
  module_type: "",
  channels: "",
  channel_type: "DI",
  module_category: "io",
  protocol: "",
  ip_address: "",
  port: "",
  baud_rate: "",
  station_address: "",
  firmware_version: "",
};

function UtilizationBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full transition-all ${
            pct >= 90
              ? "bg-red-500"
              : pct >= 70
                ? "bg-orange-500"
                : "bg-green-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {used}/{total}
      </span>
    </div>
  );
}

export function PlcHardwarePage() {
  const { selectedProject, readOnly } = useProject();
  const { selectedPanel } = usePanel();
  const { trackedCreate, trackedDelete, trackedUpdateFields } = useTrackedUpdate(selectedProject?.id);
  const [modules, setModules] = useState<ModuleUtilization[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const loadModules = useCallback(async () => {
    if (!selectedProject || !selectedPanel) { setModules([]); return; }
    const db = await getDatabase();
    const rows = await db.select<(PlcModule & { used_channels: number })[]>(
      `SELECT h.*,
              COALESCE(s.cnt, 0) as used_channels
       FROM plc_hardware h
       LEFT JOIN (
         SELECT plc_hardware_id, COUNT(DISTINCT channel) as cnt
         FROM signals
         WHERE channel IS NOT NULL
           AND TRIM(channel) != ''
           AND (is_spare = 0 OR is_spare IS NULL)
           AND tag_name IS NOT NULL
           AND TRIM(tag_name) != ''
         GROUP BY plc_hardware_id
       ) s ON s.plc_hardware_id = h.id
       WHERE h.project_id = $1 AND h.panel_id = $2
       ORDER BY h.rack, h.slot, h.plc_name`,
      [selectedProject.id, selectedPanel.id]
    );
    setModules(rows);
  }, [selectedProject, selectedPanel]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

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

  const platform = selectedProject.plc_platform;
  const customConfig = {
    prefix: selectedProject.custom_address_prefix,
    pattern: selectedProject.custom_address_pattern,
  };

  const formatAddress = (
    rack: number,
    slot: number,
    channelType: ChannelType,
    channelNumber: number
  ) =>
    computePlcAddress(
      platform,
      { rack, slot, channelType, channelNumber },
      customConfig
    );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (m: PlcModule) => {
    setEditingId(m.id);
    setForm({
      plc_name: m.plc_name,
      rack: String(m.rack),
      slot: String(m.slot),
      module_type: m.module_type,
      channels: String(m.channels),
      channel_type: m.channel_type,
      module_category: m.module_category || "io",
      protocol: m.protocol || "",
      ip_address: m.ip_address || "",
      port: m.port != null ? String(m.port) : "",
      baud_rate: m.baud_rate != null ? String(m.baud_rate) : "",
      station_address: m.station_address != null ? String(m.station_address) : "",
      firmware_version: m.firmware_version || "",
    });
    setDialogOpen(true);
  };

  const handleCategoryChange = (category: ModuleCategory) => {
    const types = getModuleTypesForCategory(category);
    setForm((f) => ({
      ...f,
      module_category: category,
      module_type: types[0] || "",
      // Reset IO-specific fields for non-IO
      ...(category !== "io" ? { channels: "0", channel_type: "DI" as ChannelType } : {}),
      // Reset comm-specific fields for non-comm
      ...(category !== "communication" ? { protocol: "", baud_rate: "", station_address: "" } : {}),
    }));
  };

  const handleSave = async () => {
    const rack = parseInt(form.rack);
    const slot = parseInt(form.slot);
    const channels = form.module_category === "io" ? parseInt(form.channels) : 0;
    if (
      !form.plc_name.trim() ||
      !form.module_type ||
      isNaN(rack) ||
      isNaN(slot) ||
      (form.module_category === "io" && (isNaN(channels) || channels < 1))
    )
      return;

    const db = await getDatabase();
    const params = [
      form.plc_name.trim(),
      rack,
      slot,
      form.module_type,
      channels,
      form.module_category === "io" ? form.channel_type : "DI",
      form.module_category,
      form.module_category === "communication" && form.protocol ? form.protocol : null,
      form.ip_address.trim() || null,
      form.port ? parseInt(form.port) : null,
      form.module_category === "communication" && form.baud_rate ? parseInt(form.baud_rate) : null,
      form.module_category === "communication" && form.station_address ? parseInt(form.station_address) : null,
      form.firmware_version.trim() || null,
    ];

    const fieldValues: Record<string, string | number | null> = {
      plc_name: form.plc_name.trim(),
      rack,
      slot,
      module_type: form.module_type,
      channels,
      channel_type: form.module_category === "io" ? form.channel_type : "DI",
      module_category: form.module_category,
      protocol: form.module_category === "communication" && form.protocol ? form.protocol : null,
      ip_address: form.ip_address.trim() || null,
      port: form.port ? parseInt(form.port) : null,
      baud_rate: form.module_category === "communication" && form.baud_rate ? parseInt(form.baud_rate) : null,
      station_address: form.module_category === "communication" && form.station_address ? parseInt(form.station_address) : null,
      firmware_version: form.firmware_version.trim() || null,
    };

    if (editingId) {
      await trackedUpdateFields("plc_hardware", editingId, "plc_hardware", fieldValues);
    } else {
      const result = await db.execute(
        `INSERT INTO plc_hardware (project_id, panel_id, plc_name, rack, slot, module_type, channels, channel_type,
             module_category, protocol, ip_address, port, baud_rate, station_address, firmware_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [selectedProject.id, selectedPanel?.id ?? null, ...params]
      );
      const newId = result.lastInsertId;
      if (newId) {
        await trackedCreate("plc_hardware", newId, fieldValues);
      }
    }
    setDialogOpen(false);
    await loadModules();
  };

  const [deleteSignalCount, setDeleteSignalCount] = useState(0);

  // When delete confirm opens, count connected signals
  useEffect(() => {
    if (deleteConfirmId == null) {
      setDeleteSignalCount(0);
      return;
    }
    (async () => {
      const db = await getDatabase();
      const result = await db.select<{ cnt: number }[]>(
        `SELECT COUNT(*) as cnt FROM signals WHERE plc_hardware_id = $1`,
        [deleteConfirmId]
      );
      setDeleteSignalCount(result[0]?.cnt ?? 0);
    })();
  }, [deleteConfirmId]);

  const handleDelete = async (id: number) => {
    const db = await getDatabase();
    // Log and delete connected signals first
    const connectedSignals = await db.select<{ id: number }[]>(
      `SELECT id FROM signals WHERE plc_hardware_id = $1`, [id]
    );
    for (const sig of connectedSignals) {
      await trackedDelete("signal", sig.id, "signals");
    }
    await db.execute("DELETE FROM signals WHERE plc_hardware_id = $1", [id]);
    // Log and delete the module
    await trackedDelete("plc_hardware", id, "plc_hardware");
    await db.execute("DELETE FROM plc_hardware WHERE id = $1", [id]);
    setDeleteConfirmId(null);
    await loadModules();
  };

  // Check if rack/slot is already occupied by another module in this panel
  const slotConflict = useMemo(() => {
    const rack = parseInt(form.rack);
    const slot = parseInt(form.slot);
    if (isNaN(rack) || isNaN(slot)) return null;
    const conflict = modules.find(
      (m) => m.rack === rack && m.slot === slot && m.id !== editingId
    );
    if (!conflict) return null;
    return `Rack ${rack} / Slot ${slot} is already occupied by "${conflict.plc_name}" in this panel.`;
  }, [form.rack, form.slot, modules, editingId]);

  const isFormValid =
    form.plc_name.trim() &&
    form.module_type &&
    !isNaN(parseInt(form.rack)) &&
    !isNaN(parseInt(form.slot)) &&
    (form.module_category !== "io" || parseInt(form.channels) > 0) &&
    !slotConflict;

  const ioModules = modules.filter((m) => (m.module_category || "io") === "io");

  const summary = ioModules.reduce(
    (acc, m) => {
      acc[m.channel_type] = (acc[m.channel_type] || 0) + m.channels;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">PLC Hardware</h1>
            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {PLC_PLATFORM_LABELS[platform]}
            </span>
          </div>
          {ioModules.length > 0 && (
            <div className="mt-1 flex gap-3">
              {CHANNEL_TYPES.map(
                (ct) =>
                  summary[ct] && (
                    <span
                      key={ct}
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${CHANNEL_TYPE_COLORS[ct]}`}
                    >
                      {ct}: {summary[ct]}ch
                    </span>
                  )
              )}
            </div>
          )}
        </div>
        <Button onClick={openCreate} disabled={readOnly}>
          <Plus className="mr-2 h-4 w-4" />
          Add Module
        </Button>
      </div>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <Cpu className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No PLC modules defined</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first module to start configuring hardware.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PLC Name</TableHead>
                <TableHead className="w-16">Rack</TableHead>
                <TableHead className="w-16">Slot</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Module Type</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Address Range</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((m) => {
                const category = m.module_category || "io";
                const isIo = category === "io";
                const startAddr = isIo
                  ? formatAddress(m.rack, m.slot, m.channel_type, 0)
                  : null;
                const endAddr = isIo
                  ? formatAddress(m.rack, m.slot, m.channel_type, m.channels - 1)
                  : null;
                const categoryLabel = MODULE_CATEGORIES.find(
                  (c) => c.value === category
                )?.label;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.plc_name}
                    </TableCell>
                    <TableCell>{m.rack}</TableCell>
                    <TableCell>{m.slot}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[category]}`}
                      >
                        {categoryLabel}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        {m.module_type}
                        {m.protocol && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({m.protocol})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isIo ? (
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${CHANNEL_TYPE_COLORS[m.channel_type]}`}
                        >
                          {m.channel_type}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isIo ? (
                        <UtilizationBar
                          used={m.used_channels}
                          total={m.channels}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {isIo && startAddr && endAddr ? (
                        <>
                          {startAddr} – {endAddr}
                        </>
                      ) : m.ip_address ? (
                        <span>
                          {m.ip_address}
                          {m.port != null ? `:${m.port}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(m)}
                          disabled={readOnly}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmId(m.id)}
                          disabled={readOnly}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Module" : "Add Module"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="module_category">Module Category</Label>
              <Select
                value={form.module_category}
                onValueChange={(v) => handleCategoryChange(v as ModuleCategory)}
              >
                <SelectTrigger id="module_category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plc_name">PLC Name</Label>
              <Input
                id="plc_name"
                value={form.plc_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, plc_name: e.target.value }))
                }
                placeholder="PLC-01"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rack">Rack</Label>
                <Input
                  id="rack"
                  type="number"
                  min={0}
                  value={form.rack}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rack: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slot">Slot</Label>
                <Input
                  id="slot"
                  type="number"
                  min={0}
                  value={form.slot}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slot: e.target.value }))
                  }
                />
              </div>
            </div>
            {slotConflict && (
              <p className="text-xs text-destructive">{slotConflict}</p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="module_type">Module Type</Label>
              <Select
                value={form.module_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, module_type: v }))
                }
              >
                <SelectTrigger id="module_type">
                  <SelectValue placeholder="Select module type" />
                </SelectTrigger>
                <SelectContent>
                  {getModuleTypesForCategory(form.module_category).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* IO Module fields */}
            {form.module_category === "io" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="channels">Channel Count</Label>
                  <Input
                    id="channels"
                    type="number"
                    min={1}
                    value={form.channels}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, channels: e.target.value }))
                    }
                    placeholder="16"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="channel_type">Channel Type</Label>
                  <Select
                    value={form.channel_type}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        channel_type: v as ChannelType,
                      }))
                    }
                  >
                    <SelectTrigger id="channel_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_TYPES.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {ct}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Communication Module fields */}
            {form.module_category === "communication" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="protocol">Protocol</Label>
                  <Select
                    value={form.protocol}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, protocol: v }))
                    }
                  >
                    <SelectTrigger id="protocol">
                      <SelectValue placeholder="Select protocol" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="ip_address">IP Address</Label>
                    <Input
                      id="ip_address"
                      value={form.ip_address}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ip_address: e.target.value }))
                      }
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={form.port}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, port: e.target.value }))
                      }
                      placeholder="502"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="baud_rate">Baud Rate</Label>
                    <Input
                      id="baud_rate"
                      type="number"
                      value={form.baud_rate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, baud_rate: e.target.value }))
                      }
                      placeholder="9600"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="station_address">Station Address</Label>
                    <Input
                      id="station_address"
                      type="number"
                      value={form.station_address}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          station_address: e.target.value,
                        }))
                      }
                      placeholder="1"
                    />
                  </div>
                </div>
              </>
            )}

            {/* CPU / Processor fields */}
            {form.module_category === "cpu" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firmware_version">Firmware Version</Label>
                    <Input
                      id="firmware_version"
                      value={form.firmware_version}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          firmware_version: e.target.value,
                        }))
                      }
                      placeholder="V4.5"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ip_address">IP Address</Label>
                    <Input
                      id="ip_address"
                      value={form.ip_address}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ip_address: e.target.value }))
                      }
                      placeholder="192.168.1.1"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!isFormValid}>
              {editingId ? "Save Changes" : "Add Module"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Module</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>This will permanently remove the module. This action cannot be undone.</p>
            {deleteSignalCount > 0 && (
              <p className="font-medium text-destructive">
                {deleteSignalCount} signal{deleteSignalCount !== 1 ? "s" : ""} connected
                to this module will also be deleted.
              </p>
            )}
          </div>
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
    </div>
  );
}
