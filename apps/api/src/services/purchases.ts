import { todayISO, type Purchase, type PurchaseInput, type UpdatePurchaseInput } from '@rdms/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema, type DbOrTx } from '../db/index.js';
import { diffRecords, labelChanges, logActivity } from '../lib/activity.js';
import type { AuthUser } from '../lib/auth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { canManageProject, type ProjectAccess } from '../lib/permissions.js';
import { serializePurchase } from '../lib/serialize.js';

type PurchaseRow = typeof schema.purchases.$inferSelect;

export async function loadPurchases(projectId: string, tx: DbOrTx = db, ids?: string[]): Promise<Purchase[]> {
  const where = ids ? and(eq(schema.purchases.projectId, projectId), inArray(schema.purchases.id, ids)) : eq(schema.purchases.projectId, projectId);
  const rows = await tx.select().from(schema.purchases).where(where).orderBy(desc(schema.purchases.createdAt));
  if (rows.length === 0) return [];
  const links = await tx
    .select()
    .from(schema.purchaseComponents)
    .where(inArray(schema.purchaseComponents.purchaseId, rows.map((r) => r.id)));
  const byPurchase = new Map<string, string[]>();
  for (const l of links) byPurchase.set(l.purchaseId, [...(byPurchase.get(l.purchaseId) ?? []), l.componentId]);
  return rows.map((r) => serializePurchase(r, byPurchase.get(r.id) ?? []));
}

export async function getPurchaseOrThrow(projectId: string, id: string, tx: DbOrTx = db): Promise<Purchase> {
  const [p] = await loadPurchases(projectId, tx, [id]);
  if (!p) throw notFound('Compra no encontrada');
  return p;
}

/** Members can create purchases and edit their own; leads edit everything. */
const canEditPurchase = (access: ProjectAccess, userId: string, p: Purchase) => canManageProject(access) || p.requestedById === userId;

const clean = <T extends Record<string, unknown>>(input: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
  return out as T;
};

async function assertComponentsInProject(tx: DbOrTx, projectId: string, componentIds: string[]) {
  if (componentIds.length === 0) return;
  const rows = await tx
    .select({ id: schema.components.id })
    .from(schema.components)
    .where(and(eq(schema.components.projectId, projectId), inArray(schema.components.id, componentIds)));
  if (rows.length !== new Set(componentIds).size) throw badRequest('Uno de los componentes no pertenece a este proyecto');
}

/** Status-driven date defaults: ordering sets orderedAt, receiving sets receivedAt. */
function dateDefaults(status: Purchase['status'], patch: Partial<PurchaseRow>, current?: Purchase) {
  const today = todayISO();
  if (status === 'ordered' && !(patch.orderedAt ?? current?.orderedAt)) patch.orderedAt = today;
  if (status === 'received' && !(patch.receivedAt ?? current?.receivedAt)) patch.receivedAt = today;
  if (status !== 'received' && current?.status === 'received' && patch.receivedAt === undefined) patch.receivedAt = null;
}

export async function createPurchase(user: AuthUser, access: ProjectAccess, projectId: string, raw: PurchaseInput): Promise<Purchase> {
  const input = clean(raw);
  return db.transaction(async (tx) => {
    const componentIds = [...new Set(input.componentIds)];
    await assertComponentsInProject(tx, projectId, componentIds);
    const patch: Partial<PurchaseRow> = {};
    dateDefaults(input.status, patch);
    const [row] = await tx
      .insert(schema.purchases)
      .values({
        projectId,
        name: input.name,
        description: input.description ?? null,
        quantity: input.quantity,
        unitCost: input.unitCost,
        shippingCost: input.shippingCost,
        additionalCost: input.additionalCost,
        supplier: input.supplier ?? null,
        url: input.url ?? null,
        status: input.status,
        leadTimeDays: input.leadTimeDays ?? null,
        orderedAt: input.orderedAt ?? patch.orderedAt ?? null,
        expectedAt: input.expectedAt ?? null,
        receivedAt: input.receivedAt ?? patch.receivedAt ?? null,
        requestedBy: user.id,
        notes: input.notes ?? null,
      })
      .returning();
    if (componentIds.length) await tx.insert(schema.purchaseComponents).values(componentIds.map((componentId) => ({ purchaseId: row.id, componentId })));
    await logActivity(
      { projectId, entityType: 'purchase', entityId: row.id, entityLabel: row.name, userId: user.id, action: 'created', changes: [{ field: 'status', from: null, to: row.status }] },
      tx,
    );
    return getPurchaseOrThrow(projectId, row.id, tx);
  });
}

const UPDATABLE: (keyof UpdatePurchaseInput)[] = ['name', 'description', 'quantity', 'unitCost', 'shippingCost', 'additionalCost', 'supplier', 'url', 'status', 'leadTimeDays', 'orderedAt', 'expectedAt', 'receivedAt', 'notes'];

export async function updatePurchase(user: AuthUser, access: ProjectAccess, current: Purchase, raw: UpdatePurchaseInput): Promise<Purchase> {
  const input = clean(raw);
  if (!canEditPurchase(access, user.id, current)) throw forbidden('Solo quien solicitó la compra o un líder puede editarla');
  return db.transaction(async (tx) => {
    const patch: Partial<PurchaseRow> = {};
    for (const f of UPDATABLE) if (f in input) (patch as Record<string, unknown>)[f] = input[f] ?? null;
    for (const f of ['quantity', 'unitCost', 'shippingCost', 'additionalCost'] as const) if (f in patch && patch[f] == null) patch[f] = f === 'quantity' ? 1 : 0;
    if ('name' in patch && patch.name == null) delete patch.name;
    if ('status' in patch && patch.status == null) delete patch.status;
    if (patch.status) dateDefaults(patch.status as Purchase['status'], patch, current);

    const changes = diffRecords(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    let linkChanged = false;
    if (input.componentIds) {
      const next = [...new Set(input.componentIds)];
      await assertComponentsInProject(tx, current.projectId, next);
      const prev = new Set(current.componentIds);
      const nextSet = new Set(next);
      const toAdd = next.filter((id) => !prev.has(id));
      const toRemove = current.componentIds.filter((id) => !nextSet.has(id));
      if (toRemove.length) await tx.delete(schema.purchaseComponents).where(and(eq(schema.purchaseComponents.purchaseId, current.id), inArray(schema.purchaseComponents.componentId, toRemove)));
      if (toAdd.length) await tx.insert(schema.purchaseComponents).values(toAdd.map((componentId) => ({ purchaseId: current.id, componentId })));
      linkChanged = toAdd.length > 0 || toRemove.length > 0;
      if (linkChanged) changes.push({ field: 'componentIds', from: current.componentIds.length, to: next.length });
    }
    if (Object.keys(patch).length) await tx.update(schema.purchases).set(patch).where(eq(schema.purchases.id, current.id));
    if (changes.length) {
      const statusChange = changes.find((c) => c.field === 'status');
      await logActivity(
        {
          projectId: current.projectId,
          entityType: 'purchase',
          entityId: current.id,
          entityLabel: (patch.name as string | undefined) ?? current.name,
          userId: user.id,
          action: statusChange && changes.length === 1 ? 'status_changed' : 'updated',
          changes: await labelChanges(changes, tx),
        },
        tx,
      );
    }
    return getPurchaseOrThrow(current.projectId, current.id, tx);
  });
}

export async function deletePurchase(user: AuthUser, access: ProjectAccess, current: Purchase) {
  if (!canEditPurchase(access, user.id, current)) throw forbidden('Solo quien solicitó la compra o un líder puede eliminarla');
  await db.transaction(async (tx) => {
    await tx.delete(schema.purchases).where(eq(schema.purchases.id, current.id));
    await logActivity({ projectId: current.projectId, entityType: 'purchase', entityId: current.id, entityLabel: current.name, userId: user.id, action: 'deleted' }, tx);
  });
}
