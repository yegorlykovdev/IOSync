# IOSync

Desktop app for control engineers to manage IO Lists, Cable Schedules, and Panel Drawings from a single source of truth. Built with Tauri 2.0 (Rust backend) + React 19 + TypeScript + Vite + SQLite + Tailwind CSS v4 + shadcn/ui.

## Tech Notes

- **Package manager:** pnpm
- **Database:** SQLite via `@tauri-apps/plugin-sql` (frontend) + `tauri-plugin-sql` (Rust)
- **Migrations:** Custom TS runner in `src/db/migrate.ts` — runs on app startup
- **Routing:** react-router-dom with layout route in `src/App.tsx`
- **State:** React context for selected project (`src/contexts/ProjectContext.tsx`), user (`src/contexts/UserContext.tsx`)
- **Theme:** Dark/light with CSS variables, toggle in top bar, persisted to localStorage
- **Path alias:** `@/` maps to `src/`
- **Build check:** Always run `pnpm tauri build` after changes to verify both TS and Rust compile
- **PLC Addressing:** Multi-platform address formatter in `src/lib/plc-address.ts` — platform is stored per-project
- **User identification:** OS username via `whoami` crate (Rust command `get_username`), shown in top bar
- **File locking:** `.lock` file next to `.db` with username + timestamp; 1-hour stale timeout; same user can reacquire

## Custom Tauri Commands (src-tauri/src/lib.rs)

- `get_username()` → String — returns OS username via `whoami` crate
- `acquire_lock(db_path)` → LockInfo — creates `.lock` file, returns `{locked, username, timestamp}` if held by another user
- `release_lock(db_path)` — removes `.lock` file if owned by current user

## Database Schema

10 tables across 4 migrations:

**001_initial_schema:** Core tables
- **projects** — top-level entity; includes `plc_platform`, `custom_address_prefix`, `custom_address_pattern` (added in 002)
- **plc_hardware** → projects — PLC modules with rack/slot/channel info; supports 3 categories: IO, Communication, CPU (added in 003)
- **signals** → projects, plc_hardware, cables, panels — IO signals with full IO list schema (50+ columns added in 004)
- **cables** → projects — cable runs between locations/devices
- **cable_cores** → cables, signals — individual cores within a cable
- **panels** → projects — physical panel enclosures
- **panel_components** → panels — devices placed on panels
- **terminal_blocks** → panel_components — terminal strips on components
- **revisions** → projects — audit log (changed_by = OS username)
- **snapshots** → projects — named full-project JSON dumps for versioning

**002_add_plc_platform:** Adds `plc_platform`, `custom_address_prefix`, `custom_address_pattern` to projects

**003_add_module_categories:** Adds `module_category` (io/communication/cpu), `protocol`, `ip_address`, `port`, `baud_rate`, `station_address`, `firmware_version` to plc_hardware

**004_io_list_columns:** Expands signals table with ~50 new columns:
- Core: `item_number`, `revision`
- Hardware: `rack`, `slot`, `channel`, `pre_assigned_address`, `card_part_number`
- Classification: `io_type` (DI/DO/AI/AO/RTD/TC/SoftComm), `is_spare`
- Tag: `tag_name` (single field)
- Signal definition: `signal_spec`, `state_description`, `plc_panel`, `signal_low`, `signal_high`, `range_units`
- Historian: `history_enabled`, `cov_deadband`, `time_delay`, `forced_storage_interval`
- Alarm state: `alarm_point_activation`, `alarm_status_mismatch`, `alarm_loss_of_heartbeat`, `alarm_power_loss`, `alarm_sensor_out_of_range`, `alarm_loss_of_communication`
- Alarm analog: `alarm_low_low`, `alarm_low`, `alarm_min_operating_value`, `alarm_max_operating_value`, `alarm_high`, `alarm_high_high`
- Alarm meta: `alarm_cov_deadband`, `alarm_time_delay`, `alarm_severity`, `alarm_priority`
- Responsibility: `resp_customer`, `resp_mech`, `resp_elec`, `resp_future`, `resp_dcim`, `resp_osc`
- Legacy: `legacy_card_number`, `legacy_card`, `legacy_io`, `legacy_hydronic_tag`, `legacy_device_id`, `legacy_description`, `instrument_model`, `serial_number`, `pipe_circumference`, `field_notes`
- Soft comms: `comms_access`, `comms_data_type`
- Misc: `comments`, `sort_order`

Note: The original `signal_type` (CHECK DI/DO/AI/AO) and `tag` (NOT NULL) columns from migration 001 are kept for backward compat. New code uses `io_type` and `tag_name` instead. `signal_spec` holds the signal specification ("24V DC", "4-20mA", etc.).

All tables have foreign keys with CASCADE/SET NULL and indexes on `project_id` + frequently queried columns.

## PLC Platform Support

Address formatting in `src/lib/plc-address.ts` supports 7 platforms:
- **Siemens S7:** `%I0.0`, `%Q0.0`, `%IW0`, `%QW0`
- **Rockwell/AB:** `I:0/0`, `O:0/0` (digital), `I:0.0`, `O:0.0` (analog)
- **Schneider:** `%I0.0.0`, `%Q0.0.0` (rack.module.channel)
- **ABB:** `DI:0:0:0`, `DO:0:0:0`
- **Mitsubishi:** `X000`, `Y000`, `D000`, `R000`
- **Generic:** `DI-001`, `DO-001`
- **Custom:** user-defined prefix + pattern with `{TYPE}`, `{RACK}`, `{SLOT}`, `{CH}`, `{SEQ}` placeholders

Platform is selected at project creation and displayed in TopBar, project cards, and PLC Hardware page.

## Read-Only Mode

When another user holds the `.lock` file:
- TopBar shows red "Read-only (locked by X)" badge
- `ProjectContext.readOnly` flag is `true`
- All create/edit/delete buttons are disabled across Projects, PLC Hardware, and IO List pages
- Lock is released on window unload or component unmount; stale locks (>1 hour) are auto-overridden

## Project Structure

```
src/
  App.tsx                    — Root: DB init, routing, providers (UserProvider, ProjectProvider)
  App.css                    — Tailwind + theme CSS variables (light + dark)
  db/                        — Database layer
    database.ts              — Singleton getDatabase()
    migrate.ts               — Migration runner (handles partial re-runs)
    migrations/              — Numbered migration files (001, 002, 003, 004)
  lib/
    utils.ts                 — cn() utility for Tailwind class merging
    plc-address.ts           — Multi-platform PLC address formatter
    export-excel.ts          — IO List Excel export (exceljs + Tauri dialog/fs plugins)
    generate-cables.ts       — Cable schedule auto-generation from IO List signals
  components/
    layout/                  — AppLayout, Sidebar, TopBar (shows user + lock status)
    ui/                      — shadcn/ui components
  contexts/
    ProjectContext.tsx        — Selected project state + CRUD + readOnly flag
    UserContext.tsx           — OS username from Rust command
  hooks/
    useTheme.ts              — Dark/light theme toggle
    useFileLock.ts           — Acquire/release .lock file via Rust commands
    useTrackedUpdate.ts      — Tracked DB writes with automatic revision logging
    useGridNav.ts            — Spreadsheet-style keyboard navigation + copy/paste for table grids
  pages/
    ProjectsPage.tsx         — Project list + create dialog (with platform selector)
    PlcHardwarePage.tsx      — PLC module CRUD + utilization + address display + module categories (IO/Comm/CPU)
    IoListPage.tsx           — IO List: TanStack Table data grid, inline editing, add/edit Sheet, column visibility, filtering
    CablesPage.tsx           — Cable management with expandable core mapping, signal linking, revision tracking
    RevisionsPage.tsx        — Revision history: grouped timeline, filters, entity labels, navigation
    PlaceholderPage.tsx      — Stub for unbuilt pages
src-tauri/
  src/lib.rs                 — Tauri commands (get_username, acquire_lock, release_lock) + plugins
  Cargo.toml                 — whoami + chrono crates
  capabilities/default.json  — ACL permissions
```

## Current Progress

**Phase 0 — Scaffold: COMPLETE**
- Tauri 2.0 + React + TS + Vite project initialized
- SQLite migration system with 10-table schema
- App shell with sidebar nav, top bar, dark/light theme
- Projects page with create/select functionality
- Placeholder pages for IO List, Cables, Panels, Revisions

**Phase 1 — IO List MVP: IN PROGRESS**
- 1.1 PLC Hardware Configuration — COMPLETE
  - PLC module CRUD (add/edit/delete) with table view
  - Channel utilization bars (used/total with color coding)
  - Multi-platform PLC address formatting (7 platforms)
  - Platform selector at project creation, displayed throughout UI
  - Module categories: IO Module, Communication Module, CPU/Processor
  - Conditional form fields per category (protocol/IP/baud for comms, firmware/IP for CPU)
  - Non-IO modules show protocol/IP instead of channel info in table
  - Only IO modules contribute to channel summary and utilization
- 1.1c User Identification & File Locking — COMPLETE
  - OS username auto-detected via whoami crate, shown in top bar
  - File locking with .lock file for multi-user shared DB access
  - Read-only mode when another user holds the lock
  - Lock release lifecycle fixed: unload/unmount cleanup now uses the live DB path instead of the initial null state snapshot
- 1.2 IO List Entry & Editing — COMPLETE
  - Excel-style spreadsheet: all cells are live inputs/selects directly in the table (no separate form)
  - TanStack Table (`@tanstack/react-table`) data grid with 50+ columns
  - Column visibility toggle by groups (Core, Signal Def, Historian, Alarm State/Analog/Meta, Responsibility, Legacy, Soft Comms, Comments), persisted to localStorage
  - Text cells: native `<input>` with auto-save on blur, Enter moves to next row, Tab moves to next cell
  - Select cells: native `<select>` for IO type, signal type, Yes/N/A fields, severity, comms access/data type
  - **"Sync from Hardware" button** — auto-generates IO list rows from PLC hardware config:
    - IO modules → 1 row per channel, pre-filled with io_type, rack/slot/channel, computed PLC address
    - Rows sorted by rack/slot/channel order; only adds missing rows (safe to re-run)
    - CPU and communication modules stay in PLC Hardware only; they no longer generate placeholder signal rows that contaminate IO counts, export summaries, or cable generation
  - Module assignment dropdown (all module types) → auto-fills rack/slot/card/panel/IO type; channel dropdown for IO modules computes PLC address
  - "Add Row" inserts empty row; "Spare" adds pre-filled spare; "Copy Row" duplicates all fields
  - Signal types: DI, DO, AI, AO, RTD, TC, SoftComm
  - Toolbar: search, IO type filter, panel filter, signal count badge, column visibility, sync
  - Spare signals shown with reduced opacity; read-only mode disables all inputs
  - **Bulk row actions** — checkbox column with select-all; when rows selected, toolbar shows: Delete selected (with confirmation), Set IO Type, Set Signal Type, Set PLC Panel, Mark as Spare, Clear field groups (Alarms, Historian, Responsibility, Legacy)
  - **Module deletion cascades to signals** — PLC Hardware delete dialog warns about and removes connected IO list signals
  - Migration 004 adds ~50 columns; uses `io_type` instead of old `signal_type`, `signal_spec` for signal specification, `tag_name` as single field
- 1.3 IO List Excel Export — COMPLETE
  - Export button in IO List toolbar using exceljs library
  - Tauri save dialog for file path selection (`@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`)
  - Sheet 1 "IO List": project header, frozen header row, all 50+ columns, color-coded IO types, alternate row shading, auto-filter, spare rows in italic gray
  - Sheet 2 "IO Summary": counts by IO type (total/spare/active), module utilization table with color-coded percentages
  - Suggested filename includes project name and export date

- 1.4 Data Validation & Error Highlighting — COMPLETE
  - Duplicate tag name detection (red highlight on affected cells)
  - Duplicate PLC address detection (red highlight)
  - Channel exceeds module capacity warning (red highlight on channel cell)
  - AI/AO signals without range defined (amber warning on signal_low/signal_high)
  - Error/warning count badges in toolbar
  - "Errors Only" filter toggle to show only rows with validation issues
  - Rows with errors get red left border; warnings get amber left border
  - Export blocked when critical errors exist (button disabled with tooltip)
  - Validation runs on every data change via useMemo

**Phase 2 — Revision Tracking: COMPLETE**
- 2.1 Automatic Change Logging — COMPLETE
  - `useTrackedUpdate` hook wraps all DB writes with revision logging
  - Before each update, reads current values; logs changed fields to revisions table
  - Tracks field-level updates, multi-field updates, creates, and deletes
  - `changed_by` uses OS username from UserContext
  - Applied to all IO List operations: field edits, module assignment, channel changes, bulk set/clear/spare, single and bulk delete
  - Applied to PLC Hardware operations: create, edit, delete (including cascaded signal deletions)

- 2.2 Revision History View — COMPLETE
  - Timeline view with changes grouped by entity + timestamp + user
  - Day headers with sticky date separators
  - Human-readable descriptions ("Signal AI-101: Range Max changed from 100 to 150")
  - Color-coded action badges (Created/Updated/Deleted) and entity badges (Signal/PLC Hardware)
  - Entity labels resolved from DB (tag name for signals, module name for hardware)
  - Filters: entity type, action type, user, free-text search
  - Expandable field details for multi-field changes
  - Click navigation to affected entity's page
  - Pagination (30 events per page)

**Phase 3 — Cables & Panels: IN PROGRESS**
- 3.1 Cable Management Page — COMPLETE
  - Cable CRUD table with all fields: cable tag, type, core count, from/to location, from/to device, length, notes
  - 8 cable types: Power, Control, Instrumentation, Communication, Fiber Optic, Coaxial, Ethernet, Other
  - Click row to expand core mapping with inline editing (color, signal link, from/to terminal, notes)
  - Auto-sync cores when core_count changes (adds/removes cores to match)
  - Signal linking dropdown per core (from project signals)
  - Connected signals count badge per cable
  - Search and cable type filters
  - Revision tracking on all cable and core operations via useTrackedUpdate
  - Read-only mode support (all edit controls disabled)
  - Add/Edit cable dialog with validation
- 3.1b Cable Schedule Auto-Generation — COMPLETE
  - `src/lib/generate-cables.ts` — deterministic cable generation from IO List signals
  - Simple rule: one 3-core cable per hardwired signal that has a tag name and is not spare
  - Spare detection: is_spare flag, empty tag_name, or "spare" in description
  - SoftComm signals excluded (no physical cable)
  - Cable type from IO type: DI/DO→Control, AI/AO/RTD→Instrumentation, TC→Thermocouple
  - Core 1 linked to signal, cores 2-3 labelled as spare
  - Engineers rearrange/group cables after initial generation
  - Idempotent: only processes signals with cable_id IS NULL; safe to re-run
  - Deterministic sequential cable tags (CB-001, CB-002...) starting after highest existing
  - Creates cable_core rows with signal linkage + spare cores labeled
  - Revision tracking on generated cables
  - "Generate from IO List" button in Cables toolbar with confirmation dialog + result summary
  - Respects read-only mode
  - Fixed useTrackedUpdate to include cables table in updated_at handling

**Spreadsheet Navigation & Clipboard — COMPLETE**
- `src/hooks/useGridNav.ts` — shared hook for IO List and Cable Schedule tables
- Arrow Up/Down: move between rows in same column (skips non-editable cells)
- Tab/Shift+Tab: move to next/prev editable cell with row wrapping
- Enter: commit and move down (replaces old bespoke Enter handler)
- Ctrl+C: copies full cell value when no text selected; copies select option text
- Ctrl+V single cell: native for inputs; matches option text for selects
- Ctrl+V multi-cell: pastes tab/newline-separated rectangular range from focused cell
- Applied to all IO List cell types (TextInputCell, SelectInputCell, ModuleSelectCell, inline selects)
- Applied to Cable Schedule core mapping (color/signal selects, terminal/notes inputs)
- Selection and copy work in read-only mode; paste disabled when locked
- TextInputCell commit reads from DOM ref for paste compatibility

## Next Up

**Phase 3 — Cables & Panels** (continued, see `docs/EXECUTION-PLAN.md`)
