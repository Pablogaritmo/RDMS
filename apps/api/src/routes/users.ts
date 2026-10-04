import { zValidator } from '@hono/zod-validator';
import { createUserSchema, updateUserSchema } from '@rdms/shared';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { invalidateUserSessions, requireAdmin, type AppEnv } from '../lib/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { uuidParam } from '../lib/project-middleware.js';
import { serializeUser, serializeUserSummary } from '../lib/serialize.js';

export const userRoutes = new Hono<AppEnv>()
  // Any authenticated user can list users (needed to assign responsables/collaborators).
  .get('/', async (c) => {
    const rows = await db.select().from(schema.users).orderBy(asc(schema.users.name));
    const isAdmin = c.var.user.role === 'admin';
    return c.json({ users: rows.map((u) => (isAdmin ? serializeUser(u) : { ...serializeUserSummary(u), role: u.role, createdAt: u.createdAt.toISOString() })) });
  })
  .post('/', requireAdmin, zValidator('json', createUserSchema), async (c) => {
    const input = c.req.valid('json');
    const email = input.email.toLowerCase();
    const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (exists) throw conflict('Ya existe un usuario con ese correo');
    const [row] = await db
      .insert(schema.users)
      .values({ name: input.name, email, passwordHash: await hashPassword(input.password), role: input.role, avatarUrl: input.avatarUrl ?? null })
      .returning();
    return c.json({ user: serializeUser(row) }, 201);
  })
  .patch('/:userId', requireAdmin, zValidator('json', updateUserSchema), async (c) => {
    const userId = uuidParam(c.req.param('userId'), 'Usuario');
    const input = c.req.valid('json');
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!existing) throw notFound('Usuario no encontrado');

    if (userId === c.var.user.id && (input.isActive === false || (input.role && input.role !== 'admin'))) {
      throw badRequest('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
    }

    const patch: Partial<typeof schema.users.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email.toLowerCase();
    if (input.role !== undefined) patch.role = input.role;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
    if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password);

    const [row] = await db.update(schema.users).set(patch).where(eq(schema.users.id, userId)).returning();
    if (input.isActive === false || input.password !== undefined) await invalidateUserSessions(userId);
    return c.json({ user: serializeUser(row) });
  });
