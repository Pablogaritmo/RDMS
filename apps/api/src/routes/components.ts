import { zValidator } from '@hono/zod-validator';
import { changeStatusSchema, collaboratorSchema, createComponentSchema, dependencySchema, manufacturingSchema, updateComponentSchema } from '@rdms/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { uuidParam, type ProjectEnv } from '../lib/project-middleware.js';
import { serializeActivity } from '../lib/serialize.js';
import {
  addDependency,
  changeStatus,
  createComponent,
  deleteComponent,
  getComponentOrThrow,
  loadComponents,
  removeDependency,
  setCollaborator,
  updateComponent,
  upsertManufacturing,
} from '../services/components.js';

/** Mounted under /api/projects/:projectId/components (project access is loaded by the parent router). */
export const componentRoutes = new Hono<ProjectEnv>()
  .get('/', async (c) => c.json({ components: await loadComponents(c.var.projectId) }))
  .post('/', zValidator('json', createComponentSchema), async (c) => {
    const component = await createComponent(c.var.user, c.var.access, c.var.projectId, c.req.valid('json'));
    return c.json({ component }, 201);
  })
  .get('/:componentId', async (c) => {
    const component = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    return c.json({ component });
  })
  .patch('/:componentId', zValidator('json', updateComponentSchema), async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const component = await updateComponent(c.var.user, c.var.access, current, c.req.valid('json'));
    return c.json({ component });
  })
  .delete('/:componentId', async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    await deleteComponent(c.var.user, c.var.access, current);
    return c.json({ ok: true });
  })
  .post('/:componentId/status', zValidator('json', changeStatusSchema), async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const result = await changeStatus(c.var.user, c.var.access, current, c.req.valid('json'));
    return c.json(result);
  })
  .post('/:componentId/dependencies', zValidator('json', dependencySchema), async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const component = await addDependency(c.var.user, c.var.access, current, c.req.valid('json').dependsOnId);
    return c.json({ component });
  })
  .delete('/:componentId/dependencies/:dependsOnId', async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const component = await removeDependency(c.var.user, c.var.access, current, uuidParam(c.req.param('dependsOnId'), 'Componente'));
    return c.json({ component });
  })
  .post('/:componentId/collaborators', zValidator('json', collaboratorSchema), async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const component = await setCollaborator(c.var.user, c.var.access, current, c.req.valid('json').userId, true);
    return c.json({ component });
  })
  .delete('/:componentId/collaborators/:userId', async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const component = await setCollaborator(c.var.user, c.var.access, current, uuidParam(c.req.param('userId'), 'Usuario'), false);
    return c.json({ component });
  })
  .put('/:componentId/manufacturing', zValidator('json', manufacturingSchema), async (c) => {
    const current = await getComponentOrThrow(c.var.projectId, uuidParam(c.req.param('componentId'), 'Componente'));
    const component = await upsertManufacturing(c.var.user, c.var.access, current, c.req.valid('json'));
    return c.json({ component });
  })
  .get('/:componentId/activity', async (c) => {
    const componentId = uuidParam(c.req.param('componentId'), 'Componente');
    const rows = await db
      .select({ log: schema.activityLogs, userName: schema.users.name })
      .from(schema.activityLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
      .where(and(eq(schema.activityLogs.projectId, c.var.projectId), eq(schema.activityLogs.entityType, 'component'), eq(schema.activityLogs.entityId, componentId)))
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(200);
    return c.json({ activity: rows.map((r) => serializeActivity(r.log, r.userName)) });
  });
