import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { getDatabase } from "@/db/database";
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

interface PlcModule {
  id: number;
  project_id: number;
  plc_name: string;
  rack: number;
  slot: number;
  module_type: string;
  channels: number;
  channel_type: ChannelType;
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

const MODULE_TYPES = [
  "Digital Input",
  "Digital Output",
  "Analog Input",
  "Analog Output",
  "Mixed IO",
  "Communication",
  "Power Supply",
  "CPU",
  "Other",
];

interface FormState {
  plc_name: string;
  rack: string;
  slot: string;
  module_type: string;
  channels: string;
  channel_type: ChannelType;
}

const EMPTY_FORM: FormState = {
  plc_name: "",
  rack: "0",
  slot: "",
  module_type: "",
  channels: "",
  channel_type: "DI",
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
  const [modules, setModules] = useState<ModuleUtilization[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const loadModules = useCallback(async () => {
    if (!selectedProject) return;
    const db = await getDatabase();
    const rows = await db.select<(PlcModule & { used_channels: number })[]>(
      `SELECT h.*,
              COALESCE(s.cnt, 0) as used_channels
       FROM plc_hardware h
       LEFT JOIN (
         SELECT plc_hardware_id, COUNT(*) as cnt
         FROM signals
         GROUP BY plc_hardware_id
       ) s ON s.plc_hardware_id = h.id
       WHERE h.project_id = $1
       ORDER BY h.plc_name, h.rack, h.slot`,
      [selectedProject.id]
    );
    setModules(rows);
  }, [selectedProject]);

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
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const rack = parseInt(form.rack);
    const slot = parseInt(form.slot);
    const channels = parseInt(form.channels);
    if (
      !form.plc_name.trim() ||
      !form.module_type ||
      isNaN(rack) ||
      isNaN(slot) ||
      isNaN(channels) ||
      channels < 1
    )
      return;

    const db = await getDatabase();
    if (editingId) {
      await db.execute(
        `UPDATE plc_hardware
         SET plc_name=$1, rack=$2, slot=$3, module_type=$4, channels=$5, channel_type=$6
         WHERE id=$7`,
        [
          form.plc_name.trim(),
          rack,
          slot,
          form.module_type,
          channels,
          form.channel_type,
          editingId,
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO plc_hardware (project_id, plc_name, rack, slot, module_type, channels, channel_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          selectedProject.id,
          form.plc_name.trim(),
          rack,
          slot,
          form.module_type,
          channels,
          form.channel_type,
        ]
      );
    }
    setDialogOpen(false);
    await loadModules();
  };

  const handleDelete = async (id: number) => {
    const db = await getDatabase();
    await db.execute("DELETE FROM plc_hardware WHERE id = $1", [id]);
    setDeleteConfirmId(null);
    await loadModules();
  };

  const isFormValid =
    form.plc_name.trim() &&
    form.module_type &&
    !isNaN(parseInt(form.rack)) &&
    !isNaN(parseInt(form.slot)) &&
    parseInt(form.channels) > 0;

  const summary = modules.reduce(
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
          {modules.length > 0 && (
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
                <TableHead>Module Type</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Address Range</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((m) => {
                const startAddr = formatAddress(
                  m.rack,
                  m.slot,
                  m.channel_type,
                  0
                );
                const endAddr = formatAddress(
                  m.rack,
                  m.slot,
                  m.channel_type,
                  m.channels - 1
                );
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.plc_name}
                    </TableCell>
                    <TableCell>{m.rack}</TableCell>
                    <TableCell>{m.slot}</TableCell>
                    <TableCell>{m.module_type}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${CHANNEL_TYPE_COLORS[m.channel_type]}`}
                      >
                        {m.channel_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <UtilizationBar
                        used={m.used_channels}
                        total={m.channels}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {startAddr} – {endAddr}
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
                  {MODULE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <p className="text-sm text-muted-foreground">
            This will remove the module and unlink any signals assigned to it.
            This action cannot be undone.
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
    </div>
  );
}
