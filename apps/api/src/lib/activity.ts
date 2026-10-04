import type { ActivityAction, ActivityChange, EntityType } from '@rdms/shared';
import { inArray } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db/index.js';

export interface LogInput {
  projectId: string | null;
  entityType: EntityType;
  entityId: string;
  entityLabel: string | null;
  userId: string | null;
  action: ActivityAction;
  changes?: ActivityChange[] | null;
  note?: string | null;
}

export async function logActivity(input: LogInput, tx: DbOrTx = db) {
  if (input.action === 'updated' && input.changes && input.changes.length === 0) return;
  await tx.insert(schema.activityLogs).values({
    projectId: input.projectId,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    userId: input.userId,
    action: input.action,
    changes: input.changes ?? null,
    note: input.note ?? null,
  });
}

const normalize = (v: unknown) => {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
};

/**
 * Computes field-level changes between two records, limited to `fields`
 * (or all keys of `after` when omitted).
 */
export function diffRecords<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields?: (keyof T)[]): ActivityChange[] {
  const keys = (fields ?? (Object.keys(after) as (keyof T)[])) as string[];
  const changes: ActivityChange[] = [];
  for (const key of keys) {
    if (!(key in after)) continue;
    const from = normalize(before[key]);
    const to = normalize(after[key]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes.push({ field: key, from, to });
  }
  return changes;
}

const USER_FIELDS = new Set(['responsibleId', 'designerId', 'userId']);
const SYSTEM_FIELDS = new Set(['systemId']);

/** Replaces user/system ids in changes with readable labels so history survives renames/deletions. */
export async function labelChanges(changes: ActivityChange[], tx: DbOrTx = db): Promise<ActivityChange[]> {
  const userIds = new Set<string>();
  const systemIds = new Set<string>();
  for (const ch of changes) {
    const bucket = USER_FIELDS.has(ch.field) ? userIds : SYSTEM_FIELDS.has(ch.field) ? systemIds : null;
    if (!bucket) continue;
    if (typeof ch.from === 'string') bucket.add(ch.from);
    if (typeof ch.to === 'string') bucket.add(ch.to);
  }
  const userNames = new Map<string, string>();
  const systemNames = new Map<string, string>();
  if (userIds.size) {
    const rows = await tx.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, [...userIds]));
    rows.forEach((r) => userNames.set(r.id, r.name));
  }
  if (systemIds.size) {
    const rows = await tx.select({ id: schema.systems.id, name: schema.systems.name }).from(schema.systems).where(inArray(schema.systems.id, [...systemIds]));
    rows.forEach((r) => systemNames.set(r.id, r.name));
  }
  return changes.map((ch) => {
    const map = USER_FIELDS.has(ch.field) ? userNames : SYSTEM_FIELDS.has(ch.field) ? systemNames : null;
    if (!map) return ch;
    return {
      ...ch,
      fromLabel: typeof ch.from === 'string' ? (map.get(ch.from) ?? null) : null,
      toLabel: typeof ch.to === 'string' ? (map.get(ch.to) ?? null) : null,
    };
  });
}
