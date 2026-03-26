/**
 * Cable Schedule Generation from IO List signals.
 *
 * Simple rule: one 3-core cable per hardwired signal that is not a spare
 * and has a tag name. SoftComm signals are excluded (no physical cable).
 *
 * Signals are considered spare if:
 *   - is_spare flag is set, OR
 *   - tag_name is empty/null, OR
 *   - description contains "spare" (case-insensitive)
 *
 * Deterministic & idempotent: only processes signals with cable_id IS NULL,
 * so re-running safely adds cables for newly unassigned signals without
 * duplicating existing ones.
 *
 * After generation, engineers can rearrange / group cables as needed.
 */

import { getDatabase } from "@/db/database";

// ── Constants ───────────────────────────────────────────────────────────

/** Every hardwired signal gets a 3-core cable */
const CORES_PER_CABLE = 3;

/** Map IO type → cable type */
const IO_TYPE_TO_CABLE_TYPE: Record<string, string> = {
  DI: "Control",
  DO: "Control",
  AI: "Instrumentation",
  AO: "Instrumentation",
  RTD: "Instrumentation",
  TC: "Thermocouple",
};

// ── Types ───────────────────────────────────────────────────────────────

interface SignalRow {
  id: number;
  io_type: string;
  tag_name: string | null;
  description: string | null;
  plc_panel: string | null;
  field_device_tag: string | null;
}

export interface GenerationResult {
  cablesCreated: number;
  coresCreated: number;
  signalsLinked: number;
  skippedAlreadyAssigned: number;
  skippedSpare: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildCableTag(seq: number): string {
  return `CB-${String(seq).padStart(3, "0")}`;
}

/** Check if a signal should be treated as spare / excluded */
function isSpareSignal(sig: SignalRow): boolean {
  if (!sig.tag_name || !sig.tag_name.trim()) return true;
  if (sig.description && /spare/i.test(sig.description)) return true;
  return false;
}

// ── Generation ──────────────────────────────────────────────────────────

/**
 * Generate Cable Schedule records for a project.
 * One 3-core cable per eligible hardwired signal.
 */
export async function generateCableSchedule(
  projectId: number,
  username: string
): Promise<GenerationResult> {
  const db = await getDatabase();

  // Fetch all non-spare, non-SoftComm signals that have NO cable assigned
  const candidates = await db.select<SignalRow[]>(
    `SELECT id, io_type, tag_name, description, plc_panel, field_device_tag
     FROM signals
     WHERE project_id = $1
       AND (is_spare = 0 OR is_spare IS NULL)
       AND io_type != 'SoftComm'
       AND cable_id IS NULL
     ORDER BY sort_order, item_number, id`,
    [projectId]
  );

  // Count already-assigned for reporting
  const totalRows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM signals
     WHERE project_id = $1
       AND (is_spare = 0 OR is_spare IS NULL)
       AND io_type != 'SoftComm'`,
    [projectId]
  );
  const skippedAlreadyAssigned = (totalRows[0]?.cnt ?? 0) - candidates.length;

  // Find highest existing CB-NNN tag number
  const existing = await db.select<{ cable_tag: string }[]>(
    `SELECT cable_tag FROM cables WHERE project_id = $1`,
    [projectId]
  );
  let maxSeq = 0;
  for (const row of existing) {
    const m = row.cable_tag.match(/^CB-(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }

  let seq = maxSeq + 1;
  let cablesCreated = 0;
  let coresCreated = 0;
  let signalsLinked = 0;
  let skippedSpare = 0;

  for (const sig of candidates) {
    // Skip signals that look like spares (no tag name, or "spare" in description)
    if (isSpareSignal(sig)) {
      skippedSpare++;
      continue;
    }

    const cableTag = buildCableTag(seq);
    const cableType = IO_TYPE_TO_CABLE_TYPE[sig.io_type] ?? "Control";

    // Insert cable
    const result = await db.execute(
      `INSERT INTO cables (project_id, cable_tag, cable_type, core_count,
         from_location, to_device, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        projectId,
        cableTag,
        cableType,
        CORES_PER_CABLE,
        sig.plc_panel || null,
        sig.field_device_tag || null,
        `${sig.tag_name} — ${sig.io_type}`,
      ]
    );

    const cableId = result.lastInsertId;
    if (!cableId) continue;

    // Revision log
    await db.execute(
      `INSERT INTO revisions (project_id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
       VALUES ($1, 'cable', $2, 'cable_tag', NULL, $3, $4)`,
      [projectId, cableId, cableTag, username]
    );

    // Create 3 cable_core rows: core 1 linked to signal, cores 2-3 spare
    await db.execute(
      `INSERT INTO cable_cores (cable_id, core_number, signal_id, notes) VALUES ($1, 1, $2, $3)`,
      [cableId, sig.id, sig.tag_name]
    );
    await db.execute(
      `INSERT INTO cable_cores (cable_id, core_number, notes) VALUES ($1, 2, 'Spare')`,
      [cableId]
    );
    await db.execute(
      `INSERT INTO cable_cores (cable_id, core_number, notes) VALUES ($1, 3, 'Spare')`,
      [cableId]
    );
    coresCreated += 3;

    // Link signal → cable
    await db.execute(
      `UPDATE signals SET cable_id = $1, updated_at = datetime('now') WHERE id = $2`,
      [cableId, sig.id]
    );

    cablesCreated++;
    signalsLinked++;
    seq++;
  }

  return { cablesCreated, coresCreated, signalsLinked, skippedAlreadyAssigned, skippedSpare };
}
