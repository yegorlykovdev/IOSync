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

10 tables across 3 migrations:

**001_initial_schema:** Core tables
- **projects** — top-level entity; includes `plc_platform`, `custom_address_prefix`, `custom_address_pattern` (added in 002)
- **plc_hardware** → projects — PLC modules with rack/slot/channel info; supports 3 categories: IO, Communication, CPU (added in 003)
- **signals** → projects, plc_hardware, cables, panels — IO points (DI/DO/AI/AO)
- **cables** → projects — cable runs between locations/devices
- **cable_cores** → cables, signals — individual cores within a cable
- **panels** → projects — physical panel enclosures
- **panel_components** → panels — devices placed on panels
- **terminal_blocks** → panel_components — terminal strips on components
- **revisions** → projects — audit log (changed_by = OS username)
- **snapshots** → projects — named full-project JSON dumps for versioning

**002_add_plc_platform:** Adds `plc_platform`, `custom_address_prefix`, `custom_address_pattern` to projects

**003_add_module_categories:** Adds `module_category` (io/communication/cpu), `protocol`, `ip_address`, `port`, `baud_rate`, `station_address`, `firmware_version` to plc_hardware

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
- All create/edit/delete buttons are disabled across Projects and PLC Hardware pages
- Lock is released on window unload or component unmount; stale locks (>1 hour) are auto-overridden

## Project Structure

```
src/
  App.tsx                    — Root: DB init, routing, providers (UserProvider, ProjectProvider)
  App.css                    — Tailwind + theme CSS variables (light + dark)
  db/                        — Database layer
    database.ts              — Singleton getDatabase()
    migrate.ts               — Migration runner (handles partial re-runs)
    migrations/              — Numbered migration files (001, 002, 003)
  lib/
    utils.ts                 — cn() utility for Tailwind class merging
    plc-address.ts           — Multi-platform PLC address formatter
  components/
    layout/                  — AppLayout, Sidebar, TopBar (shows user + lock status)
    ui/                      — shadcn/ui components
  contexts/
    ProjectContext.tsx        — Selected project state + CRUD + readOnly flag
    UserContext.tsx           — OS username from Rust command
  hooks/
    useTheme.ts              — Dark/light theme toggle
    useFileLock.ts           — Acquire/release .lock file via Rust commands
  pages/
    ProjectsPage.tsx         — Project list + create dialog (with platform selector)
    PlcHardwarePage.tsx      — PLC module CRUD + utilization + address display + module categories (IO/Comm/CPU)
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

## Next Up

**Phase 1 — IO List MVP** (continued, see `docs/EXECUTION-PLAN.md`)

1. **1.2 IO List Entry & Editing** — Editable data grid with @tanstack/react-table, inline editing, sorting/filtering, color-coded signal types, auto-save to SQLite
2. **1.3 IO List Excel Export** — .xlsx export with exceljs, formatted sheets for IO List + IO Summary
3. **1.4 Data Validation** — Duplicate detection, capacity warnings, error highlighting, export blocking on critical errors
