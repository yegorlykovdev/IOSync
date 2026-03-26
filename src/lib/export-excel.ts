import ExcelJS from "exceljs";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

// ── Types ──────────────────────────────────────────────────────────────

interface Signal {
  id: number;
  item_number: number | null;
  revision: string | null;
  rack: string | null;
  slot: string | null;
  channel: string | null;
  pre_assigned_address: string | null;
  card_part_number: string | null;
  io_type: string;
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
  plc_hardware_id: number | null;
}

interface ProjectInfo {
  name: string;
  project_number: string;
  client: string | null;
  plc_platform: string;
}

interface PlcModule {
  id: number;
  plc_name: string;
  rack: number;
  slot: number;
  module_type: string;
  channels: number;
  channel_type: string;
  module_category: string;
}

// ── IO Type colors (Excel ARGB, no # prefix) ──────────────────────────

const IO_TYPE_FILLS: Record<string, string> = {
  DI: "FFE8F5E9",
  DO: "FFE3F2FD",
  AI: "FFFFF3E0",
  AO: "FFFFEBEE",
  RTD: "FFFFF8E1",
  TC: "FFFCE4EC",
  SoftComm: "FFF3E5F5",
};

// ── Column definitions for the IO List sheet ───────────────────────────

const IO_LIST_COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "#", key: "item_number", width: 6 },
  { header: "Rev", key: "revision", width: 6 },
  { header: "IO Type", key: "io_type", width: 10 },
  { header: "Tag Name", key: "tag_name", width: 22 },
  { header: "Description", key: "description", width: 30 },
  { header: "PLC Address", key: "pre_assigned_address", width: 14 },
  { header: "Module", key: "module_name", width: 18 },
  { header: "Rack", key: "rack", width: 6 },
  { header: "Slot", key: "slot", width: 6 },
  { header: "Channel", key: "channel", width: 8 },
  { header: "Card P/N", key: "card_part_number", width: 14 },
  { header: "Signal Spec", key: "signal_spec", width: 14 },
  { header: "PLC Panel", key: "plc_panel", width: 12 },
  { header: "State Description", key: "state_description", width: 20 },
  { header: "Signal Low", key: "signal_low", width: 10 },
  { header: "Signal High", key: "signal_high", width: 10 },
  { header: "Range Units", key: "range_units", width: 10 },
  { header: "Spare", key: "is_spare_text", width: 6 },
  // Historian
  { header: "History Enabled", key: "history_enabled", width: 14 },
  { header: "COV Deadband", key: "cov_deadband", width: 12 },
  { header: "Time Delay", key: "time_delay", width: 10 },
  { header: "Forced Storage", key: "forced_storage_interval", width: 14 },
  // Alarm — state
  { header: "Point Activation", key: "alarm_point_activation", width: 14 },
  { header: "Status Mismatch", key: "alarm_status_mismatch", width: 14 },
  { header: "Loss of Heartbeat", key: "alarm_loss_of_heartbeat", width: 16 },
  { header: "Power Loss", key: "alarm_power_loss", width: 10 },
  { header: "Sensor OOR", key: "alarm_sensor_out_of_range", width: 10 },
  { header: "Loss of Comm", key: "alarm_loss_of_communication", width: 12 },
  // Alarm — analog
  { header: "Low Low", key: "alarm_low_low", width: 10 },
  { header: "Low", key: "alarm_low", width: 8 },
  { header: "Min Op Value", key: "alarm_min_operating_value", width: 12 },
  { header: "Max Op Value", key: "alarm_max_operating_value", width: 12 },
  { header: "High", key: "alarm_high", width: 8 },
  { header: "High High", key: "alarm_high_high", width: 10 },
  // Alarm — meta
  { header: "Alarm COV", key: "alarm_cov_deadband", width: 10 },
  { header: "Alarm Delay", key: "alarm_time_delay", width: 10 },
  { header: "Severity", key: "alarm_severity", width: 10 },
  { header: "Priority", key: "alarm_priority", width: 8 },
  // Responsibility
  { header: "Customer", key: "resp_customer", width: 10 },
  { header: "Mech", key: "resp_mech", width: 8 },
  { header: "Elec", key: "resp_elec", width: 8 },
  { header: "Future", key: "resp_future", width: 8 },
  { header: "DCIM", key: "resp_dcim", width: 8 },
  { header: "OSC", key: "resp_osc", width: 8 },
  // Legacy
  { header: "Legacy Card #", key: "legacy_card_number", width: 12 },
  { header: "Legacy Card", key: "legacy_card", width: 12 },
  { header: "Legacy IO", key: "legacy_io", width: 10 },
  { header: "Legacy Hydronic Tag", key: "legacy_hydronic_tag", width: 16 },
  { header: "Legacy Device ID", key: "legacy_device_id", width: 14 },
  { header: "Legacy Description", key: "legacy_description", width: 20 },
  { header: "Instrument Model", key: "instrument_model", width: 14 },
  { header: "Serial Number", key: "serial_number", width: 14 },
  { header: "Pipe Circumference", key: "pipe_circumference", width: 14 },
  { header: "Field Notes", key: "field_notes", width: 14 },
  // Soft comms
  { header: "Comms Access", key: "comms_access", width: 12 },
  { header: "Comms Data Type", key: "comms_data_type", width: 14 },
  // Misc
  { header: "Comments", key: "comments", width: 24 },
];

// ── Export function ────────────────────────────────────────────────────

export async function exportIoListToExcel(
  signals: Signal[],
  modules: PlcModule[],
  project: ProjectInfo
): Promise<boolean> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const suggestedName = `${project.name}_IO-List_${dateStr}.xlsx`;

  const filePath = await save({
    defaultPath: suggestedName,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });

  if (!filePath) return false;

  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "IOSync";
  wb.created = new Date();

  // ── Sheet 1: IO List ──────────────────────────────────────────────
  const ws = wb.addWorksheet("IO List");

  // Project header (rows 1-4)
  ws.mergeCells("A1:F1");
  const titleCell = ws.getCell("A1");
  titleCell.value = project.name;
  titleCell.font = { bold: true, size: 16 };

  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = `Project: ${project.project_number}`;
  ws.getCell("A2").font = { size: 11, color: { argb: "FF666666" } };

  ws.mergeCells("A3:F3");
  ws.getCell("A3").value = `Client: ${project.client ?? "—"}  |  PLC Platform: ${project.plc_platform}  |  Export Date: ${dateStr}`;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF888888" } };

  // Row 4 is blank spacer

  // Column headers at row 5
  const HEADER_ROW = 5;
  ws.columns = IO_LIST_COLUMNS.map((col) => ({
    key: col.key,
    width: col.width,
  }));

  const headerRow = ws.getRow(HEADER_ROW);
  IO_LIST_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF1D4ED8" } },
    };
  });
  headerRow.height = 22;

  // Freeze header + project info rows
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 0 }];

  // Data rows
  signals.forEach((sig) => {
    const mod = sig.plc_hardware_id ? moduleMap.get(sig.plc_hardware_id) : null;
    const rowData: Record<string, unknown> = {
      ...sig,
      module_name: mod?.plc_name ?? "",
      is_spare_text: sig.is_spare ? "Yes" : "",
    };

    const row = ws.addRow(rowData);
    row.font = { size: 10 };

    if (sig.is_spare) {
      row.eachCell((cell) => {
        cell.font = { ...cell.font, italic: true, color: { argb: "FF999999" } };
      });
    }

    // Color-code IO type cell
    const ioTypeColIdx = IO_LIST_COLUMNS.findIndex((c) => c.key === "io_type") + 1;
    const ioCell = row.getCell(ioTypeColIdx);
    const fill = IO_TYPE_FILLS[sig.io_type];
    if (fill) {
      ioCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
    }

    // Alternate row shading
    if ((row.number - HEADER_ROW) % 2 === 0) {
      row.eachCell((cell) => {
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).pattern !== "solid") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      });
    }
  });

  // Auto-filter on header row
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + signals.length, column: IO_LIST_COLUMNS.length },
  };

  // ── Sheet 2: IO Summary ───────────────────────────────────────────
  const summary = wb.addWorksheet("IO Summary");

  // Title
  summary.mergeCells("A1:D1");
  summary.getCell("A1").value = `${project.name} — IO Summary`;
  summary.getCell("A1").font = { bold: true, size: 14 };

  summary.getCell("A2").value = `Generated: ${dateStr}`;
  summary.getCell("A2").font = { size: 10, color: { argb: "FF888888" } };

  // Section: Counts by IO Type
  let row = 4;
  const typeHeaderRow = summary.getRow(row);
  ["IO Type", "Count", "Spare", "Active"].forEach((h, i) => {
    const cell = typeHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  });
  summary.getColumn(1).width = 14;
  summary.getColumn(2).width = 10;
  summary.getColumn(3).width = 10;
  summary.getColumn(4).width = 10;

  const types = ["DI", "DO", "AI", "AO", "RTD", "TC", "SoftComm"];
  let totalCount = 0, totalSpare = 0;
  types.forEach((t) => {
    row++;
    const count = signals.filter((s) => s.io_type === t).length;
    const spare = signals.filter((s) => s.io_type === t && s.is_spare).length;
    totalCount += count;
    totalSpare += spare;
    const r = summary.getRow(row);
    r.getCell(1).value = t;
    r.getCell(2).value = count;
    r.getCell(3).value = spare;
    r.getCell(4).value = count - spare;

    const fill = IO_TYPE_FILLS[t];
    if (fill) {
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }
  });

  // Total row
  row++;
  const totalRow = summary.getRow(row);
  totalRow.getCell(1).value = "Total";
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(2).value = totalCount;
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = totalSpare;
  totalRow.getCell(3).font = { bold: true };
  totalRow.getCell(4).value = totalCount - totalSpare;
  totalRow.getCell(4).font = { bold: true };

  // Section: By PLC Module
  row += 2;
  const modHeaderRow = summary.getRow(row);
  ["Module", "Rack", "Slot", "Type", "Channels", "Used", "Utilization"].forEach((h, i) => {
    const cell = modHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  });
  summary.getColumn(5).width = 10;
  summary.getColumn(6).width = 10;
  summary.getColumn(7).width = 12;

  const ioModules = modules.filter((m) => m.module_category === "io");
  ioModules.forEach((mod) => {
    row++;
    const used = signals.filter(
      (s) => s.plc_hardware_id === mod.id && !s.is_spare
    ).length;
    const util = mod.channels > 0 ? Math.round((used / mod.channels) * 100) : 0;

    const r = summary.getRow(row);
    r.getCell(1).value = mod.plc_name;
    r.getCell(2).value = mod.rack;
    r.getCell(3).value = mod.slot;
    r.getCell(4).value = mod.channel_type;
    r.getCell(5).value = mod.channels;
    r.getCell(6).value = used;
    r.getCell(7).value = `${util}%`;

    // Color utilization: green <75%, yellow 75-90%, red >90%
    const utilCell = r.getCell(7);
    if (util > 90) {
      utilCell.font = { color: { argb: "FFDC2626" }, bold: true };
    } else if (util >= 75) {
      utilCell.font = { color: { argb: "FFD97706" } };
    } else {
      utilCell.font = { color: { argb: "FF16A34A" } };
    }
  });

  // Write to file
  const buffer = await wb.xlsx.writeBuffer();
  await writeFile(filePath, new Uint8Array(buffer as ArrayBuffer));

  return true;
}
