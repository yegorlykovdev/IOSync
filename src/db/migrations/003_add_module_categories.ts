import type { Migration } from "../migrate";

const migration: Migration = {
  version: 3,
  name: "add_module_categories",
  up: `
    ALTER TABLE plc_hardware ADD COLUMN module_category TEXT NOT NULL DEFAULT 'io';
    ALTER TABLE plc_hardware ADD COLUMN protocol TEXT;
    ALTER TABLE plc_hardware ADD COLUMN ip_address TEXT;
    ALTER TABLE plc_hardware ADD COLUMN port INTEGER;
    ALTER TABLE plc_hardware ADD COLUMN baud_rate INTEGER;
    ALTER TABLE plc_hardware ADD COLUMN station_address INTEGER;
    ALTER TABLE plc_hardware ADD COLUMN firmware_version TEXT
  `,
};

export default migration;
