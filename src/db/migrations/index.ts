import initialSchema from "./001_initial_schema";
import addPlcPlatform from "./002_add_plc_platform";
import addModuleCategories from "./003_add_module_categories";
import ioListColumns from "./004_io_list_columns";
import cableCoreAssignment from "./005_cable_core_assignment";
import panelScopeCables from "./006_panel_scope_cables";
import panelScopeHardware from "./007_panel_scope_hardware";
import uniqueRackSlotPerPanel from "./008_unique_rack_slot_per_panel";
import revisionPanelId from "./009_revision_panel_id";
import type { Migration } from "../migrate";

const migrations: Migration[] = [initialSchema, addPlcPlatform, addModuleCategories, ioListColumns, cableCoreAssignment, panelScopeCables, panelScopeHardware, uniqueRackSlotPerPanel, revisionPanelId];

export default migrations;
