import {
  canTransition,
  computeBlocking,
  isDoneStatus,
  statusOrder,
  wouldCreateCycle,
  type ChangeStatusInput,
  type Component,
  type ComponentStatus,
  type CreateComponentInput,
  type ManufacturingInput,
  type UpdateComponentInput,
} from '@rdms/shared';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db/index.js';
import { diffRecords, labelChanges, logActivity } from '../lib/activity.js';
import type { AuthUser } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { assertActiveUsers, canCreateComponent, canEditComponent, canManageSystem, type ProjectAccess } from '../lib/permissions.js';
import { serializeComponent } from '../lib/serialize.js';

type ComponentRow = typeof schema.components.$inferSelect;

// ----------------------------------------------------------------- loading

export async function loadComponents(projectId: string, tx: DbOrTx = db, ids?: string[]): Promise<Component[]> {
  const where = ids ? and(eq(schema.components.projectId, projectId), inArray(schema.components.id, ids)) : eq(schema.components.projectId, projectId);
  const rows = await tx.select().from(schema.components).where(where).orderBy(schema.components.code);
  if (rows.length === 0) return [];
  const rowIds = rows.map((r) => r.id);

  const [members, deps, manuf] = await Promise.all([
    tx.select().from(schema.componentMembers).where(inArray(schema.componentMembers.componentId, rowIds)),
    tx
      .select()
      .from(schema.dependencies)
      .where(or(inArray(schema.dependencies.componentId, rowIds), inArray(schema.dependencies.dependsOnId, rowIds))),
    tx.select().from(schema.manufacturing).where(inArray(schema.manufacturing.componentId, rowIds)),
  ]);

  const collaborators = new Map<string, string[]>();
  for (const m of members) collaborators.set(m.componentId, [...(collaborators.get(m.componentId) ?? []), m.userId]);
  const dependsOn = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const d of deps) {
    dependsOn.set(d.componentId, [...(dependsOn.get(d.componentId) ?? []), d.dependsOnId]);
    dependents.set(d.dependsOnId, [...(dependents.get(d.dependsOnId) ?? []), d.componentId]);
  }
  const manufacturing = new Map(manuf.map((m) => [m.componentId, m]));

  return rows.map((r) =>
    serializeComponent(r, {
      collaboratorIds: collaborators.get(r.id) ?? [],
      dependsOn: dependsOn.get(r.id) ?? [],
      dependents: dependents.get(r.id) ?? [],
      manufacturing: manufacturing.get(r.id) ?? null,
    }),
  );
}

export async function getComponentOrThrow(projectId: string, componentId: string, tx: DbOrTx = db): Promise<Component> {
  const [c] = await loadComponents(projectId, tx, [componentId]);
  if (!c) throw notFound('Componente no encontrado');
  return c;
}

// -------------------------------------------------------------- code generation

async function generateCode(tx: DbOrTx, projectId: string, systemId: string): Promise<string> {
  const [system] = await tx.select({ code: schema.systems.code }).from(schema.systems).where(eq(schema.systems.id, systemId)).limit(1);
  if (!system) throw notFound('Sistema no encontrado');
  const existing = await tx
    .select({ code: schema.components.code })
    .from(schema.components)
    .where(and(eq(schema.components.projectId, projectId), like(schema.components.code, `${system.code}-%`)));
  const taken = new Set(existing.map((e) => e.code));
  let n = existing.length + 1;
  let code = `${system.code}-${String(n).padStart(3, '0')}`;
  while (taken.has(code)) {
    n += 1;
    code = `${system.code}-${String(n).padStart(3, '0')}`;
  }
  return code;
}

async function assertSystemInProject(tx: DbOrTx, projectId: string, systemId: string) {
  const [s] = await tx
    .select({ id: schema.systems.id })
    .from(schema.systems)
    .where(and(eq(schema.systems.id, systemId), eq(schema.systems.projectId, projectId)))
    .limit(1);
  if (!s) throw badRequest('El sistema no pertenece a este proyecto');
}

/** Fields that only system/project leads may change on an existing component. */
const LEAD_ONLY_FIELDS: (keyof UpdateComponentInput)[] = ['responsibleId', 'systemId', 'code'];

const nullIfEmpty = <T>(v: T): T | null => (typeof v === 'string' && v.trim() === '' ? null : v);

function cleanInput<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = nullIfEmpty(v);
  return out as T;
}

// --------------------------------------------------------------------- create

export async function createComponent(user: AuthUser, access: ProjectAccess, projectId: string, raw: CreateComponentInput): Promise<Component> {
  const input = cleanInput(raw);
  if (!canCreateComponent(access, input.systemId)) throw forbidden('No puedes crear componentes en este sistema');
  // Members (non-leads) cannot assign others as responsible
  const responsibleId = canManageSystem(access, input.systemId) ? (input.responsibleId ?? user.id) : user.id;

  return db.transaction(async (tx) => {
    await assertSystemInProject(tx, projectId, input.systemId);
    await assertActiveUsers([responsibleId, input.designerId ?? '', ...input.collaboratorIds], tx);
    const code = input.code ?? (await generateCode(tx, projectId, input.systemId));

    const status = input.status;
    const [row] = await tx
      .insert(schema.components)
      .values({
        projectId,
        systemId: input.systemId,
        code,
        name: input.name,
        description: input.description ?? null,
        subsystem: input.subsystem ?? null,
        quantity: input.quantity,
        responsibleId,
        priority: input.priority,
        status,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        completedAt: isDoneStatus(status) ? new Date() : null,
        material: input.material ?? null,
        materialQty: input.materialQty ?? null,
        materialUnit: input.materialUnit ?? null,
        supplier: input.supplier ?? null,
        materialStatus: input.materialStatus ?? null,
        designerId: input.designerId ?? null,
        designApprovedAt: statusOrder(status) >= statusOrder('design_approved') ? new Date() : null,
        designNotes: input.designNotes ?? null,
        estMaterialCost: input.estMaterialCost,
        estManufacturingCost: input.estManufacturingCost,
        estPurchaseCost: input.estPurchaseCost,
        estOtherCost: input.estOtherCost,
        actualCost: input.actualCost ?? null,
        createdBy: user.id,
      })
      .returning();

    const collaborators = [...new Set(input.collaboratorIds)].filter((id) => id !== responsibleId);
    if (collaborators.length) {
      await tx.insert(schema.componentMembers).values(collaborators.map((userId) => ({ componentId: row.id, userId })));
    }

    if (input.dependsOn.length) {
      const all = await loadComponents(projectId, tx);
      const valid = new Set(all.map((c) => c.id));
      const deps = [...new Set(input.dependsOn)].filter((id) => valid.has(id) && id !== row.id);
      if (deps.length) await tx.insert(schema.dependencies).values(deps.map((dependsOnId) => ({ componentId: row.id, dependsOnId })));
    }

    await logActivity(
      {
        projectId,
        entityType: 'component',
        entityId: row.id,
        entityLabel: `${row.code} ${row.name}`,
        userId: user.id,
        action: 'created',
        changes: await labelChanges([{ field: 'status', from: null, to: status }, ...(responsibleId ? [{ field: 'responsibleId', from: null, to: responsibleId }] : [])], tx),
      },
      tx,
    );

    return getComponentOrThrow(projectId, row.id, tx);
  });
}

// --------------------------------------------------------------------- update

const UPDATABLE_FIELDS: (keyof UpdateComponentInput)[] = [
  'systemId', 'name', 'code', 'description', 'subsystem', 'quantity', 'responsibleId', 'priority', 'startDate', 'dueDate',
  'material', 'materialQty', 'materialUnit', 'supplier', 'materialStatus', 'designerId', 'designNotes',
  'estMaterialCost', 'estManufacturingCost', 'estPurchaseCost', 'estOtherCost', 'actualCost',
];

export async function updateComponent(user: AuthUser, access: ProjectAccess, current: Component, raw: UpdateComponentInput): Promise<Component> {
  const input = cleanInput(raw);
  if (!canEditComponent(access, user.id, current)) throw forbidden('No puedes editar este componente');
  const touchesLeadFields = LEAD_ONLY_FIELDS.some((f) => f in input && input[f] !== (current as unknown as Record<string, unknown>)[f]);
  if (touchesLeadFields && !canManageSystem(access, current.systemId)) {
    throw forbidden('Solo los líderes pueden reasignar responsable, sistema o código');
  }

  return db.transaction(async (tx) => {
    if (input.systemId && input.systemId !== current.systemId) await assertSystemInProject(tx, current.projectId, input.systemId);
    await assertActiveUsers([input.responsibleId ?? '', input.designerId ?? ''], tx);

    const patch: Partial<ComponentRow> = {};
    for (const f of UPDATABLE_FIELDS) {
      if (f in input) (patch as Record<string, unknown>)[f] = input[f] ?? null;
    }
    // cost defaults: never null in DB
    for (const f of ['estMaterialCost', 'estManufacturingCost', 'estPurchaseCost', 'estOtherCost'] as const) {
      if (f in patch && patch[f] == null) patch[f] = 0;
    }
    if ('quantity' in patch && patch.quantity == null) patch.quantity = 1;
    if ('code' in patch && patch.code == null) delete patch.code;
    if ('name' in patch && patch.name == null) delete patch.name;

    const changes = diffRecords(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    if (changes.length === 0) return current;

    const existingCode = patch.code
      ? await tx
          .select({ id: schema.components.id })
          .from(schema.components)
          .where(and(eq(schema.components.projectId, current.projectId), eq(schema.components.code, patch.code)))
          .limit(1)
      : [];
    if (existingCode.length && existingCode[0].id !== current.id) throw conflict(`Ya existe un componente con el código ${patch.code}`);

    await tx.update(schema.components).set(patch).where(eq(schema.components.id, current.id));

    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${patch.code ?? current.code} ${patch.name ?? current.name}`,
        userId: user.id,
        action: 'updated',
        changes: await labelChanges(changes, tx),
      },
      tx,
    );
    return getComponentOrThrow(current.projectId, current.id, tx);
  });
}

// -------------------------------------------------------------- status change

export interface StatusChangeResult {
  component: Component;
  /** Components that were blocked by this one and are no longer blocked. */
  unblocked: Pick<Component, 'id' | 'code' | 'name'>[];
}

export async function changeStatus(user: AuthUser, access: ProjectAccess, current: Component, input: ChangeStatusInput): Promise<StatusChangeResult> {
  if (!canEditComponent(access, user.id, current)) throw forbidden('No puedes cambiar el estado de este componente');
  const from = current.status;
  const to = input.status as ComponentStatus;
  if (from === to) return { component: current, unblocked: [] };
  if (!canTransition(from, to)) {
    throw badRequest(`Transición no permitida: no se puede pasar de "${from}" a "${to}" directamente`);
  }

  return db.transaction(async (tx) => {
    const before = await loadComponents(current.projectId, tx);
    const blockingBefore = computeBlocking(before);

    const patch: Partial<ComponentRow> = { status: to };
    const nowDone = isDoneStatus(to);
    if (nowDone && !current.completedAt) patch.completedAt = new Date();
    if (!nowDone) patch.completedAt = null;
    const approvedOrder = statusOrder('design_approved');
    if (statusOrder(to) >= approvedOrder && !current.designApprovedAt) patch.designApprovedAt = new Date();
    if (statusOrder(to) < approvedOrder) patch.designApprovedAt = null;

    await tx.update(schema.components).set(patch).where(eq(schema.components.id, current.id));

    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${current.code} ${current.name}`,
        userId: user.id,
        action: 'status_changed',
        changes: [{ field: 'status', from, to }],
        note: input.note ?? null,
      },
      tx,
    );

    const after = await loadComponents(current.projectId, tx);
    const blockingAfter = computeBlocking(after);
    const unblocked = after
      .filter((c) => {
        const wasBlocked = blockingBefore.get(c.id)?.blockedBy.includes(current.id) ?? false;
        const isBlockedNow = (blockingAfter.get(c.id)?.blockedBy.length ?? 0) > 0;
        return wasBlocked && !isBlockedNow;
      })
      .map((c) => ({ id: c.id, code: c.code, name: c.name }));

    const component = after.find((c) => c.id === current.id)!;
    return { component, unblocked };
  });
}

// --------------------------------------------------------------------- delete

export async function deleteComponent(user: AuthUser, access: ProjectAccess, current: Component) {
  if (!canManageSystem(access, current.systemId)) throw forbidden('Solo los líderes pueden eliminar componentes');
  await db.transaction(async (tx) => {
    await tx.delete(schema.components).where(eq(schema.components.id, current.id));
    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${current.code} ${current.name}`,
        userId: user.id,
        action: 'deleted',
      },
      tx,
    );
  });
}

// --------------------------------------------------------------- dependencies

export async function addDependency(user: AuthUser, access: ProjectAccess, current: Component, dependsOnId: string): Promise<Component> {
  if (!canEditComponent(access, user.id, current)) throw forbidden('No puedes editar este componente');
  if (current.dependsOn.includes(dependsOnId)) return current;
  return db.transaction(async (tx) => {
    const all = await loadComponents(current.projectId, tx);
    const target = all.find((c) => c.id === dependsOnId);
    if (!target) throw notFound('El componente del que se depende no existe en este proyecto');
    if (wouldCreateCycle(all, current.id, dependsOnId)) throw badRequest('Esta dependencia crearía un ciclo');
    await tx.insert(schema.dependencies).values({ componentId: current.id, dependsOnId });
    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${current.code} ${current.name}`,
        userId: user.id,
        action: 'dependency_added',
        changes: [{ field: 'dependsOn', from: null, to: target.id, toLabel: `${target.code} ${target.name}` }],
      },
      tx,
    );
    return getComponentOrThrow(current.projectId, current.id, tx);
  });
}

export async function removeDependency(user: AuthUser, access: ProjectAccess, current: Component, dependsOnId: string): Promise<Component> {
  if (!canEditComponent(access, user.id, current)) throw forbidden('No puedes editar este componente');
  return db.transaction(async (tx) => {
    const target = await getComponentOrThrow(current.projectId, dependsOnId, tx).catch(() => null);
    await tx
      .delete(schema.dependencies)
      .where(and(eq(schema.dependencies.componentId, current.id), eq(schema.dependencies.dependsOnId, dependsOnId)));
    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${current.code} ${current.name}`,
        userId: user.id,
        action: 'dependency_removed',
        changes: [{ field: 'dependsOn', from: dependsOnId, to: null, fromLabel: target ? `${target.code} ${target.name}` : null }],
      },
      tx,
    );
    return getComponentOrThrow(current.projectId, current.id, tx);
  });
}

// -------------------------------------------------------------- collaborators

export async function setCollaborator(user: AuthUser, access: ProjectAccess, current: Component, userId: string, add: boolean): Promise<Component> {
  if (!canEditComponent(access, user.id, current)) throw forbidden('No puedes editar este componente');
  return db.transaction(async (tx) => {
    if (add) {
      await assertActiveUsers([userId], tx);
      if (userId === current.responsibleId) throw badRequest('El responsable ya forma parte del componente');
      await tx.insert(schema.componentMembers).values({ componentId: current.id, userId }).onConflictDoNothing();
    } else {
      await tx.delete(schema.componentMembers).where(and(eq(schema.componentMembers.componentId, current.id), eq(schema.componentMembers.userId, userId)));
    }
    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${current.code} ${current.name}`,
        userId: user.id,
        action: add ? 'collaborator_added' : 'collaborator_removed',
        changes: await labelChanges([{ field: 'userId', from: add ? null : userId, to: add ? userId : null }], tx),
      },
      tx,
    );
    return getComponentOrThrow(current.projectId, current.id, tx);
  });
}

// -------------------------------------------------------------- manufacturing

export async function upsertManufacturing(user: AuthUser, access: ProjectAccess, current: Component, raw: ManufacturingInput): Promise<Component> {
  const input = cleanInput(raw);
  if (!canEditComponent(access, user.id, current)) throw forbidden('No puedes editar este componente');
  return db.transaction(async (tx) => {
    await assertActiveUsers([input.responsibleId ?? ''], tx);
    const values = {
      componentId: current.id,
      process: input.process ?? null,
      machine: input.machine ?? null,
      workshop: input.workshop ?? null,
      setupMinutes: input.setupMinutes,
      machineMinutes: input.machineMinutes,
      finishingMinutes: input.finishingMinutes,
      inspectionMinutes: input.inspectionMinutes,
      responsibleId: input.responsibleId ?? null,
      scheduledDate: input.scheduledDate ?? null,
      actualDate: input.actualDate ?? null,
      needsWorkshop: input.needsWorkshop,
      needsExternal: input.needsExternal,
      notes: input.notes ?? null,
    };
    const { componentId: _cid, ...updateSet } = values;
    await tx.insert(schema.manufacturing).values(values).onConflictDoUpdate({ target: schema.manufacturing.componentId, set: updateSet });

    const before = (current.manufacturing ?? {}) as unknown as Record<string, unknown>;
    const changes = diffRecords(before, updateSet as unknown as Record<string, unknown>);
    await logActivity(
      {
        projectId: current.projectId,
        entityType: 'component',
        entityId: current.id,
        entityLabel: `${current.code} ${current.name}`,
        userId: user.id,
        action: 'updated',
        changes: await labelChanges(changes, tx),
        note: 'manufactura',
      },
      tx,
    );
    return getComponentOrThrow(current.projectId, current.id, tx);
  });
}
