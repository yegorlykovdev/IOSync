import initialSchema from "./001_initial_schema";
import addPlcPlatform from "./002_add_plc_platform";
import type { Migration } from "../migrate";

const migrations: Migration[] = [initialSchema, addPlcPlatform];

export default migrations;
