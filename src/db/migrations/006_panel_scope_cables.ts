import type { Migration } from "../migrate";

const migration: Migration = {
  version: 6,
  name: "panel_scope_cables",
  up: `
    ALTER TABLE cables ADD COLUMN panel_id INTEGER REFERENCES panels(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_cables_panel_id ON cables(panel_id)
  `,
};

export default migration;
