import type { Migration } from "../migrate";

const migration: Migration = {
  version: 2,
  name: "add_plc_platform",
  up: `
    ALTER TABLE projects ADD COLUMN plc_platform TEXT NOT NULL DEFAULT 'siemens';
    ALTER TABLE projects ADD COLUMN custom_address_prefix TEXT;
    ALTER TABLE projects ADD COLUMN custom_address_pattern TEXT
  `,
};

export default migration;
