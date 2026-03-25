# IOSync

Desktop app for control engineers to manage IO Lists, Cable Schedules, and Panel Drawings from a single source of truth. Built with Tauri 2.0 (Rust backend) + React 19 + TypeScript + Vite + SQLite + Tailwind CSS v4 + shadcn/ui.

## Tech Notes

- **Package manager:** pnpm
- **Database:** SQLite via `@tauri-apps/plugin-sql` (frontend) + `tauri-plugin-sql` (Rust)
- **Migrations:** Custom TS runner in `src/db/migrate.ts` — runs on app startup
- **Routing:** react-router-dom with layout route in `src/App.tsx`
- **State:** React context for selected project (`src/contexts/ProjectContext.tsx`)
- **Theme:** Dark/light with CSS variables, toggle in top bar, persisted to localStorage
- **Path alias:** `@/` maps to `src/`
- **Build check:** Always run `pnpm tauri build` after changes to verify both TS and Rust compile
- **PLC Addressing:** Multi-platform address formatter in `src/lib/plc-address.ts` — platform is stored per-project

## Database Schema

10 tables across 2 migrations:

**001_initial_schema:** Core tables
- **projects** — top-level entity; includes `plc_platform`, `custom_address_prefix`, `custom_address_pattern` (added in 002)
- **plc_hardware** → projects — PLC modules with rack/slot/channel info
- **signals** → projects, plc_hardware, cables, panels — IO points (DI/DO/AI/AO)
- **cables** → projects — cable runs between locations/devices
- **cable_cores** → cables, signals — individual cores within a cable
- **panels** → projects — physical panel enclosures
- **panel_components** → panels — devices placed on panels
- **terminal_blocks** → panel_components — terminal strips on components
- **revisions** → projects — audit log of all field-level changes
- **snapshots** → projects — named full-project JSON dumps for versioning

**002_add_plc_platform:** Adds `plc_platform`, `custom_address_prefix`, `custom_address_pattern` to projects

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

## Project Structure

```
src/
  App.tsx                    — Root: DB init, routing, providers
  App.css                    — Tailwind + theme CSS variables (light + dark)
  db/                        — Database layer
    database.ts              — Singleton getDatabase()
    migrate.ts               — Migration runner
    migrations/              — Numbered migration files (001, 002)
  lib/
    utils.ts                 — cn() utility for Tailwind class merging
    plc-address.ts           — Multi-platform PLC address formatter
  components/
    layout/                  — AppLayout, Sidebar, TopBar
    ui/                      — shadcn/ui components
  contexts/
    ProjectContext.tsx        — Selected project state + CRUD + updateProject
  hooks/
    useTheme.ts              — Dark/light theme toggle
  pages/
    ProjectsPage.tsx         — Project list + create dialog (with platform selector)
    PlcHardwarePage.tsx      — PLC module CRUD + utilization + address display
    PlaceholderPage.tsx      — Stub for unbuilt pages
src-tauri/
  src/lib.rs                 — Tauri plugins (opener, sql)
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

## Next Up

**Phase 1 — IO List MVP** (continued, see `docs/EXECUTION-PLAN.md`)

1. **1.2 IO List Entry & Editing** — Editable data grid with @tanstack/react-table, inline editing, sorting/filtering, color-coded signal types, auto-save to SQLite
2. **1.3 IO List Excel Export** — .xlsx export with exceljs, formatted sheets for IO List + IO Summary
3. **1.4 Data Validation** — Duplicate detection, capacity warnings, error highlighting, export blocking on critical errors
