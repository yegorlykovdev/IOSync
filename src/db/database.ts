import Database from "@tauri-apps/plugin-sql";
import { runMigrations } from "./migrate";
import migrations from "./migrations";

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  db = await Database.load("sqlite:iosync.db");
  await runMigrations(db, migrations);

  return db;
}
