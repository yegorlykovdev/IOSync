/**
 * Panel Duplication — clones a panel and all its scoped engineering data
 * (PLC Hardware, IO List signals, Cable Schedule + cores) into a new
 * independent panel within the same project.
 *
 * Internal cross-references (signal→hardware, signal→cable, core→signal)
 * are remapped to point at the newly created records.
 */

import { getDatabase } from "@/db/database";

export interface DuplicateResult {
  newPanelId: number;
  hardwareCopied: number;
  signalsCopied: number;
  cablesCopied: number;
  coresCopied: number;
}

export async function duplicatePanel(
  sourcePanelId: number,
  projectId: number,
  newName: string,
  newDescription: string | null,
  newLocation: string | null
): Promise<DuplicateResult> {
  const db = await getDatabase();

  // ── 1. Create new panel ─────────────────────────────────────────────

  const panelResult = await db.execute(
    `INSERT INTO panels (project_id, panel_name, panel_description, location)
     VALUES ($1, $2, $3, $4)`,
    [projectId, newName, newDescription, newLocation]
  );
  const newPanelId = panelResult.lastInsertId;
  if (!newPanelId) throw new Error("Failed to create new panel");

  // ── 2. Clone PLC Hardware ───────────────────────────────────────────

  const hwRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM plc_hardware WHERE panel_id = $1`,
    [sourcePanelId]
  );

  const hwIdMap = new Map<number, number>(); // old id → new id

  for (const hw of hwRows) {
    const result = await db.execute(
      `INSERT INTO plc_hardware (project_id, panel_id, plc_name, rack, slot, module_type,
         channels, channel_type, module_category, protocol, ip_address, port,
         baud_rate, station_address, firmware_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        projectId, newPanelId, hw.plc_name, hw.rack, hw.slot, hw.module_type,
        hw.channels, hw.channel_type, hw.module_category ?? "io",
        hw.protocol ?? null, hw.ip_address ?? null, hw.port ?? null,
        hw.baud_rate ?? null, hw.station_address ?? null, hw.firmware_version ?? null,
      ]
    );
    if (result.lastInsertId) {
      hwIdMap.set(hw.id as number, result.lastInsertId);
    }
  }

  // ── 3. Clone Cables ─────────────────────────────────────────────────

  const cableRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM cables WHERE panel_id = $1`,
    [sourcePanelId]
  );

  const cableIdMap = new Map<number, number>(); // old id → new id

  for (const cable of cableRows) {
    const result = await db.execute(
      `INSERT INTO cables (project_id, panel_id, cable_tag, cable_type, core_count,
         from_location, to_location, from_device, to_device, length_m, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        projectId, newPanelId, cable.cable_tag, cable.cable_type ?? null,
        cable.core_count ?? 0, cable.from_location ?? null, cable.to_location ?? null,
        cable.from_device ?? null, cable.to_device ?? null, cable.length_m ?? null,
        cable.notes ?? null,
      ]
    );
    if (result.lastInsertId) {
      cableIdMap.set(cable.id as number, result.lastInsertId);
    }
  }

  // ── 4. Clone Cable Cores (signal_id remapped later) ─────────────────

  const coreIdMap = new Map<number, number>(); // old id → new id
  // Track which old signal_ids are referenced so we can remap after signals are cloned
  const coresWithSignals: { newCoreId: number; oldSignalId: number }[] = [];
  let coresCopied = 0;

  for (const [oldCableId, newCableId] of cableIdMap) {
    const coreRows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM cable_cores WHERE cable_id = $1 ORDER BY core_number`,
      [oldCableId]
    );
    for (const core of coreRows) {
      const result = await db.execute(
        `INSERT INTO cable_cores (cable_id, core_number, core_color, signal_id, from_terminal,
           to_terminal, notes, assignment_type)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)`,
        [
          newCableId, core.core_number, core.core_color ?? null,
          core.from_terminal ?? null, core.to_terminal ?? null,
          core.notes ?? null, core.assignment_type ?? "empty",
        ]
      );
      if (result.lastInsertId) {
        coreIdMap.set(core.id as number, result.lastInsertId);
        if (core.signal_id != null) {
          coresWithSignals.push({
            newCoreId: result.lastInsertId,
            oldSignalId: core.signal_id as number,
          });
        }
        coresCopied++;
      }
    }
  }

  // ── 5. Clone Signals ────────────────────────────────────────────────

  const signalRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM signals WHERE panel_id = $1 ORDER BY id`,
    [sourcePanelId]
  );

  const signalIdMap = new Map<number, number>(); // old id → new id

  for (const sig of signalRows) {
    // Remap plc_hardware_id and cable_id to cloned records
    const newHwId = sig.plc_hardware_id != null
      ? hwIdMap.get(sig.plc_hardware_id as number) ?? null
      : null;
    const newCableId = sig.cable_id != null
      ? cableIdMap.get(sig.cable_id as number) ?? null
      : null;

    const result = await db.execute(
      `INSERT INTO signals (
        project_id, panel_id, item_number, revision, plc_hardware_id, io_type, channel,
        tag_name, description, is_spare, signal_spec, plc_panel,
        signal_low, signal_high, range_units, rack, slot, card_part_number,
        pre_assigned_address, state_description,
        history_enabled, cov_deadband, time_delay, forced_storage_interval,
        alarm_point_activation, alarm_status_mismatch, alarm_loss_of_heartbeat,
        alarm_power_loss, alarm_sensor_out_of_range, alarm_loss_of_communication,
        alarm_low_low, alarm_low, alarm_min_operating_value,
        alarm_max_operating_value, alarm_high, alarm_high_high,
        alarm_cov_deadband, alarm_time_delay, alarm_severity, alarm_priority,
        resp_customer, resp_mech, resp_elec, resp_future, resp_dcim, resp_osc,
        legacy_card_number, legacy_card, legacy_io, legacy_hydronic_tag,
        legacy_device_id, legacy_description, instrument_model, serial_number,
        pipe_circumference, field_notes,
        comms_access, comms_data_type, comments, sort_order,
        signal_type, tag, cable_id, field_device_tag
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20,
        $21, $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30,
        $31, $32, $33,
        $34, $35, $36,
        $37, $38, $39, $40,
        $41, $42, $43, $44, $45, $46,
        $47, $48, $49, $50,
        $51, $52, $53, $54,
        $55, $56,
        $57, $58, $59, $60,
        $61, $62, $63, $64
      )`,
      [
        projectId, newPanelId, sig.item_number ?? null, sig.revision ?? null,
        newHwId, sig.io_type ?? null, sig.channel ?? null,
        sig.tag_name ?? null, sig.description ?? null, sig.is_spare ?? 0,
        sig.signal_spec ?? null, sig.plc_panel ?? null,
        sig.signal_low ?? null, sig.signal_high ?? null, sig.range_units ?? null,
        sig.rack ?? null, sig.slot ?? null, sig.card_part_number ?? null,
        sig.pre_assigned_address ?? null, sig.state_description ?? null,
        sig.history_enabled ?? null, sig.cov_deadband ?? null,
        sig.time_delay ?? null, sig.forced_storage_interval ?? null,
        sig.alarm_point_activation ?? null, sig.alarm_status_mismatch ?? null,
        sig.alarm_loss_of_heartbeat ?? null, sig.alarm_power_loss ?? null,
        sig.alarm_sensor_out_of_range ?? null, sig.alarm_loss_of_communication ?? null,
        sig.alarm_low_low ?? null, sig.alarm_low ?? null,
        sig.alarm_min_operating_value ?? null, sig.alarm_max_operating_value ?? null,
        sig.alarm_high ?? null, sig.alarm_high_high ?? null,
        sig.alarm_cov_deadband ?? null, sig.alarm_time_delay ?? null,
        sig.alarm_severity ?? null, sig.alarm_priority ?? null,
        sig.resp_customer ?? null, sig.resp_mech ?? null,
        sig.resp_elec ?? null, sig.resp_future ?? null,
        sig.resp_dcim ?? null, sig.resp_osc ?? null,
        sig.legacy_card_number ?? null, sig.legacy_card ?? null,
        sig.legacy_io ?? null, sig.legacy_hydronic_tag ?? null,
        sig.legacy_device_id ?? null, sig.legacy_description ?? null,
        sig.instrument_model ?? null, sig.serial_number ?? null,
        sig.pipe_circumference ?? null, sig.field_notes ?? null,
        sig.comms_access ?? null, sig.comms_data_type ?? null,
        sig.comments ?? null, sig.sort_order ?? null,
        sig.signal_type ?? "DI", sig.tag ?? "—",
        newCableId, sig.field_device_tag ?? null,
      ]
    );
    if (result.lastInsertId) {
      signalIdMap.set(sig.id as number, result.lastInsertId);
    }
  }

  // ── 6. Remap cable_cores.signal_id ──────────────────────────────────

  for (const { newCoreId, oldSignalId } of coresWithSignals) {
    const newSignalId = signalIdMap.get(oldSignalId);
    if (newSignalId != null) {
      await db.execute(
        `UPDATE cable_cores SET signal_id = $1 WHERE id = $2`,
        [newSignalId, newCoreId]
      );
    }
  }

  return {
    newPanelId,
    hardwareCopied: hwRows.length,
    signalsCopied: signalRows.length,
    cablesCopied: cableRows.length,
    coresCopied,
  };
}
