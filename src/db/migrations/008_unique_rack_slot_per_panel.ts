import type { Migration } from "../migrate";

const migration: Migration = {
  version: 8,
  name: "unique_rack_slot_per_panel",
  up: `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plc_hardware_panel_rack_slot
      ON plc_hardware(panel_id, rack, slot)
      WHERE panel_id IS NOT NULL
  `,
};

export default migration;
