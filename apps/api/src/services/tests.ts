import type { Test, TestInput, UpdateTestInput } from '@rdms/shared';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db/index.js';
import { diffRecords, labelChanges, logActivity } from '../lib/activity.js';
import type { AuthUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { assertActiveUsers, canManageProject, canManageSystem, type ProjectAccess } from '../lib/permissions.js';
import { serializeTest } from '../lib/serialize.js';

type TestRow = typeof schema.tests.$inferSelect;

export async function loadTests(projectId: string, tx: DbOrTx = db): Promise<Test[]> {
  const rows = await tx.select().from(schema.tests).where(eq(schema.tests.projectId, projectId)).orderBy(desc(schema.tests.date), desc(schema.tests.createdAt));
  return rows.map(serializeTest);
}

export async function getTestOrThrow(projectId: string, id: string, tx: DbOrTx = db): Promise<Test> {
  const [row] = await tx
    .select()
    .from(schema.tests)
    .where(and(eq(schema.tests.id, id), eq(schema.tests.projectId, projectId)))
    .limit(1);
  if (!row) throw notFound('Prueba no encontrada');
  return serializeTest(row);
}

const clean = <T extends Record<string, unknown>>(input: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  return out as T;
};

/** Resolve the system of a test (explicit, or inherited from its component) and validate membership. */
async function resolveScope(tx: DbOrTx, projectId: string, input: { systemId?: string | null; componentId?: string | null }) {
  let systemId = input.systemId ?? null;
  if (input.componentId) {
    const [c] = await tx
      .select({ id: schema.components.id, systemId: schema.components.systemId })
      .from(schema.components)
      .where(and(eq(schema.components.id, input.componentId), eq(schema.components.projectId, projectId)))
      .limit(1);
    if (!c) throw badRequest('El componente no pertenece a este proyecto');
    systemId = systemId ?? c.systemId;
  }
  if (systemId) {
    const [s] = await tx
      .select({ id: schema.systems.id })
      .from(schema.systems)
      .where(and(eq(schema.systems.id, systemId), eq(schema.systems.projectId, projectId)))
      .limit(1);
    if (!s) throw badRequest('El sistema no pertenece a este proyecto');
  }
  return systemId;
}

/** Responsible, system leads and project leads can edit a test; any member can create one. */
const canEditTest = (access: ProjectAccess, userId: string, t: Test) => canManageProject(access) || (t.systemId ? canManageSystem(access, t.systemId) : false) || t.responsibleId === userId;

export async function createTest(user: AuthUser, access: ProjectAccess, projectId: string, raw: TestInput): Promise<Test> {
  const input = clean(raw);
  return db.transaction(async (tx) => {
    const systemId = await resolveScope(tx, projectId, input);
    const responsibleId = input.responsibleId ?? user.id;
    await assertActiveUsers([responsibleId], tx);
    const [row] = await tx
      .insert(schema.tests)
      .values({
        projectId,
        systemId,
        componentId: input.componentId ?? null,
        name: input.name,
        type: input.type ?? null,
        date: input.date ?? null,
        responsibleId,
        objective: input.objective ?? null,
        result: input.result ?? null,
        status: input.status,
        observations: input.observations ?? null,
      })
      .returning();
    await logActivity({ projectId, entityType: 'test', entityId: row.id, entityLabel: row.name, userId: user.id, action: 'created', changes: [{ field: 'status', from: null, to: row.status }] }, tx);
    return serializeTest(row);
  });
}

const UPDATABLE: (keyof UpdateTestInput)[] = ['name', 'type', 'systemId', 'componentId', 'date', 'responsibleId', 'objective', 'result', 'status', 'observations'];

export async function updateTest(user: AuthUser, access: ProjectAccess, current: Test, raw: UpdateTestInput): Promise<Test> {
  const input = clean(raw);
  if (!canEditTest(access, user.id, current)) throw forbidden('No puedes editar esta prueba');
  return db.transaction(async (tx) => {
    const patch: Partial<TestRow> = {};
    for (const f of UPDATABLE) if (f in input) (patch as Record<string, unknown>)[f] = input[f] ?? null;
    if ('name' in patch && patch.name == null) delete patch.name;
    if ('status' in patch && patch.status == null) delete patch.status;
    if ('componentId' in input || 'systemId' in input) {
      patch.systemId = await resolveScope(tx, current.projectId, { systemId: input.systemId ?? current.systemId, componentId: input.componentId === undefined ? current.componentId : input.componentId });
    }
    if (patch.responsibleId) await assertActiveUsers([patch.responsibleId], tx);
    const changes = diffRecords(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    if (changes.length === 0) return current;
    await tx.update(schema.tests).set(patch).where(eq(schema.tests.id, current.id));
    const statusChange = changes.find((c) => c.field === 'status');
    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'test',
        entityId: current.id,
        entityLabel: (patch.name as string | undefined) ?? current.name,
        userId: user.id,
        action: statusChange && changes.length === 1 ? 'status_changed' : 'updated',
        changes: await labelChanges(changes, tx),
        note: statusChange ? (input.result ?? null) : null,
      },
      tx,
    );
    return getTestOrThrow(current.projectId, current.id, tx);
  });
}

export async function deleteTest(user: AuthUser, access: ProjectAccess, current: Test) {
  if (!canEditTest(access, user.id, current)) throw forbidden('No puedes eliminar esta prueba');
  await db.transaction(async (tx) => {
    await tx.delete(schema.tests).where(eq(schema.tests.id, current.id));
    await logActivity({ projectId: current.projectId, entityType: 'test', entityId: current.id, entityLabel: current.name, userId: user.id, action: 'deleted' }, tx);
  });
}
