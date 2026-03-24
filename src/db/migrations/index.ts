import initialSchema from "./001_initial_schema";
import type { Migration } from "../migrate";

const migrations: Migration[] = [initialSchema];

export default migrations;
