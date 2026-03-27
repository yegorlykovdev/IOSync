import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel, type CreatePanelData } from "@/contexts/PanelContext";
import { duplicatePanel, type DuplicateResult } from "@/lib/duplicate-panel";
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
import { Plus, Pencil, Trash2, Copy, PanelTop, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface FormState {
  panel_name: string;
  panel_description: string;
  location: string;
}

const EMPTY_FORM: FormState = {
  panel_name: "",
  panel_description: "",
  location: "",
};

// ── Page ───────────────────────────────────────────────────────────────

export function PanelsPage() {
  const { selectedProject, readOnly } = useProject();
  const { panels, createPanel, updatePanel, deletePanel, refreshPanels } = usePanel();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Duplicate state
  const [duplicateSourceId, setDuplicateSourceId] = useState<number | null>(null);
  const [duplicateForm, setDuplicateForm] = useState<FormState>(EMPTY_FORM);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);

  // ── Dialog handlers ─────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (panel: { id: number; panel_name: string; panel_description: string | null; location: string | null }) => {
    setEditingId(panel.id);
    setForm({
      panel_name: panel.panel_name,
      panel_description: panel.panel_description ?? "",
      location: panel.location ?? "",
    });
    setDialogOpen(true);
  };

  const openDuplicateDialog = (panel: { id: number; panel_name: string; panel_description: string | null; location: string | null }) => {
    setDuplicateSourceId(panel.id);
    setDuplicateForm({
      panel_name: `${panel.panel_name} (Copy)`,
      panel_description: panel.panel_description ?? "",
      location: panel.location ?? "",
    });
    setDuplicateResult(null);
  };

  const handleSave = async () => {
    if (!form.panel_name.trim()) return;
    const data: CreatePanelData = {
      panel_name: form.panel_name.trim(),
      panel_description: form.panel_description.trim() || undefined,
      location: form.location.trim() || undefined,
    };
    if (editingId) {
      await updatePanel(editingId, data);
    } else {
      await createPanel(data);
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: number) => {
    await deletePanel(id);
    setDeleteConfirmId(null);
  };

  const handleDuplicate = async () => {
    if (!selectedProject || !duplicateSourceId || !duplicateForm.panel_name.trim()) return;
    setDuplicating(true);
    try {
      const result = await duplicatePanel(
        duplicateSourceId,
        selectedProject.id,
        duplicateForm.panel_name.trim(),
        duplicateForm.panel_description.trim() || null,
        duplicateForm.location.trim() || null
      );
      setDuplicateResult(result);
      await refreshPanels();
    } catch (err) {
      console.error("Panel duplication failed:", err);
    } finally {
      setDuplicating(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

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
        <h1 className="mr-2 text-xl font-semibold">Panels</h1>

        <Badge variant="secondary" className="text-xs">
          {panels.length} panel{panels.length !== 1 && "s"}
        </Badge>

        <div className="flex-1" />

        <Button size="sm" className="h-8 text-xs" onClick={openAddDialog} disabled={readOnly}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Panel
        </Button>
      </div>

      {/* Table */}
      {panels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <PanelTop className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">No panels yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Add Panel" to create your first panel.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="px-3 py-2 text-xs">Panel Name</TableHead>
                <TableHead className="px-3 py-2 text-xs">Description</TableHead>
                <TableHead className="px-3 py-2 text-xs">Location</TableHead>
                <TableHead className="w-[80px] px-3 py-2 text-xs text-center">Signals</TableHead>
                <TableHead className="w-[80px] px-3 py-2 text-xs text-center">Cables</TableHead>
                <TableHead className="w-[120px] px-3 py-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels.map((panel) => (
                <TableRow
                  key={panel.id}
                  className="cursor-pointer hover:bg-accent/30"
                  onClick={() => navigate(`/panels/${panel.id}`)}
                >
                  <TableCell className="px-3 py-2 text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {panel.panel_name}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground max-w-[300px] truncate">
                    {panel.panel_description ?? "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    {panel.location ?? "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-center">
                    {panel.signal_count > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">{panel.signal_count}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-center">
                    {panel.cable_count > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">{panel.cable_count}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="rounded p-1 hover:bg-accent disabled:opacity-30"
                        onClick={() => openDuplicateDialog(panel)}
                        disabled={readOnly}
                        title="Duplicate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded p-1 hover:bg-accent disabled:opacity-30"
                        onClick={() => openEditDialog(panel)}
                        disabled={readOnly}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                        onClick={() => setDeleteConfirmId(panel.id)}
                        disabled={readOnly}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Panel" : "Add Panel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Panel Name *</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.panel_name}
                onChange={(e) => setForm((f) => ({ ...f, panel_name: e.target.value }))}
                placeholder="e.g. MCC-01"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.panel_description}
                onChange={(e) => setForm((f) => ({ ...f, panel_description: e.target.value }))}
                placeholder="e.g. Motor Control Center 1"
              />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Building A, Room 101"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={!form.panel_name.trim()}>
              {editingId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog
        open={duplicateSourceId !== null}
        onOpenChange={(open) => { if (!open) { setDuplicateSourceId(null); setDuplicateResult(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Panel</DialogTitle>
          </DialogHeader>
          {duplicateResult ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Panel duplicated successfully.
              </p>
              <div className="rounded-md bg-secondary/50 p-3 text-xs space-y-1">
                <p>{duplicateResult.hardwareCopied} PLC hardware module{duplicateResult.hardwareCopied !== 1 ? "s" : ""}</p>
                <p>{duplicateResult.signalsCopied} signal{duplicateResult.signalsCopied !== 1 ? "s" : ""}</p>
                <p>{duplicateResult.cablesCopied} cable{duplicateResult.cablesCopied !== 1 ? "s" : ""} ({duplicateResult.coresCopied} core{duplicateResult.coresCopied !== 1 ? "s" : ""})</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This will create a new independent panel with a copy of all PLC Hardware, IO List signals, and Cable Schedule data.
              </p>
              <div>
                <Label className="text-xs">New Panel Name *</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={duplicateForm.panel_name}
                  onChange={(e) => setDuplicateForm((f) => ({ ...f, panel_name: e.target.value }))}
                  placeholder="e.g. MCC-02"
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={duplicateForm.panel_description}
                  onChange={(e) => setDuplicateForm((f) => ({ ...f, panel_description: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={duplicateForm.location}
                  onChange={(e) => setDuplicateForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{duplicateResult ? "Close" : "Cancel"}</Button>
            </DialogClose>
            {!duplicateResult && (
              <Button
                onClick={handleDuplicate}
                disabled={!duplicateForm.panel_name.trim() || duplicating}
              >
                {duplicating ? "Duplicating..." : "Duplicate"}
              </Button>
            )}
            {duplicateResult && (
              <Button
                onClick={() => {
                  setDuplicateSourceId(null);
                  setDuplicateResult(null);
                  navigate(`/panels/${duplicateResult.newPanelId}`);
                }}
              >
                Open New Panel
              </Button>
            )}
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
            <DialogTitle>Delete Panel</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will delete the panel. Signals and cables assigned to this panel will be unlinked (not deleted). This action cannot be undone.
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
