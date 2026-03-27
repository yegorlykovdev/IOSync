import type { Migration } from "../migrate";

const migration: Migration = {
  version: 9,
  name: "revision_panel_id",
  up: `
    ALTER TABLE revisions ADD COLUMN panel_id INTEGER REFERENCES panels(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_revisions_panel_id ON revisions(panel_id);

    -- Backfill panel_id from entity tables for existing revisions
    UPDATE revisions SET panel_id = (
      SELECT panel_id FROM signals WHERE signals.id = revisions.entity_id
    ) WHERE entity_type = 'signal' AND panel_id IS NULL;

    UPDATE revisions SET panel_id = (
      SELECT panel_id FROM plc_hardware WHERE plc_hardware.id = revisions.entity_id
    ) WHERE entity_type = 'plc_hardware' AND panel_id IS NULL;

    UPDATE revisions SET panel_id = (
      SELECT panel_id FROM cables WHERE cables.id = revisions.entity_id
    ) WHERE entity_type = 'cable' AND panel_id IS NULL;

    UPDATE revisions SET panel_id = entity_id
      WHERE entity_type = 'panel' AND panel_id IS NULL
  `,
};

export default migration;
