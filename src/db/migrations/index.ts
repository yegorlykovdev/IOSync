import initialSchema from "./001_initial_schema";
import addPlcPlatform from "./002_add_plc_platform";
import addModuleCategories from "./003_add_module_categories";
import ioListColumns from "./004_io_list_columns";
import cableCoreAssignment from "./005_cable_core_assignment";
import type { Migration } from "../migrate";

const migrations: Migration[] = [initialSchema, addPlcPlatform, addModuleCategories, ioListColumns, cableCoreAssignment];

export default migrations;
