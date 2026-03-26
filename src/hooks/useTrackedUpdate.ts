import { useCallback } from "react";
import { getDatabase } from "@/db/database";
import { useUser } from "@/contexts/UserContext";

/**
 * Hook that provides tracked database write operations.
 * Every change is logged to the revisions table with old/new values.
 */
export function useTrackedUpdate(projectId: number | undefined) {
  const { username } = useUser();

  /** Update a single field on a record and log the change. */
  const trackedUpdateField = useCallback(
    async (
      entityType: string,
      entityId: number,
      table: string,
      field: string,
      value: string | number | null
    ) => {
      if (!projectId) return;
      const db = await getDatabase();

      // Read current value
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT ${field} FROM ${table} WHERE id = $1`,
        [entityId]
      );
      const oldValue = rows[0]?.[field] ?? null;
      const oldStr = oldValue != null ? String(oldValue) : null;
      const newStr = value != null ? String(value) : null;

      // Perform the update
      await db.execute(
        `UPDATE ${table} SET ${field} = $1, updated_at = datetime('now') WHERE id = $2`,
        [value, entityId]
      );

      // Log if changed
      if (oldStr !== newStr) {
        await db.execute(
          `INSERT INTO revisions (project_id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [projectId, entityType, entityId, field, oldStr, newStr, username]
        );
      }
    },
    [projectId, username]
  );

  /** Update multiple fields on a record and log each change. */
  const trackedUpdateFields = useCallback(
    async (
      entityType: string,
      entityId: number,
      table: string,
      fields: Record<string, string | number | null>
    ) => {
      if (!projectId) return;
      const db = await getDatabase();
      const fieldNames = Object.keys(fields);

      // Read current values
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT ${fieldNames.join(", ")} FROM ${table} WHERE id = $1`,
        [entityId]
      );
      const current = rows[0] ?? {};

      // Build SET clause
      const setClauses = fieldNames.map((f, i) => `${f} = $${i + 1}`);
      setClauses.push(`updated_at = datetime('now')`);
      const values = fieldNames.map((f) => fields[f]);

      await db.execute(
        `UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = $${fieldNames.length + 1}`,
        [...values, entityId]
      );

      // Log each changed field
      for (const f of fieldNames) {
        const oldVal = current[f] != null ? String(current[f]) : null;
        const newVal = fields[f] != null ? String(fields[f]) : null;
        if (oldVal !== newVal) {
          await db.execute(
            `INSERT INTO revisions (project_id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [projectId, entityType, entityId, f, oldVal, newVal, username]
          );
        }
      }
    },
    [projectId, username]
  );

  /** Log a create event (all non-null fields as new values). */
  const trackedCreate = useCallback(
    async (
      entityType: string,
      entityId: number,
      fields: Record<string, string | number | null>
    ) => {
      if (!projectId) return;
      const db = await getDatabase();
      for (const [field, value] of Object.entries(fields)) {
        if (value != null) {
          await db.execute(
            `INSERT INTO revisions (project_id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
             VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
            [projectId, entityType, entityId, field, String(value), username]
          );
        }
      }
    },
    [projectId, username]
  );

  /** Log a delete event (snapshot all non-null fields as old values). */
  const trackedDelete = useCallback(
    async (
      entityType: string,
      entityId: number,
      table: string
    ) => {
      if (!projectId) return;
      const db = await getDatabase();

      // Read all current values before deleting
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM ${table} WHERE id = $1`,
        [entityId]
      );
      const record = rows[0];
      if (!record) return;

      // Log each non-null field
      for (const [field, value] of Object.entries(record)) {
        if (field === "id" || field === "project_id" || field === "created_at" || field === "updated_at") continue;
        if (value != null) {
          await db.execute(
            `INSERT INTO revisions (project_id, entity_type, entity_id, field_name, old_value, new_value, changed_by)
             VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
            [projectId, entityType, entityId, field, String(value), username]
          );
        }
      }
    },
    [projectId, username]
  );

  return { trackedUpdateField, trackedUpdateFields, trackedCreate, trackedDelete };
}
