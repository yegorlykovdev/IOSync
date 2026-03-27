import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "@/contexts/ProjectContext";
import { usePanel } from "@/contexts/PanelContext";
import { getDatabase } from "@/db/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Users,
  Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface Revision {
  id: number;
  project_id: number;
  entity_type: string;
  entity_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
}

/** A group of field changes on the same entity at the same time by the same user */
interface ChangeGroup {
  key: string;
  entity_type: string;
  entity_id: number;
  changed_by: string | null;
  changed_at: string;
  action: "create" | "update" | "delete";
  fields: { field: string; old_value: string | null; new_value: string | null }[];
  /** Resolved entity label (e.g. tag name, module name) */
  entityLabel: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts + "Z");
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatDate(ts: string): string {
  try {
    const d = new Date(ts + "Z");
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return ts;
  }
}

function dateKey(ts: string): string {
  try {
    const d = new Date(ts + "Z");
    return d.toISOString().slice(0, 10);
  } catch {
    return ts.slice(0, 10);
  }
}

function changeAction(rev: Revision): "create" | "delete" | "update" {
  if (rev.old_value == null && rev.new_value != null) return "create";
  if (rev.old_value != null && rev.new_value == null) return "delete";
  return "update";
}

const ACTION_STYLES: Record<string, { label: string; className: string; dotColor: string }> = {
  create: { label: "Created", className: "bg-green-500/15 text-green-700 dark:text-green-400", dotColor: "bg-green-500" },
  update: { label: "Updated", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400", dotColor: "bg-blue-500" },
  delete: { label: "Deleted", className: "bg-red-500/15 text-red-700 dark:text-red-400", dotColor: "bg-red-500" },
};

const ENTITY_STYLES: Record<string, { label: string; className: string; route: string | null }> = {
  signal: { label: "Signal", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400", route: null },
  plc_hardware: { label: "PLC Hardware", className: "bg-purple-500/15 text-purple-700 dark:text-purple-400", route: null },
  cable: { label: "Cable", className: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400", route: null },
  panel: { label: "Panel", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400", route: "/panels" },
};

/** Human-readable field label */
const FIELD_LABELS: Record<string, string> = {
  plc_name: "Module Name",
  plc_hardware_id: "Module",
  tag_name: "Tag Name",
  io_type: "IO Type",
  signal_spec: "Signal Spec",
  pre_assigned_address: "PLC Address",
  card_part_number: "Card P/N",
  plc_panel: "PLC Panel",
  module_type: "Module Type",
  module_category: "Category",
  channel_type: "Channel Type",
  is_spare: "Spare",
  signal_low: "Signal Low",
  signal_high: "Signal High",
  range_units: "Range Units",
  state_description: "State Description",
  history_enabled: "History Enabled",
  alarm_severity: "Alarm Severity",
  alarm_priority: "Alarm Priority",
  firmware_version: "Firmware",
  ip_address: "IP Address",
  baud_rate: "Baud Rate",
  station_address: "Station Address",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(val: string | null, max = 50): string {
  if (val == null) return "—";
  return val.length > max ? val.slice(0, max) + "…" : val;
}

const PAGE_SIZE = 30;

// ── Group revisions ────────────────────────────────────────────────────

function groupRevisions(revisions: Revision[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const map = new Map<string, ChangeGroup>();

  for (const rev of revisions) {
    // Group by entity + timestamp + user (same second = same operation)
    const key = `${rev.entity_type}:${rev.entity_id}:${rev.changed_at}:${rev.changed_by}`;
    let group = map.get(key);
    if (!group) {
      const action = changeAction(rev);
      group = {
        key,
        entity_type: rev.entity_type,
        entity_id: rev.entity_id,
        changed_by: rev.changed_by,
        changed_at: rev.changed_at,
        action,
        fields: [],
        entityLabel: null,
      };
      map.set(key, group);
      groups.push(group);
    }

    group.fields.push({
      field: rev.field_name,
      old_value: rev.old_value,
      new_value: rev.new_value,
    });

    // Try to extract a meaningful label from the change data
    if (rev.field_name === "tag_name" && rev.new_value) {
      group.entityLabel = rev.new_value;
    } else if (rev.field_name === "plc_name" && rev.new_value) {
      group.entityLabel = rev.new_value;
    }
  }

  return groups;
}

// ── Resolve entity labels from DB ──────────────────────────────────────

async function resolveLabels(groups: ChangeGroup[]): Promise<Map<string, string>> {
  const db = await getDatabase();
  const labels = new Map<string, string>();

  const signalIds = [...new Set(groups.filter((g) => g.entity_type === "signal").map((g) => g.entity_id))];
  const hwIds = [...new Set(groups.filter((g) => g.entity_type === "plc_hardware").map((g) => g.entity_id))];

  if (signalIds.length > 0) {
    const placeholders = signalIds.map((_, i) => `$${i + 1}`).join(",");
    const rows = await db.select<{ id: number; tag_name: string | null; io_type: string; item_number: number | null }[]>(
      `SELECT id, tag_name, io_type, item_number FROM signals WHERE id IN (${placeholders})`,
      signalIds
    );
    for (const r of rows) {
      labels.set(`signal:${r.id}`, r.tag_name || `${r.io_type} #${r.item_number ?? r.id}`);
    }
  }

  if (hwIds.length > 0) {
    const placeholders = hwIds.map((_, i) => `$${i + 1}`).join(",");
    const rows = await db.select<{ id: number; plc_name: string; rack: number; slot: number }[]>(
      `SELECT id, plc_name, rack, slot FROM plc_hardware WHERE id IN (${placeholders})`,
      hwIds
    );
    for (const r of rows) {
      labels.set(`plc_hardware:${r.id}`, `${r.plc_name} (R${r.rack}S${r.slot})`);
    }
  }

  return labels;
}

// ── Page ───────────────────────────────────────────────────────────────

export function RevisionsPage() {
  const { selectedProject } = useProject();
  const { selectedPanel } = usePanel();
  const navigate = useNavigate();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [entityLabels, setEntityLabels] = useState<Map<string, string>>(new Map());
  const [page, setPage] = useState(0);
  const [searchFilter, setSearchFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [changeFilter, setChangeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadRevisions = useCallback(async () => {
    if (!selectedProject) return;
    const db = await getDatabase();
    if (selectedPanel) {
      // Panel-scoped: show only revisions for this panel
      const rows = await db.select<Revision[]>(
        `SELECT * FROM revisions WHERE project_id = $1 AND panel_id = $2 ORDER BY changed_at DESC, id DESC`,
        [selectedProject.id, selectedPanel.id]
      );
      setRevisions(rows);
    } else {
      // Project-scoped: show all revisions
      const rows = await db.select<Revision[]>(
        `SELECT * FROM revisions WHERE project_id = $1 ORDER BY changed_at DESC, id DESC`,
        [selectedProject.id]
      );
      setRevisions(rows);
    }
  }, [selectedProject, selectedPanel]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  // Group revisions
  const groups = useMemo(() => groupRevisions(revisions), [revisions]);

  // Resolve labels when groups change
  useEffect(() => {
    if (groups.length === 0) return;
    resolveLabels(groups).then(setEntityLabels);
  }, [groups]);

  // Unique users and entity types
  const users = useMemo(
    () => [...new Set(revisions.map((r) => r.changed_by).filter(Boolean))].sort() as string[],
    [revisions]
  );
  const entityTypes = useMemo(
    () => [...new Set(revisions.map((r) => r.entity_type))].sort(),
    [revisions]
  );

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [searchFilter, entityFilter, changeFilter, userFilter]);

  // Filter groups
  const filtered = useMemo(() => {
    let result = groups;

    if (entityFilter !== "all") {
      result = result.filter((g) => g.entity_type === entityFilter);
    }
    if (changeFilter !== "all") {
      result = result.filter((g) => g.action === changeFilter);
    }
    if (userFilter !== "all") {
      result = result.filter((g) => g.changed_by === userFilter);
    }
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      result = result.filter((g) => {
        const label = g.entityLabel || entityLabels.get(`${g.entity_type}:${g.entity_id}`) || "";
        return (
          label.toLowerCase().includes(q) ||
          g.entity_type.toLowerCase().includes(q) ||
          (g.changed_by ?? "").toLowerCase().includes(q) ||
          g.fields.some(
            (f) =>
              f.field.toLowerCase().includes(q) ||
              (f.old_value ?? "").toLowerCase().includes(q) ||
              (f.new_value ?? "").toLowerCase().includes(q)
          )
        );
      });
    }

    return result;
  }, [groups, entityFilter, changeFilter, userFilter, searchFilter, entityLabels]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Group page data by date for timeline separators
  const dayGroups = useMemo(() => {
    const map = new Map<string, ChangeGroup[]>();
    for (const g of pageData) {
      const dk = dateKey(g.changed_at);
      const arr = map.get(dk) ?? [];
      arr.push(g);
      map.set(dk, arr);
    }
    return [...map.entries()];
  }, [pageData]);

  const toggleExpand = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Revisions</h1>

        <Badge variant="secondary" className="text-xs">
          {revisions.length} change{revisions.length !== 1 && "s"}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {groups.length} event{groups.length !== 1 && "s"}
        </Badge>

        {filtered.length !== groups.length && (
          <Badge variant="outline" className="text-xs">
            {filtered.length} shown
          </Badge>
        )}

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

        {users.length > 1 && (
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Users className="mr-1 h-3 w-3" />
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <Layers className="mr-1 h-3 w-3" />
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {ENTITY_STYLES[t]?.label ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={changeFilter} onValueChange={setChangeFilter}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Created</SelectItem>
            <SelectItem value="update">Updated</SelectItem>
            <SelectItem value="delete">Deleted</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadRevisions}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Timeline */}
      {revisions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">No changes recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Changes to signals and PLC hardware will appear here automatically.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">No matching changes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto">
            {dayGroups.map(([day, dayItems]) => (
              <div key={day} className="mb-4">
                {/* Day header */}
                <div className="sticky top-0 z-10 mb-2 bg-background/95 backdrop-blur-sm">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDate(day)}
                  </h2>
                  <div className="mt-1 h-px bg-border" />
                </div>

                {/* Timeline entries */}
                <div className="relative ml-3 border-l border-border pl-6">
                  {dayItems.map((group) => {
                    const as = ACTION_STYLES[group.action];
                    const es = ENTITY_STYLES[group.entity_type] ?? {
                      label: group.entity_type,
                      className: "bg-muted text-muted-foreground",
                      route: "",
                    };
                    const label =
                      group.entityLabel ||
                      entityLabels.get(`${group.entity_type}:${group.entity_id}`) ||
                      `#${group.entity_id}`;
                    const isExpanded = expandedGroups.has(group.key);
                    const hasMultipleFields = group.fields.length > 1;

                    return (
                      <div key={group.key} className="relative mb-3">
                        {/* Timeline dot */}
                        <div className={`absolute -left-[30.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${as.dotColor}`} />

                        {/* Card */}
                        <div className="rounded-lg border bg-card p-3">
                          {/* Header row */}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {formatTimestamp(group.changed_at)}
                            </span>
                            <span className="font-medium">{group.changed_by ?? "unknown"}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${as.className}`}>
                              {as.label}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${es.className}`}>
                              {es.label}
                            </span>

                            {es.route && (
                              <button
                                className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                onClick={() => navigate(es.route!)}
                                title={`Go to ${es.label}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          {/* Summary line */}
                          <div className="mt-1.5 text-sm">
                            {group.action === "create" && (
                              <span>
                                Created <span className="font-medium">{label}</span>
                                {group.fields.length > 0 && (
                                  <span className="text-muted-foreground"> with {group.fields.length} field{group.fields.length !== 1 && "s"}</span>
                                )}
                              </span>
                            )}
                            {group.action === "delete" && (
                              <span>
                                Deleted <span className="font-medium">{label}</span>
                                {group.fields.length > 0 && (
                                  <span className="text-muted-foreground"> ({group.fields.length} field{group.fields.length !== 1 && "s"} removed)</span>
                                )}
                              </span>
                            )}
                            {group.action === "update" && group.fields.length === 1 && (
                              <span>
                                <span className="font-medium">{label}</span>
                                {": "}
                                <span className="text-muted-foreground">{fieldLabel(group.fields[0].field)}</span>
                                {" changed from "}
                                <span className="rounded bg-red-500/10 px-1 font-mono text-xs text-red-700 dark:text-red-400">
                                  {truncate(group.fields[0].old_value, 30)}
                                </span>
                                {" to "}
                                <span className="rounded bg-green-500/10 px-1 font-mono text-xs text-green-700 dark:text-green-400">
                                  {truncate(group.fields[0].new_value, 30)}
                                </span>
                              </span>
                            )}
                            {group.action === "update" && group.fields.length > 1 && (
                              <span>
                                <span className="font-medium">{label}</span>
                                <span className="text-muted-foreground">
                                  {": "}{group.fields.length} field{group.fields.length !== 1 && "s"} updated
                                </span>
                              </span>
                            )}
                          </div>

                          {/* Expandable field details */}
                          {hasMultipleFields && (
                            <button
                              className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => toggleExpand(group.key)}
                            >
                              {isExpanded ? "Hide details" : "Show details"}
                            </button>
                          )}

                          {((hasMultipleFields && isExpanded) || group.action === "create" || group.action === "delete") && group.fields.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              {group.fields.map((f, i) => (
                                <div key={i} className="flex items-baseline gap-2 text-xs">
                                  <span className="w-[140px] shrink-0 truncate font-mono text-muted-foreground" title={f.field}>
                                    {fieldLabel(f.field)}
                                  </span>
                                  {group.action === "create" ? (
                                    <span className="text-green-700 dark:text-green-400" title={f.new_value ?? undefined}>
                                      {truncate(f.new_value, 60)}
                                    </span>
                                  ) : group.action === "delete" ? (
                                    <span className="text-red-700 dark:text-red-400 line-through" title={f.old_value ?? undefined}>
                                      {truncate(f.old_value, 60)}
                                    </span>
                                  ) : (
                                    <>
                                      <span className="text-red-700 dark:text-red-400 line-through" title={f.old_value ?? undefined}>
                                        {truncate(f.old_value, 30)}
                                      </span>
                                      <span className="text-muted-foreground">&rarr;</span>
                                      <span className="text-green-700 dark:text-green-400" title={f.new_value ?? undefined}>
                                        {truncate(f.new_value, 30)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>
                Page {page + 1} of {totalPages} ({filtered.length} events)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
