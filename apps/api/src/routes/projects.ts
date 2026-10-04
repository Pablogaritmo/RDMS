import { zValidator } from '@hono/zod-validator';
import {
  computeProgress,
  createProjectSchema,
  createSystemSchema,
  membershipSchema,
  milestoneSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateSystemSchema,
  type ComponentStatus,
} from '@rdms/shared';
import { and, asc, count, desc, eq, ilike, inArray, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { diffRecords, labelChanges, logActivity } from '../lib/activity.js';
import { requireAdmin, type AppEnv } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { assertActiveUsers, canManageProject, canManageSystem, visibleProjectIds } from '../lib/permissions.js';
import { uuidParam, withProject, type ProjectEnv } from '../lib/project-middleware.js';
import { serializeActivity, serializeMilestone, serializeProject } from '../lib/serialize.js';
import { loadMilestones, loadProjectBundle, loadProjectMembers, loadSystems } from '../services/projects.js';
import { componentRoutes } from './components.js';
import { operationRoutes } from './operations.js';

const nullIfEmpty = (v: string | null | undefined) => (v && v.trim() !== '' ? v : null);

// ------------------------------------------------------------------ projects

export const projectRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const visible = await visibleProjectIds(c.var.user);
    if (visible !== 'all' && visible.length === 0) return c.json({ projects: [] });
    const where = visible === 'all' ? undefined : inArray(schema.projects.id, visible);
    const rows = await db.select().from(schema.projects).where(where).orderBy(desc(schema.projects.createdAt));
    const ids = rows.map((r) => r.id);
    const statusRows = ids.length
      ? await db
          .select({ projectId: schema.components.projectId, status: schema.components.status, n: count() })
          .from(schema.components)
          .where(inArray(schema.components.projectId, ids))
          .groupBy(schema.components.projectId, schema.components.status)
      : [];
    const memberRows = ids.length
      ? await db
          .select({ projectId: schema.projectMembers.projectId, n: count() })
          .from(schema.projectMembers)
          .where(inArray(schema.projectMembers.projectId, ids))
          .groupBy(schema.projectMembers.projectId)
      : [];
    const memberCount = new Map(memberRows.map((m) => [m.projectId, Number(m.n)]));

    const projects = rows.map((p) => {
      const expanded: { status: ComponentStatus }[] = [];
      for (const s of statusRows) if (s.projectId === p.id) for (let i = 0; i < Number(s.n); i++) expanded.push({ status: s.status as ComponentStatus });
      return { ...serializeProject(p), progress: computeProgress(expanded), memberCount: memberCount.get(p.id) ?? 0 };
    });
    return c.json({ projects });
  })
  .post('/', requireAdmin, zValidator('json', createProjectSchema), async (c) => {
    const input = c.req.valid('json');
    const [row] = await db
      .insert(schema.projects)
      .values({
        name: input.name,
        description: nullIfEmpty(input.description),
        competition: nullIfEmpty(input.competition),
        status: input.status,
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        budget: input.budget ?? null,
        currency: input.currency,
        createdBy: c.var.user.id,
      })
      .returning();
    await logActivity({ projectId: row.id, entityType: 'project', entityId: row.id, entityLabel: row.name, userId: c.var.user.id, action: 'created' });
    return c.json({ project: serializeProject(row) }, 201);
  });

// ------------------------------------------------------- single project scope

export const projectScopedRoutes = new Hono<ProjectEnv>()
  .use('*', withProject)
  .route('/components', componentRoutes)
  .route('/', operationRoutes)
  .get('/bundle', async (c) => c.json(await loadProjectBundle(c.var.projectId)))
  .patch('/', zValidator('json', updateProjectSchema), async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede editarlo');
    const input = c.req.valid('json');
    const [current] = await db.select().from(schema.projects).where(eq(schema.projects.id, c.var.projectId)).limit(1);
    if (!current) throw notFound();
    const patch: Partial<typeof schema.projects.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = nullIfEmpty(input.description);
    if (input.competition !== undefined) patch.competition = nullIfEmpty(input.competition);
    if (input.status !== undefined) patch.status = input.status;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.targetDate !== undefined) patch.targetDate = input.targetDate;
    if (input.budget !== undefined) patch.budget = input.budget;
    if (input.currency !== undefined) patch.currency = input.currency;
    const changes = diffRecords(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    const [row] = await db.update(schema.projects).set(patch).where(eq(schema.projects.id, current.id)).returning();
    await logActivity({ projectId: row.id, entityType: 'project', entityId: row.id, entityLabel: row.name, userId: c.var.user.id, action: 'updated', changes });
    return c.json({ project: serializeProject(row) });
  })
  .delete('/', requireAdmin, async (c) => {
    await db.delete(schema.projects).where(eq(schema.projects.id, c.var.projectId));
    return c.json({ ok: true });
  })

  // ------------------------------------------------------------- members
  .get('/members', async (c) => c.json({ members: await loadProjectMembers(c.var.projectId) }))
  .put('/members', zValidator('json', membershipSchema), async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede gestionar miembros');
    const { userId, role } = c.req.valid('json');
    await assertActiveUsers([userId]);
    await db
      .insert(schema.projectMembers)
      .values({ projectId: c.var.projectId, userId, role })
      .onConflictDoUpdate({ target: [schema.projectMembers.projectId, schema.projectMembers.userId], set: { role } });
    await logActivity({
      projectId: c.var.projectId,
      entityType: 'project',
      entityId: c.var.projectId,
      entityLabel: null,
      userId: c.var.user.id,
      action: 'member_added',
      changes: await labelChanges([{ field: 'userId', from: null, to: userId }]),
      note: role === 'lead' ? 'líder de proyecto' : null,
    });
    return c.json({ members: await loadProjectMembers(c.var.projectId) });
  })
  .delete('/members/:userId', async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede gestionar miembros');
    const userId = uuidParam(c.req.param('userId'), 'Usuario');
    await db.transaction(async (tx) => {
      await tx.delete(schema.projectMembers).where(and(eq(schema.projectMembers.projectId, c.var.projectId), eq(schema.projectMembers.userId, userId)));
      // also drop system memberships inside this project
      const sysIds = (await tx.select({ id: schema.systems.id }).from(schema.systems).where(eq(schema.systems.projectId, c.var.projectId))).map((s) => s.id);
      if (sysIds.length) await tx.delete(schema.systemMembers).where(and(inArray(schema.systemMembers.systemId, sysIds), eq(schema.systemMembers.userId, userId)));
      await logActivity(
        {
          projectId: c.var.projectId,
          entityType: 'project',
          entityId: c.var.projectId,
          entityLabel: null,
          userId: c.var.user.id,
          action: 'member_removed',
          changes: await labelChanges([{ field: 'userId', from: userId, to: null }], tx),
        },
        tx,
      );
    });
    return c.json({ members: await loadProjectMembers(c.var.projectId) });
  })

  // ------------------------------------------------------------- systems
  .get('/systems', async (c) => c.json({ systems: await loadSystems(c.var.projectId) }))
  .post('/systems', zValidator('json', createSystemSchema), async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede crear sistemas');
    const input = c.req.valid('json');
    const [dup] = await db
      .select({ id: schema.systems.id })
      .from(schema.systems)
      .where(and(eq(schema.systems.projectId, c.var.projectId), eq(schema.systems.code, input.code)))
      .limit(1);
    if (dup) throw conflict(`Ya existe un sistema con el código ${input.code}`);
    const [{ n }] = await db.select({ n: count() }).from(schema.systems).where(eq(schema.systems.projectId, c.var.projectId));
    const system = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.systems)
        .values({
          projectId: c.var.projectId,
          code: input.code,
          name: input.name,
          description: nullIfEmpty(input.description),
          budget: input.budget ?? null,
          sortOrder: Number(n),
        })
        .returning();
      if (input.leadId) {
        await assertActiveUsers([input.leadId], tx);
        await tx.insert(schema.systemMembers).values({ systemId: row.id, userId: input.leadId, role: 'lead' });
        // a system lead must be a project member
        await tx.insert(schema.projectMembers).values({ projectId: c.var.projectId, userId: input.leadId, role: 'member' }).onConflictDoNothing();
      }
      await logActivity({ projectId: c.var.projectId, entityType: 'system', entityId: row.id, entityLabel: row.name, userId: c.var.user.id, action: 'created' }, tx);
      return row;
    });
    const [full] = await loadSystems(c.var.projectId, db, system.id);
    return c.json({ system: full }, 201);
  })
  .patch('/systems/:systemId', zValidator('json', updateSystemSchema), async (c) => {
    const systemId = uuidParam(c.req.param('systemId'), 'Sistema');
    if (!canManageSystem(c.var.access, systemId)) throw forbidden('Solo los líderes pueden editar este sistema');
    const input = c.req.valid('json');
    const [current] = await db
      .select()
      .from(schema.systems)
      .where(and(eq(schema.systems.id, systemId), eq(schema.systems.projectId, c.var.projectId)))
      .limit(1);
    if (!current) throw notFound('Sistema no encontrado');
    const patch: Partial<typeof schema.systems.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined && canManageProject(c.var.access)) patch.code = input.code;
    if (input.description !== undefined) patch.description = nullIfEmpty(input.description);
    if (input.budget !== undefined && canManageProject(c.var.access)) patch.budget = input.budget;
    const changes = diffRecords(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    await db.transaction(async (tx) => {
      if (Object.keys(patch).length) await tx.update(schema.systems).set(patch).where(eq(schema.systems.id, systemId));
      if (input.leadId !== undefined && canManageProject(c.var.access)) {
        // demote existing leads, promote the new one
        await tx.update(schema.systemMembers).set({ role: 'member' }).where(and(eq(schema.systemMembers.systemId, systemId), eq(schema.systemMembers.role, 'lead')));
        if (input.leadId) {
          await assertActiveUsers([input.leadId], tx);
          await tx
            .insert(schema.systemMembers)
            .values({ systemId, userId: input.leadId, role: 'lead' })
            .onConflictDoUpdate({ target: [schema.systemMembers.systemId, schema.systemMembers.userId], set: { role: 'lead' } });
          await tx.insert(schema.projectMembers).values({ projectId: c.var.projectId, userId: input.leadId, role: 'member' }).onConflictDoNothing();
          changes.push(...(await labelChanges([{ field: 'responsibleId', from: null, to: input.leadId }], tx)));
        }
      }
      await logActivity({ projectId: c.var.projectId, entityType: 'system', entityId: systemId, entityLabel: patch.name ?? current.name, userId: c.var.user.id, action: 'updated', changes }, tx);
    });
    const [full] = await loadSystems(c.var.projectId, db, systemId);
    return c.json({ system: full });
  })
  .delete('/systems/:systemId', async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede eliminar sistemas');
    const systemId = uuidParam(c.req.param('systemId'), 'Sistema');
    const [{ n }] = await db.select({ n: count() }).from(schema.components).where(eq(schema.components.systemId, systemId));
    if (Number(n) > 0) throw badRequest(`El sistema tiene ${n} componente(s). Muévelos o elimínalos primero.`);
    const [row] = await db
      .delete(schema.systems)
      .where(and(eq(schema.systems.id, systemId), eq(schema.systems.projectId, c.var.projectId)))
      .returning();
    if (!row) throw notFound('Sistema no encontrado');
    await logActivity({ projectId: c.var.projectId, entityType: 'system', entityId: systemId, entityLabel: row.name, userId: c.var.user.id, action: 'deleted' });
    return c.json({ ok: true });
  })
  .put('/systems/:systemId/members', zValidator('json', membershipSchema), async (c) => {
    const systemId = uuidParam(c.req.param('systemId'), 'Sistema');
    if (!canManageSystem(c.var.access, systemId)) throw forbidden('Solo los líderes pueden gestionar miembros del sistema');
    const { userId, role } = c.req.valid('json');
    if (role === 'lead' && !canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede nombrar líderes de sistema');
    await assertActiveUsers([userId]);
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.systemMembers)
        .values({ systemId, userId, role })
        .onConflictDoUpdate({ target: [schema.systemMembers.systemId, schema.systemMembers.userId], set: { role } });
      await tx.insert(schema.projectMembers).values({ projectId: c.var.projectId, userId, role: 'member' }).onConflictDoNothing();
    });
    const [full] = await loadSystems(c.var.projectId, db, systemId);
    return c.json({ system: full });
  })
  .delete('/systems/:systemId/members/:userId', async (c) => {
    const systemId = uuidParam(c.req.param('systemId'), 'Sistema');
    const userId = uuidParam(c.req.param('userId'), 'Usuario');
    if (!canManageSystem(c.var.access, systemId)) throw forbidden('Solo los líderes pueden gestionar miembros del sistema');
    await db.delete(schema.systemMembers).where(and(eq(schema.systemMembers.systemId, systemId), eq(schema.systemMembers.userId, userId)));
    const [full] = await loadSystems(c.var.projectId, db, systemId);
    return c.json({ system: full });
  })

  // ---------------------------------------------------------- milestones
  .get('/milestones', async (c) => c.json({ milestones: await loadMilestones(c.var.projectId) }))
  .post('/milestones', zValidator('json', milestoneSchema), async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede crear hitos');
    const input = c.req.valid('json');
    const [row] = await db
      .insert(schema.milestones)
      .values({ projectId: c.var.projectId, name: input.name, date: input.date, description: nullIfEmpty(input.description), completedAt: input.completedAt ?? null })
      .returning();
    await logActivity({ projectId: c.var.projectId, entityType: 'milestone', entityId: row.id, entityLabel: row.name, userId: c.var.user.id, action: 'created' });
    return c.json({ milestone: serializeMilestone(row) }, 201);
  })
  .patch('/milestones/:milestoneId', zValidator('json', updateMilestoneSchema), async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede editar hitos');
    const id = uuidParam(c.req.param('milestoneId'), 'Hito');
    const input = c.req.valid('json');
    const patch: Partial<typeof schema.milestones.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.date !== undefined) patch.date = input.date;
    if (input.description !== undefined) patch.description = nullIfEmpty(input.description);
    if (input.completedAt !== undefined) patch.completedAt = input.completedAt;
    const [row] = await db
      .update(schema.milestones)
      .set(patch)
      .where(and(eq(schema.milestones.id, id), eq(schema.milestones.projectId, c.var.projectId)))
      .returning();
    if (!row) throw notFound('Hito no encontrado');
    return c.json({ milestone: serializeMilestone(row) });
  })
  .delete('/milestones/:milestoneId', async (c) => {
    if (!canManageProject(c.var.access)) throw forbidden('Solo el líder del proyecto puede eliminar hitos');
    const id = uuidParam(c.req.param('milestoneId'), 'Hito');
    await db.delete(schema.milestones).where(and(eq(schema.milestones.id, id), eq(schema.milestones.projectId, c.var.projectId)));
    return c.json({ ok: true });
  })

  // ------------------------------------------------------------ activity
  .get(
    '/activity',
    zValidator(
      'query',
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        before: z.iso.datetime().optional(),
        entityType: z.string().optional(),
        entityId: z.uuid().optional(),
        userId: z.uuid().optional(),
      }),
    ),
    async (c) => {
      const q = c.req.valid('query');
      const conds = [eq(schema.activityLogs.projectId, c.var.projectId)];
      if (q.before) conds.push(lt(schema.activityLogs.createdAt, new Date(q.before)));
      if (q.entityType) conds.push(eq(schema.activityLogs.entityType, q.entityType));
      if (q.entityId) conds.push(eq(schema.activityLogs.entityId, q.entityId));
      if (q.userId) conds.push(eq(schema.activityLogs.userId, q.userId));
      const rows = await db
        .select({ log: schema.activityLogs, userName: schema.users.name })
        .from(schema.activityLogs)
        .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
        .where(and(...conds))
        .orderBy(desc(schema.activityLogs.createdAt))
        .limit(q.limit + 1);
      const hasMore = rows.length > q.limit;
      const page = rows.slice(0, q.limit).map((r) => serializeActivity(r.log, r.userName));
      return c.json({ activity: page, hasMore });
    },
  );

// ------------------------------------------------------------------ search

export const searchRoutes = new Hono<AppEnv>().get('/', zValidator('query', z.object({ q: z.string().trim().min(1).max(100), projectId: z.uuid().optional() })), async (c) => {
  const { q, projectId } = c.req.valid('query');
  const visible = await visibleProjectIds(c.var.user);
  const projectFilter = projectId ? [projectId] : visible === 'all' ? null : visible;
  if (projectFilter && projectFilter.length === 0) return c.json({ results: [] });
  if (projectFilter && visible !== 'all' && !projectFilter.every((id) => visible.includes(id))) return c.json({ results: [] });
  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;

  const [comps, systemsRows, projectsRows, usersRows, milestonesRows, purchasesRows, filesRows] = await Promise.all([
    db
      .select({ id: schema.components.id, code: schema.components.code, name: schema.components.name, projectId: schema.components.projectId, status: schema.components.status })
      .from(schema.components)
      .where(
        and(
          projectFilter ? inArray(schema.components.projectId, projectFilter) : undefined,
          or(ilike(schema.components.code, pattern), ilike(schema.components.name, pattern), ilike(schema.components.description, pattern), ilike(schema.components.material, pattern)),
        ),
      )
      .orderBy(asc(schema.components.code))
      .limit(15),
    db
      .select({ id: schema.systems.id, code: schema.systems.code, name: schema.systems.name, projectId: schema.systems.projectId })
      .from(schema.systems)
      .where(and(projectFilter ? inArray(schema.systems.projectId, projectFilter) : undefined, or(ilike(schema.systems.code, pattern), ilike(schema.systems.name, pattern))))
      .limit(5),
    db
      .select({ id: schema.projects.id, name: schema.projects.name, competition: schema.projects.competition })
      .from(schema.projects)
      .where(and(visible === 'all' ? undefined : inArray(schema.projects.id, visible), or(ilike(schema.projects.name, pattern), ilike(schema.projects.competition, pattern))))
      .limit(5),
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(and(eq(schema.users.isActive, true), or(ilike(schema.users.name, pattern), ilike(schema.users.email, pattern))))
      .limit(5),
    db
      .select({ id: schema.milestones.id, name: schema.milestones.name, date: schema.milestones.date, projectId: schema.milestones.projectId })
      .from(schema.milestones)
      .where(and(projectFilter ? inArray(schema.milestones.projectId, projectFilter) : undefined, ilike(schema.milestones.name, pattern)))
      .limit(5),
    db
      .select({ id: schema.purchases.id, name: schema.purchases.name, supplier: schema.purchases.supplier, status: schema.purchases.status, projectId: schema.purchases.projectId })
      .from(schema.purchases)
      .where(and(projectFilter ? inArray(schema.purchases.projectId, projectFilter) : undefined, or(ilike(schema.purchases.name, pattern), ilike(schema.purchases.supplier, pattern))))
      .limit(6),
    db
      .select({ id: schema.files.id, name: schema.files.name, category: schema.files.category, projectId: schema.files.projectId, entityType: schema.files.entityType, entityId: schema.files.entityId })
      .from(schema.files)
      .where(and(projectFilter ? inArray(schema.files.projectId, projectFilter) : undefined, ilike(schema.files.name, pattern)))
      .limit(6),
  ]);

  const results = [
    ...comps.map((r) => ({ type: 'component' as const, id: r.id, title: `${r.code} · ${r.name}`, subtitle: r.status, projectId: r.projectId })),
    ...systemsRows.map((r) => ({ type: 'system' as const, id: r.id, title: r.name, subtitle: r.code, projectId: r.projectId })),
    ...milestonesRows.map((r) => ({ type: 'milestone' as const, id: r.id, title: r.name, subtitle: r.date, projectId: r.projectId })),
    ...purchasesRows.map((r) => ({ type: 'purchase' as const, id: r.id, title: r.name, subtitle: r.supplier ?? r.status, projectId: r.projectId })),
    ...filesRows.map((r) => ({ type: 'file' as const, id: r.id, title: r.name, subtitle: r.category, projectId: r.projectId, entityType: r.entityType, entityId: r.entityId })),
    ...projectsRows.map((r) => ({ type: 'project' as const, id: r.id, title: r.name, subtitle: r.competition, projectId: r.id })),
    ...usersRows.map((r) => ({ type: 'user' as const, id: r.id, title: r.name, subtitle: r.email, projectId: null })),
  ];
  return c.json({ results });
});
