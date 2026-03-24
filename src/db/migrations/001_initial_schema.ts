import type { Migration } from "../migrate";

const migration: Migration = {
  version: 1,
  name: "initial_schema",
  up: `
    -- Projects
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      project_number TEXT NOT NULL UNIQUE,
      client TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_project_number ON projects(project_number);

    -- PLC Hardware
    CREATE TABLE IF NOT EXISTS plc_hardware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      plc_name TEXT NOT NULL,
      rack INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      module_type TEXT NOT NULL,
      channels INTEGER NOT NULL,
      channel_type TEXT NOT NULL CHECK (channel_type IN ('DI', 'DO', 'AI', 'AO')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plc_hardware_project_id ON plc_hardware(project_id);

    -- Cables
    CREATE TABLE IF NOT EXISTS cables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      cable_tag TEXT NOT NULL,
      cable_type TEXT,
      core_count INTEGER,
      from_location TEXT,
      to_location TEXT,
      from_device TEXT,
      to_device TEXT,
      length_m REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cables_project_id ON cables(project_id);
    CREATE INDEX IF NOT EXISTS idx_cables_cable_tag ON cables(cable_tag);

    -- Panels
    CREATE TABLE IF NOT EXISTS panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      panel_name TEXT NOT NULL,
      panel_description TEXT,
      location TEXT,
      width_mm REAL,
      height_mm REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_panels_project_id ON panels(project_id);

    -- Panel Components
    CREATE TABLE IF NOT EXISTS panel_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL,
      component_type TEXT NOT NULL,
      device_tag TEXT,
      description TEXT,
      manufacturer TEXT,
      part_number TEXT,
      x_position REAL,
      y_position REAL,
      width_mm REAL,
      height_mm REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_panel_components_panel_id ON panel_components(panel_id);

    -- Terminal Blocks
    CREATE TABLE IF NOT EXISTS terminal_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_component_id INTEGER NOT NULL,
      tb_tag TEXT NOT NULL,
      terminal_count INTEGER NOT NULL,
      terminal_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (panel_component_id) REFERENCES panel_components(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_terminal_blocks_panel_component_id ON terminal_blocks(panel_component_id);
    CREATE INDEX IF NOT EXISTS idx_terminal_blocks_tb_tag ON terminal_blocks(tb_tag);

    -- Signals (references cables, panels, plc_hardware — created after them)
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      description TEXT,
      signal_type TEXT NOT NULL CHECK (signal_type IN ('DI', 'DO', 'AI', 'AO')),
      plc_hardware_id INTEGER,
      channel_number INTEGER,
      plc_address TEXT,
      range_min REAL,
      range_max REAL,
      engineering_unit TEXT,
      cable_id INTEGER,
      panel_id INTEGER,
      terminal_block TEXT,
      terminal_number INTEGER,
      field_device_tag TEXT,
      field_device_description TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (plc_hardware_id) REFERENCES plc_hardware(id) ON DELETE SET NULL,
      FOREIGN KEY (cable_id) REFERENCES cables(id) ON DELETE SET NULL,
      FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signals_project_id ON signals(project_id);
    CREATE INDEX IF NOT EXISTS idx_signals_tag ON signals(tag);
    CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON signals(signal_type);
    CREATE INDEX IF NOT EXISTS idx_signals_plc_hardware_id ON signals(plc_hardware_id);
    CREATE INDEX IF NOT EXISTS idx_signals_cable_id ON signals(cable_id);

    -- Cable Cores
    CREATE TABLE IF NOT EXISTS cable_cores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cable_id INTEGER NOT NULL,
      core_number INTEGER NOT NULL,
      core_color TEXT,
      signal_id INTEGER,
      from_terminal TEXT,
      to_terminal TEXT,
      notes TEXT,
      FOREIGN KEY (cable_id) REFERENCES cables(id) ON DELETE CASCADE,
      FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cable_cores_cable_id ON cable_cores(cable_id);
    CREATE INDEX IF NOT EXISTS idx_cable_cores_signal_id ON cable_cores(signal_id);

    -- Revisions (audit log)
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      snapshot_name TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_revisions_project_id ON revisions(project_id);
    CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_revisions_snapshot_name ON revisions(snapshot_name);

    -- Snapshots
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      snapshot_data TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_project_id ON snapshots(project_id);

    -- Enable foreign keys
    PRAGMA foreign_keys = ON;
  `,
};

export default migration;
