import type { Migration } from "../migrate";

const migration: Migration = {
  version: 5,
  name: "cable_core_assignment",
  up: `
    ALTER TABLE cable_cores ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'empty';

    -- Classify existing cores: signal-linked → 'signal', spare notes → 'spare'
    UPDATE cable_cores SET assignment_type = 'signal' WHERE signal_id IS NOT NULL;
    UPDATE cable_cores SET assignment_type = 'spare'
      WHERE signal_id IS NULL AND LOWER(TRIM(notes)) = 'spare'
  `,
};

export default migration;
