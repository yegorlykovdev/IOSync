import type { Migration } from "../migrate";

const migration: Migration = {
  version: 7,
  name: "panel_scope_hardware",
  up: `
    ALTER TABLE plc_hardware ADD COLUMN panel_id INTEGER REFERENCES panels(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_plc_hardware_panel_id ON plc_hardware(panel_id)
  `,
};

export default migration;
