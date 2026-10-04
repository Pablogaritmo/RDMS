import { INSPECTION_RESULTS, statusOrder, type ComponentStatus, type Inspection, type InspectionInput } from '@rdms/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db/index.js';
import { logActivity } from '../lib/activity.js';
import type { AuthUser } from '../lib/auth.js';
import { forbidden, notFound } from '../lib/errors.js';
import { canViewProject, type ProjectAccess } from '../lib/permissions.js';
import { serializeInspection } from '../lib/serialize.js';
import { changeStatus, getComponentOrThrow, type StatusChangeResult } from './components.js';

export async function loadInspections(projectId: string, tx: DbOrTx = db): Promise<Inspection[]> {
  const rows = await tx
    .select({ i: schema.inspections })
    .from(schema.inspections)
    .innerJoin(schema.components, eq(schema.components.id, schema.inspections.componentId))
    .where(eq(schema.components.projectId, projectId))
    .orderBy(desc(schema.inspections.date), desc(schema.inspections.createdAt));
  return rows.map((r) => serializeInspection(r.i));
}

export interface InspectionResultPayload {
  inspection: Inspection;
  statusChange: StatusChangeResult | null;
}

/**
 * Records an inspection. Any project member can inspect (a second pair of eyes is
 * encouraged). Side effects on the component status:
 *   rejected            → back to "En fabricación" (or "Diseño" if it was never fabricated)
 *   approved (any kind) → "Completado" when the component was waiting in "Inspección"
 */
export async function recordInspection(user: AuthUser, access: ProjectAccess, projectId: string, input: InspectionInput): Promise<InspectionResultPayload> {
  if (!canViewProject(access)) throw forbidden();
  const component = await getComponentOrThrow(projectId, input.componentId);
  const label = INSPECTION_RESULTS.find((r) => r.key === input.result)?.label ?? input.result;

  const inspection = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.inspections)
      .values({ componentId: component.id, inspectorId: user.id, date: input.date, result: input.result, observations: input.observations?.trim() || null })
      .returning();
    await logActivity(
      {
        projectId,
        entityType: 'component',
        entityId: component.id,
        entityLabel: `${component.code} ${component.name}`,
        userId: user.id,
        action: 'inspected',
        changes: [{ field: 'inspection', from: null, to: input.result, toLabel: label }],
        note: input.observations?.trim() || null,
      },
      tx,
    );
    return serializeInspection(row);
  });

  // Status side effect runs with the inspector's permissions relaxed: an inspection is a
  // legitimate way for any member to move a piece back to the workshop.
  let statusChange: StatusChangeResult | null = null;
  let target: ComponentStatus | null = null;
  if (input.result === 'rejected') {
    const hadManufacturing = !!component.manufacturing || statusOrder(component.status) >= statusOrder('pending_manufacturing');
    target = hadManufacturing ? 'in_manufacturing' : 'design';
  } else if (component.status === 'inspection') {
    target = 'completed';
  }
  if (target && target !== component.status) {
    const relaxed: ProjectAccess = { ...access, systemLeadIds: new Set([...access.systemLeadIds, component.systemId]) };
    statusChange = await changeStatus(user, relaxed, component, { status: target, note: `Inspección: ${label.toLowerCase()}` });
  }
  return { inspection, statusChange };
}

export async function deleteInspection(user: AuthUser, access: ProjectAccess, projectId: string, inspectionId: string) {
  const [row] = await db.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
  if (!row) throw notFound('Inspección no encontrada');
  const component = await getComponentOrThrow(projectId, row.componentId);
  const isLead = access.isAdmin || access.projectRole === 'lead' || access.systemLeadIds.has(component.systemId);
  if (!isLead && row.inspectorId !== user.id) throw forbidden('Solo el inspector o un líder puede eliminar la inspección');
  await db.delete(schema.inspections).where(eq(schema.inspections.id, inspectionId));
}

export async function inspectionsForComponents(componentIds: string[], tx: DbOrTx = db): Promise<Inspection[]> {
  if (componentIds.length === 0) return [];
  const rows = await tx.select().from(schema.inspections).where(inArray(schema.inspections.componentId, componentIds)).orderBy(desc(schema.inspections.date));
  return rows.map(serializeInspection);
}
