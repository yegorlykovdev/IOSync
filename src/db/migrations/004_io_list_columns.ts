import type { Migration } from "../migrate";

const migration: Migration = {
  version: 4,
  name: "io_list_columns",
  up: `
    -- Core identification
    ALTER TABLE signals ADD COLUMN item_number INTEGER;
    ALTER TABLE signals ADD COLUMN revision TEXT;

    -- Hardware assignment
    ALTER TABLE signals ADD COLUMN rack TEXT;
    ALTER TABLE signals ADD COLUMN slot TEXT;
    ALTER TABLE signals ADD COLUMN channel TEXT;
    ALTER TABLE signals ADD COLUMN pre_assigned_address TEXT;
    ALTER TABLE signals ADD COLUMN card_part_number TEXT;

    -- Signal classification (io_type replaces old signal_type for broader type support)
    ALTER TABLE signals ADD COLUMN io_type TEXT NOT NULL DEFAULT 'DI';
    ALTER TABLE signals ADD COLUMN is_spare INTEGER DEFAULT 0;

    -- Tag (single field)
    ALTER TABLE signals ADD COLUMN tag_name TEXT;

    -- Signal definition
    ALTER TABLE signals ADD COLUMN state_description TEXT;
    ALTER TABLE signals ADD COLUMN plc_panel TEXT;
    ALTER TABLE signals ADD COLUMN signal_spec TEXT;
    ALTER TABLE signals ADD COLUMN signal_low TEXT;
    ALTER TABLE signals ADD COLUMN signal_high TEXT;
    ALTER TABLE signals ADD COLUMN range_units TEXT;

    -- Historian / trending
    ALTER TABLE signals ADD COLUMN history_enabled TEXT;
    ALTER TABLE signals ADD COLUMN cov_deadband TEXT;
    ALTER TABLE signals ADD COLUMN time_delay TEXT;
    ALTER TABLE signals ADD COLUMN forced_storage_interval TEXT;

    -- Alarm configuration — state alarms
    ALTER TABLE signals ADD COLUMN alarm_point_activation TEXT;
    ALTER TABLE signals ADD COLUMN alarm_status_mismatch TEXT;
    ALTER TABLE signals ADD COLUMN alarm_loss_of_heartbeat TEXT;
    ALTER TABLE signals ADD COLUMN alarm_power_loss TEXT;
    ALTER TABLE signals ADD COLUMN alarm_sensor_out_of_range TEXT;
    ALTER TABLE signals ADD COLUMN alarm_loss_of_communication TEXT;

    -- Alarm configuration — analog limits
    ALTER TABLE signals ADD COLUMN alarm_low_low TEXT;
    ALTER TABLE signals ADD COLUMN alarm_low TEXT;
    ALTER TABLE signals ADD COLUMN alarm_min_operating_value TEXT;
    ALTER TABLE signals ADD COLUMN alarm_max_operating_value TEXT;
    ALTER TABLE signals ADD COLUMN alarm_high TEXT;
    ALTER TABLE signals ADD COLUMN alarm_high_high TEXT;

    -- Alarm configuration — meta
    ALTER TABLE signals ADD COLUMN alarm_cov_deadband TEXT;
    ALTER TABLE signals ADD COLUMN alarm_time_delay TEXT;
    ALTER TABLE signals ADD COLUMN alarm_severity TEXT;
    ALTER TABLE signals ADD COLUMN alarm_priority INTEGER;

    -- Responsibility matrix
    ALTER TABLE signals ADD COLUMN resp_customer TEXT;
    ALTER TABLE signals ADD COLUMN resp_mech TEXT;
    ALTER TABLE signals ADD COLUMN resp_elec TEXT;
    ALTER TABLE signals ADD COLUMN resp_future TEXT;
    ALTER TABLE signals ADD COLUMN resp_dcim TEXT;
    ALTER TABLE signals ADD COLUMN resp_osc TEXT;

    -- Legacy / field info
    ALTER TABLE signals ADD COLUMN legacy_card_number TEXT;
    ALTER TABLE signals ADD COLUMN legacy_card TEXT;
    ALTER TABLE signals ADD COLUMN legacy_io TEXT;
    ALTER TABLE signals ADD COLUMN legacy_hydronic_tag TEXT;
    ALTER TABLE signals ADD COLUMN legacy_device_id TEXT;
    ALTER TABLE signals ADD COLUMN legacy_description TEXT;
    ALTER TABLE signals ADD COLUMN instrument_model TEXT;
    ALTER TABLE signals ADD COLUMN serial_number TEXT;
    ALTER TABLE signals ADD COLUMN pipe_circumference TEXT;
    ALTER TABLE signals ADD COLUMN field_notes TEXT;

    -- Soft comms specific
    ALTER TABLE signals ADD COLUMN comms_access TEXT;
    ALTER TABLE signals ADD COLUMN comms_data_type TEXT;

    -- Misc
    ALTER TABLE signals ADD COLUMN comments TEXT;
    ALTER TABLE signals ADD COLUMN sort_order INTEGER;

    -- Indexes for new columns
    CREATE INDEX IF NOT EXISTS idx_signals_io_type ON signals(io_type);
    CREATE INDEX IF NOT EXISTS idx_signals_plc_panel ON signals(plc_panel);
    CREATE INDEX IF NOT EXISTS idx_signals_tag_name ON signals(tag_name);
    CREATE INDEX IF NOT EXISTS idx_signals_sort_order ON signals(project_id, sort_order)
  `,
};

export default migration;
