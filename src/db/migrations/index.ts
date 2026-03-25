import initialSchema from "./001_initial_schema";
import addPlcPlatform from "./002_add_plc_platform";
import addModuleCategories from "./003_add_module_categories";
import type { Migration } from "../migrate";

const migrations: Migration[] = [initialSchema, addPlcPlatform, addModuleCategories];

export default migrations;
