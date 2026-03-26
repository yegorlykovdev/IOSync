/**
 * Cable Schedule Generation from IO List signals.
 *
 * Groups signals into cable candidates using a priority-based grouping:
 *   1. field_device_tag — if populated, signals sharing the same device go together
 *   2. description prefix — extracts the equipment name before the last separator
 *      e.g. "Chiller 2 - Setpoint" and "Chiller 2 - Feedback" both → "Chiller 2"
 *   3. plc_panel — fallback if neither device tag nor description is set
 *
 * Each group is further sub-grouped by plc_panel (source side) so that signals
 * from different panels going to the same equipment produce separate cables.
 *
 * Deterministic & idempotent: only processes signals with cable_id IS NULL,
 * so re-running safely adds cables for newly unassigned signals without
 * duplicating existing ones.
 */

import { getDatabase } from "@/db/database";

// ── Constants ───────────────────────────────────────────────────────────

/** Cores required per signal IO type (accounts for signal + return wires) */
const CORES_PER_IO_TYPE: Record<string, number> = {
  DI: 1, // digital shares common return in cable
  DO: 1,
  AI: 2, // 4-20mA signal + return
  AO: 2,
  RTD: 3, // 3-wire RTD
  TC: 2, // thermocouple twisted pair
};
const DEFAULT_CORES_PER_SIGNAL = 1;

/** Spare core percentage (V1 default) */
const SPARE_CORE_PERCENT = 0.2; // 20%
const MIN_SPARE_CORES = 1;

/** Standard cable core counts — pick the nearest size >= required */
const STANDARD_CORE_SIZES = [
  2, 3, 4, 5, 7, 10, 12, 15, 19, 24, 27, 30, 37, 44, 50,
];

/** Map dominant IO type in a group → cable type */
const IO_TYPE_TO_CABLE_TYPE: Record<string, string> = {
  DI: "Control",
  DO: "Control",
  AI: "Instrumentation",
  AO: "Instrumentation",
  RTD: "RTD",
  TC: "Thermocouple",
  SoftComm: "Communication",
};

/**
 * Common separators between equipment name and signal detail in descriptions.
 * We split on the LAST occurrence so "AHU 1 - Zone 2 - Temp" → "AHU 1 - Zone 2".
 */
const DESCRIPTION_SEPARATORS = /\s+[-–—:]\s+/;

// ── Types ───────────────────────────────────────────────────────────────

interface SignalRow {
  id: number;
  io_type: string;
  description: string | null;
  plc_panel: string | null;
  field_device_tag: string | null;
  tag_name: string | null;
}

export interface CableCandidate {
  groupKey: string;
  cableTag: string;
  cableType: string;
  fromLocation: string; // plc_panel
  toDevice: string; // equipment name derived from grouping
  signalIds: number[];
  signalCores: number; // cores needed for signals
  spareCores: number;
  totalCores: number; // after spare + rounding to standard
}

export interface GenerationResult {
  cablesCreated: number;
  coresCreated: number;
  signalsLinked: number;
  skippedAlreadyAssigned: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function coresForSignal(ioType: string): number {
  return CORES_PER_IO_TYPE[ioType] ?? DEFAULT_CORES_PER_SIGNAL;
}

/** Round up to the nearest standard cable core size */
function roundToStandardCoreSize(needed: number): number {
  for (const size of STANDARD_CORE_SIZES) {
    if (size >= needed) return size;
  }
  return needed;
}

/**
 * Extract the equipment/device prefix from a signal description.
 *
 * Splits on the last separator ( - , – , — , : ) and returns the left side.
 * Examples:
 *   "Chiller 2 - Setpoint"          → "Chiller 2"
 *   "Chiller 2 - Feedback"          → "Chiller 2"
 *   "AHU 1 - Zone 2 - Temperature"  → "AHU 1 - Zone 2"
 *   "Pump 3"                         → "Pump 3"  (no separator → use whole string)
 *   ""                               → null
 */
export function extractEquipmentPrefix(description: string | null): string | null {
  if (!description) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;

  // Find the last separator position
  let lastSepStart = -1;
  const re = new RegExp(DESCRIPTION_SEPARATORS.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    lastSepStart = match.index;
  }

  if (lastSepStart <= 0) {
    // No separator found — use the full description as the group
    return trimmed;
  }

  const prefix = trimmed.substring(0, lastSepStart).trim();
  return prefix || trimmed;
}

/** Determine cable type from the dominant IO type in the group */
function determineCableType(signals: SignalRow[]): string {
  const typeCounts: Record<string, number> = {};
  for (const s of signals) {
    typeCounts[s.io_type] = (typeCounts[s.io_type] ?? 0) + 1;
  }
  let dominant = signals[0].io_type;
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = type;
    }
  }
  return IO_TYPE_TO_CABLE_TYPE[dominant] ?? "Control";
}

/** Build a deterministic cable tag: CB-{seq:3} */
function buildCableTag(seq: number): string {
  return `CB-${String(seq).padStart(3, "0")}`;
}

/**
 * Derive the equipment/destination identifier for a signal.
 *
 * Priority:
 *   1. field_device_tag (explicit device)
 *   2. description prefix (equipment name before last separator)
 *   3. fallback sentinel
 */
function deriveEquipment(sig: SignalRow): string {
  const device = sig.field_device_tag?.trim();
  if (device) return device;

  const prefix = extractEquipmentPrefix(sig.description);
  if (prefix) return prefix;

  return "__ungrouped__";
}

// ── Core Generation Logic ───────────────────────────────────────────────

/**
 * Analyse signals and produce cable candidates (no DB writes).
 * Exported for testability / preview UI.
 */
export function buildCableCandidates(
  signals: SignalRow[],
  existingTagMax: number
): CableCandidate[] {
  // Group by (plc_panel, equipment)
  const groups = new Map<string, SignalRow[]>();

  for (const sig of signals) {
    const panel = sig.plc_panel?.trim() || "__no_panel__";
    const equipment = deriveEquipment(sig);
    const key = `${panel}||${equipment}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(sig);
  }

  // Sort groups deterministically by key
  const sortedKeys = [...groups.keys()].sort();

  const candidates: CableCandidate[] = [];
  let seq = existingTagMax + 1;

  for (const key of sortedKeys) {
    const groupSignals = groups.get(key)!;
    const [panel, equipment] = key.split("||");

    // Compute signal cores
    let signalCores = 0;
    for (const s of groupSignals) {
      signalCores += coresForSignal(s.io_type);
    }

    // Spare cores: 20%, minimum 1
    const rawSpare = Math.ceil(signalCores * SPARE_CORE_PERCENT);
    const spareCores = Math.max(rawSpare, MIN_SPARE_CORES);

    const neededCores = signalCores + spareCores;
    const totalCores = roundToStandardCoreSize(neededCores);

    candidates.push({
      groupKey: key,
      cableTag: buildCableTag(seq),
      cableType: determineCableType(groupSignals),
      fromLocation: panel === "__no_panel__" ? "" : panel,
      toDevice: equipment === "__ungrouped__" ? "" : equipment,
      signalIds: groupSignals.map((s) => s.id),
      signalCores,
      spareCores,
      totalCores,
    });

    seq++;
  }

  return candidates;
}

// ── Database Generation ─────────────────────────────────────────────────

/**
 * Generate Cable Schedule records for a project.
 *
 * @param projectId  - Current project
 * @param username   - For revision tracking
 * @returns          - Summary of what was created
 */
export async function generateCableSchedule(
  projectId: number,
  username: string
): Promise<GenerationResult> {
  const db = await getDatabase();

  // 1. Fetch all non-spare, non-SoftComm signals that have NO cable assigned
  const unassigned = await db.select<SignalRow[]>(
    `SELECT id, io_type, description, plc_panel, field_device_tag, tag_name
     FROM signals
     WHERE project_id = $1
       AND (is_spare = 0 OR is_spare IS NULL)
       AND io_type != 'SoftComm'
       AND cable_id IS NULL
     ORDER BY sort_order, item_number, id`,
    [projectId]
  );

  if (unassigned.length === 0) {
    return { cablesCreated: 0, coresCreated: 0, signalsLinked: 0, skippedAlreadyAssigned: 0 };
  }

  // Count skipped (already assigned) for reporting
  const totalSignals = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM signals
     WHERE project_id = $1
       AND (is_spare = 0 OR is_spare IS NULL)
       AND io_type != 'SoftComm'`,
    [projectId]
  );
  const skippedAlreadyAssigned = (totalSignals[0]?.cnt ?? 0) - unassigned.length;

  // 2. Find highest existing cable tag number for deterministic sequencing
  const existing = await db.select<{ cable_tag: string }[]>(
    `SELECT cable_tag FROM cables WHERE project_id = $1 ORDER BY cable_tag`,
    [projectId]
  );
  let maxSeq = 0;
  for (const row of existing) {
    const match = row.cable_tag.match(/^CB-(\d+)$/);
    if (match) {
      maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }
  }

  // 3. Build candidates
  const candidates = buildCableCandidates(unassigned, maxSeq);

  // 4. Write to DB
  let cablesCreated = 0;
  let coresCreated = 0;
  let signalsLinked = 0;

  for (const c of candidates) {
    // Insert cable
    const cableResult = await db.execute(
      `INSERT INTO cables (project_id, cable_tag, cable_type, core_count,
         from_location, to_location, from_device, to_device, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        projectId,
        c.cableTag,
        c.cableType,
        c.totalCores,
        c.fromLocation || null, // from_location = plc_panel
        null, // to_location — not known from IO list
        null, // from_device — PLC itself
        c.toDevice || null, // to_device = equipment name
        `Auto-generated: ${c.signalIds.length} signal(s), ${c.signalCores} signal cores + ${c.spareCores} spare`,
      ]
    );

    const cableId = cableResult.lastInsertId;
    if (!cableId) continue;

    // Log cable creation in revisions
    await db.execute(
      `INSERT INTO revisions (project_id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
       VALUES ($1, 'cable', $2, 'cable_tag', NULL, $3, $4)`,
      [projectId, cableId, c.cableTag, username]
    );

    cablesCreated++;

    // Create cable_core rows: first N for signals, rest as spare
    let coreNum = 1;

    // Assign one core per signal wire
    for (const sigId of c.signalIds) {
      const sig = unassigned.find((s) => s.id === sigId)!;
      const wiresNeeded = coresForSignal(sig.io_type);

      for (let w = 0; w < wiresNeeded; w++) {
        await db.execute(
          `INSERT INTO cable_cores (cable_id, core_number, signal_id, notes)
           VALUES ($1, $2, $3, $4)`,
          [
            cableId,
            coreNum,
            w === 0 ? sigId : null, // link signal to its first core only
            w === 0
              ? (sig.tag_name || `Signal #${sigId}`)
              : `${sig.io_type} return/wire ${w + 1}`,
          ]
        );
        coreNum++;
        coresCreated++;
      }

      // Link signal → cable
      await db.execute(
        `UPDATE signals SET cable_id = $1, updated_at = datetime('now') WHERE id = $2`,
        [cableId, sigId]
      );
      signalsLinked++;
    }

    // Fill remaining cores as spare
    while (coreNum <= c.totalCores) {
      await db.execute(
        `INSERT INTO cable_cores (cable_id, core_number, notes)
         VALUES ($1, $2, 'Spare')`,
        [cableId, coreNum]
      );
      coreNum++;
      coresCreated++;
    }
  }

  return { cablesCreated, coresCreated, signalsLinked, skippedAlreadyAssigned };
}
