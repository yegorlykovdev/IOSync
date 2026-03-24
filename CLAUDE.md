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

## Database Schema

10 tables in `src/db/migrations/001_initial_schema.ts`:

- **projects** — top-level entity, all others reference via `project_id`
- **plc_hardware** → projects — PLC modules with rack/slot/channel info
- **signals** → projects, plc_hardware, cables, panels — IO points (DI/DO/AI/AO)
- **cables** → projects — cable runs between locations/devices
- **cable_cores** → cables, signals — individual cores within a cable
- **panels** → projects — physical panel enclosures
- **panel_components** → panels — devices placed on panels
- **terminal_blocks** → panel_components — terminal strips on components
- **revisions** → projects — audit log of all field-level changes
- **snapshots** → projects — named full-project JSON dumps for versioning

All tables have foreign keys with CASCADE/SET NULL and indexes on `project_id` + frequently queried columns.

## Project Structure

```
src/
  App.tsx                    — Root: DB init, routing, providers
  App.css                    — Tailwind + theme CSS variables
  db/                        — Database layer
    database.ts              — Singleton getDatabase()
    migrate.ts               — Migration runner
    migrations/              — Numbered migration files
  components/
    layout/                  — AppLayout, Sidebar, TopBar
    ui/                      — shadcn/ui components
  contexts/
    ProjectContext.tsx        — Selected project state + CRUD
  hooks/
    useTheme.ts              — Dark/light theme toggle
  pages/
    ProjectsPage.tsx         — Project list + create dialog
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

## Next Phase

**Phase 1 — IO List MVP** (see `docs/EXECUTION-PLAN.md` for full details)

1. **1.1 PLC Hardware Configuration** — Table of PLC modules, add/edit/delete, channel utilization display
2. **1.2 IO List Entry & Editing** — Editable data grid with @tanstack/react-table, inline editing, sorting/filtering, color-coded signal types, auto-save to SQLite
3. **1.3 IO List Excel Export** — .xlsx export with exceljs, formatted sheets for IO List + IO Summary
4. **1.4 Data Validation** — Duplicate detection, capacity warnings, error highlighting, export blocking on critical errors
