# IO Manager — Execution Plan for Claude Code

## Project Summary

**App:** Desktop application for control engineers to create and manage IO Lists, Cable Schedules, and Panel Drawings from a single source of truth.
**Stack:** Tauri 2.0 + React + TypeScript + SQLite (via Tauri plugin)
**Platform:** Windows + macOS installable app
**Dev method:** Claude Code (primary), ~10–15 hrs/week

---

## Total Timeline Estimate

| Phase | What You Get | Estimated Hours | Calendar Time |
|-------|-------------|----------------|---------------|
| 0 — Scaffold | Empty app running on desktop | 4–6 hrs | Weekend 1 |
| 1 — IO List MVP | Create, edit, export IO lists | 20–30 hrs | Weeks 2–4 |
| 2 — Revision Tracking | Change log, snapshots, diff view | 15–20 hrs | Weeks 5–6 |
| 3 — Cable Schedule | Auto-generated from IO data | 15–25 hrs | Weeks 7–9 |
| 4 — Panel Layout | Visual panel editor + DXF export | 30–45 hrs | Weeks 10–14 |
| 5 — Polish & Package | Installer, settings, UX polish | 10–15 hrs | Weeks 15–16 |
| **Total** | **Full V1** | **~95–140 hrs** | **~3.5–4 months** |

A **usable MVP** (IO List + revision tracking + cable schedule) is reachable in **~8–9 weeks**.

---

## Phase 0 — Project Scaffold (Weekend 1)

**Goal:** Empty Tauri + React app that launches on your Mac, with the database ready.

### Claude Code Prompts (run in sequence)

#### 0.1 — Initialize the project
```
Create a new Tauri 2.0 app with React + TypeScript + Vite frontend.
Project name: io-manager
Location: ~/Projects/io-manager
Use pnpm as package manager.
Add Tailwind CSS 4 and shadcn/ui for the component library.
Add tauri-plugin-sql with SQLite support.
Add react-router-dom for routing.
Verify it builds and launches with `pnpm tauri dev`.
```

#### 0.2 — Set up the database schema
```
In the io-manager Tauri app, create a SQLite migration system.
Create the initial migration with these tables:

projects (id, name, project_number, client, description, created_at, updated_at)

plc_hardware (id, project_id, plc_name, rack, slot, module_type, channels, 
  channel_type [DI/DO/AI/AO], created_at)

signals (id, project_id, tag, description, signal_type [DI/DO/AI/AO], 
  plc_hardware_id, channel_number, plc_address, 
  range_min, range_max, engineering_unit,
  cable_id, panel_id, terminal_block, terminal_number,
  field_device_tag, field_device_description,
  notes, created_at, updated_at)

cables (id, project_id, cable_tag, cable_type, core_count, 
  from_location, to_location, from_device, to_device, 
  length_m, notes, created_at, updated_at)

cable_cores (id, cable_id, core_number, core_color, signal_id, 
  from_terminal, to_terminal, notes)

panels (id, project_id, panel_name, panel_description, location, 
  width_mm, height_mm, created_at, updated_at)

panel_components (id, panel_id, component_type, device_tag, 
  description, manufacturer, part_number, 
  x_position, y_position, width_mm, height_mm,
  created_at, updated_at)

terminal_blocks (id, panel_component_id, tb_tag, terminal_count, 
  terminal_type, created_at)

revisions (id, project_id, entity_type, entity_id, field_name, 
  old_value, new_value, changed_by, changed_at, 
  snapshot_name)

snapshots (id, project_id, name, description, created_at, 
  snapshot_data TEXT)

Add foreign keys and indexes on project_id and frequently queried columns.
Run the migration on app startup.
```

#### 0.3 — Basic app shell with navigation
```
Create the app shell for io-manager with:
- Sidebar navigation: Projects, IO List, Cables, Panels, Revisions
- Top bar showing current project name
- A "Projects" page that lists all projects and lets you create a new one
- Use shadcn/ui components, clean dark/light theme
- Store selected project ID in React context
- All pages show "Select a project" if none is selected
```

**Checkpoint:** App launches, you can create a project, navigate between empty pages. ~4–6 hours.

---

## Phase 1 — IO List MVP (Weeks 2–4)

**Goal:** Engineers can define PLC hardware, create IO points, and export a formatted IO list to Excel.

### Claude Code Prompts

#### 1.1 — PLC Hardware Configuration
```
In io-manager, build the PLC Hardware page:
- Table showing all PLC modules for the current project
- "Add Module" form: PLC name, rack, slot, module type (dropdown), 
  channel count, channel type (DI/DO/AI/AO)
- Edit and delete existing modules
- Auto-calculate available PLC addresses based on rack/slot/channel
- Show channel utilization (used/total) per module
- Store in plc_hardware table via tauri-plugin-sql
```

#### 1.2 — IO List Entry & Editing
```
In io-manager, build the IO List page — the core of the app:
- Editable data grid showing all signals for the current project
  (use @tanstack/react-table with inline editing)
- Columns: Tag, Description, Signal Type, PLC Module (dropdown from 
  plc_hardware), Channel, PLC Address (auto-calculated), 
  Range Min/Max, Eng. Unit, Field Device Tag, 
  Field Device Description, Cable Tag, Terminal Block, 
  Terminal Number, Notes
- Sorting, filtering, and column visibility toggles
- Bulk actions: select multiple rows, delete, change field
- "Add Signal" button and inline row creation
- Auto-suggest next available channel when PLC module is selected
- Color-code rows by signal type (DI=green, DO=blue, AI=orange, AO=red)
- Show total IO count summary at bottom (DI: X, DO: X, AI: X, AO: X)
- Every edit saves immediately to SQLite
```

#### 1.3 — IO List Excel Export
```
In io-manager, add Excel export for the IO list:
- Use exceljs library (install it)
- Export button on the IO List page
- Generate .xlsx with these sheets:
  Sheet 1 "IO List": all signals with formatted headers, auto-width columns,
    frozen header row, color-coded signal types, company header with 
    project info at top
  Sheet 2 "IO Summary": counts by type, by PLC module, utilization %
- Save dialog using Tauri's file dialog API
- Include project name and export date in filename suggestion
```

#### 1.4 — Data Validation & Error Highlighting
```
In io-manager, add validation to the IO list:
- Highlight duplicate tags in red
- Highlight duplicate PLC address assignments in red
- Warn when channel number exceeds module capacity
- Warn when AI/AO signal has no range defined
- Show validation error count in the top bar
- Add a "Show Errors Only" filter toggle
- Validate on every edit and on export (block export if critical errors exist)
```

**Checkpoint:** You can define PLC hardware, enter IO points, validate, and export a professional IO list to Excel. This alone is useful on real projects. ~20–30 hours.

---

## Phase 2 — Revision Tracking (Weeks 5–6)

**Goal:** Every change is logged. Engineers can create named snapshots and compare versions.

### Claude Code Prompts

#### 2.1 — Automatic Change Logging
```
In io-manager, implement automatic revision tracking:
- Create a React hook useTrackedUpdate() that wraps every database write
- Before updating any signal/cable/panel record, read the current values
- Log each changed field to the revisions table 
  (entity_type, entity_id, field_name, old_value, new_value, timestamp)
- Changed_by: for now use a "current user" setting in app preferences
- Apply this hook to all existing create/update/delete operations 
  in IO List and PLC Hardware pages
```

#### 2.2 — Revision History View
```
In io-manager, build the Revisions page:
- Timeline view showing all changes, newest first
- Filter by: entity type (signal, cable, panel), date range, user
- Each entry shows: timestamp, user, what changed 
  ("Signal AI-101: Range Max changed from 100 to 150")
- Click an entry to navigate to the affected record
- Group changes by entity to show full edit history of one signal/cable
```

#### 2.3 — Named Snapshots
```
In io-manager, add snapshot functionality:
- "Create Snapshot" button on the Revisions page
- Name the snapshot (e.g., "Issued for Approval Rev.A", "As-Built")
- Snapshots save a full JSON dump of all project data to the snapshots table
- List all snapshots with date and description
- "Compare with Current" button that shows a diff:
  added signals (green), removed (red), changed (yellow with old→new values)
- "Restore Snapshot" with confirmation dialog 
  (creates a new snapshot of current state first as backup)
```

**Checkpoint:** Full audit trail. Create named versions like "IFA Rev A", compare changes. ~15–20 hours.

---

## Phase 3 — Cable Schedule (Weeks 7–9)

**Goal:** Cable data auto-populates from IO assignments. Full cable schedule with core mapping.

### Claude Code Prompts

#### 3.1 — Cable Management Page
```
In io-manager, build the Cables page:
- Table of all cables for the current project
- Columns: Cable Tag, Type, Core Count, From Location → To Location, 
  From Device → To Device, Length, Connected Signals count, Notes
- "Add Cable" form with all fields
- Click a cable row to expand and show core mapping:
  Core Number, Color, Connected Signal Tag, From Terminal, To Terminal
- Auto-create cables: button that scans signals with cable_tag 
  assigned but no matching cable record, and creates them
- Apply revision tracking to all cable operations
```

#### 3.2 — Signal-Cable Linking
```
In io-manager, add signal-cable linking:
- On the IO List page, the Cable Tag column becomes a smart dropdown:
  shows existing cables, or "Create New Cable" option
- When a signal is linked to a cable, show an "Assign Core" dialog:
  pick core number from available cores, set terminal details
- On the Cables page, add "Assign Signals" view: 
  drag signals from an unassigned list onto cable cores
- Show warnings: signals without cables, cables with unassigned cores,
  core count mismatches
- Bidirectional: changing cable assignment on IO List updates Cables page and vice versa
```

#### 3.3 — Cable Schedule Excel Export
```
In io-manager, add cable schedule export:
- Export button on Cables page
- Generate .xlsx with sheets:
  Sheet 1 "Cable Schedule": one row per cable with summary columns
  Sheet 2 "Core Mapping": one row per core, showing full from-to path
  Sheet 3 "Cable Summary": totals by cable type, total length
- Match the visual style of the IO List export (same header, branding)
- Option to export combined document (IO List + Cable Schedule in one file)
```

**Checkpoint:** Cables are managed alongside IO, core-level mapping, professional exports. ~15–25 hours.

---

## Phase 4 — Panel Layout (Weeks 10–14)

**Goal:** Visual panel editor where components are placed, wired, and exported as drawings.

### Claude Code Prompts

#### 4.1 — Panel Component Library
```
In io-manager, build a component library system:
- Settings page: "Component Library" section
- CRUD for component templates: name, type (PLC, terminal block, relay, 
  breaker, power supply, switch, etc.), manufacturer, part number,
  default width_mm, default height_mm, symbol SVG
- Pre-load common components: 
  generic terminal block (various sizes), DIN rail, 
  common PLC form factors, circuit breakers, relays
- Import/export library as JSON for team sharing
```

#### 4.2 — Panel Canvas Editor
```
In io-manager, build the Panel Layout visual editor:
- SVG/Canvas-based panel view with zoom and pan
- Panel background shows dimensions (mm) with grid snap
- Drag components from library onto panel
- Components render as rectangles with label and terminal points
- Snap to DIN rail positions
- Select, move, resize, delete components
- Right-click component to edit properties
- Show terminal blocks with individual terminal numbers
- Draw wiring connections between terminals as lines/paths
- Auto-route wiring (simple horizontal/vertical paths)
- Wire colors match cable core colors from cable_cores table
- Component placement saved to panel_components table
- Apply revision tracking to all panel operations
```

#### 4.3 — Panel Drawing Export
```
In io-manager, add panel drawing exports:
- Export as SVG (for web/sharing)
- Export as PDF with title block (project info, revision, date, scale)
- Export as DXF for AutoCAD import:
  use a DXF writer library (e.g., dxf-writer or custom)
  separate layers: panel outline, components, wiring, labels, dimensions
- Title block template configurable in settings
- Standard paper sizes: A3, A2, A1 landscape
- Scale indicator and dimension annotations
```

**Checkpoint:** Visual panel layouts that sync with IO and cable data. This is the most complex phase. ~30–45 hours.

---

## Phase 5 — Polish & Packaging (Weeks 15–16)

### Claude Code Prompts

#### 5.1 — App Settings & Preferences
```
In io-manager, add a Settings page:
- User profile: name (used for revision tracking)
- Company info: name, logo (for export headers)
- Default values: signal types, cable types, engineering units
- Export templates: customize header layout, column selection
- Theme: light/dark toggle (already via Tailwind)
- Auto-save interval setting
- Data location: where .db project files are stored
```

#### 5.2 — Project File Management
```
In io-manager, add project file management:
- Each project is a single .db file (SQLite)
- "Save As" to export the project file to a chosen location
- "Open Project" to load a .db file
- Recent projects list on the home screen
- "Duplicate Project" to create a copy
- "Export Project Bundle": .zip with .db + all exports (xlsx, pdf, dxf)
```

#### 5.3 — Build & Distribute
```
In io-manager, configure Tauri for production builds:
- App icon (provide a generic engineering icon for now)
- Windows: MSI or NSIS installer via tauri build
- macOS: DMG bundle via tauri build
- App signing notes for both platforms (document the process)
- Auto-update: configure Tauri's updater plugin with a 
  GitHub Releases endpoint
- Create a GitHub Actions workflow: 
  on tag push, build for Windows + macOS, upload to GitHub Releases
```

---

## Claude Code Tips for This Project

### Session Management
Each Claude Code session has a context limit. Structure your work as:
- **One prompt per feature block** (e.g., 1.1, 1.2, etc.)
- Start each session with: "Continue working on io-manager. We're on Phase X, step Y."
- If a prompt gets complex, split it: build the UI first, then the data layer

### Keep a PROGRESS.md
After each session, ask Claude Code:
```
Update PROGRESS.md with what we completed today, 
any known issues, and what's next.
```

### Testing As You Go
After each feature block, test manually and note bugs:
```
I found these issues with the IO List page:
1. [description]
2. [description]
Fix them.
```

### Database Migrations
When you need schema changes after Phase 0:
```
Add a migration to add column [X] to [table]. 
Don't break existing data. Update all queries that 
touch this table.
```

---

## Risk Factors & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Panel editor complexity | Phase 4 takes 2x longer | Skip DXF export initially, start with SVG/PDF only |
| Tauri 2.0 quirks | Build issues on Windows vs Mac | Test on both platforms at end of each phase |
| SQLite performance with large projects | Slow queries with 5000+ signals | Add indexes early, paginate data grids |
| Scope creep | Never ship | Stick to the phases. IO List alone is valuable |

---

## What "Done" Looks Like per Phase

- **After Phase 1:** You can use this on a real project for IO lists tomorrow
- **After Phase 2:** You have an audit trail your QA process will love  
- **After Phase 3:** Cable schedules auto-generate — biggest time saver
- **After Phase 4:** Full integrated document set from one data source
- **After Phase 5:** Hand the installer to colleagues, they can use it independently
