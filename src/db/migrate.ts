import Database from "@tauri-apps/plugin-sql";

export interface Migration {
  version: number;
  name: string;
  up: string;
}

async function ensureMigrationsTable(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function getAppliedVersions(db: Database): Promise<Set<number>> {
  const rows = await db.select<{ version: number }[]>(
    "SELECT version FROM _migrations ORDER BY version"
  );
  return new Set(rows.map((r) => r.version));
}

export async function runMigrations(
  db: Database,
  migrations: Migration[]
): Promise<void> {
  await db.execute("PRAGMA foreign_keys = ON;");
  await ensureMigrationsTable(db);

  const applied = await getAppliedVersions(db);
  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    console.log(`[migrate] Applying migration ${migration.version}: ${migration.name}`);

    // Split multi-statement SQL and execute each statement
    const statements = migration.up
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await db.execute(stmt);
    }

    await db.execute(
      "INSERT OR REPLACE INTO _migrations (version, name) VALUES ($1, $2)",
      [migration.version, migration.name]
    );

    console.log(`[migrate] Applied migration ${migration.version}: ${migration.name}`);
  }

  if (pending.length === 0) {
    console.log("[migrate] Database is up to date");
  }
}
