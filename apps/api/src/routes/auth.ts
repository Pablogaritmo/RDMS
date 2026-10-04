import { zValidator } from '@hono/zod-validator';
import { changePasswordSchema, loginSchema, type SessionUser } from '@rdms/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import {
  clearSessionCookie,
  createSession,
  getSessionToken,
  invalidateSession,
  invalidateUserSessions,
  requireAuth,
  setSessionCookie,
  type AppEnv,
  type AuthUser,
} from '../lib/auth.js';
import { AppError, badRequest, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { serializeUser } from '../lib/serialize.js';

// Simple in-memory login throttle: 10 attempts / 15 min per ip+email.
const attempts = new Map<string, { count: number; resetAt: number }>();
function throttle(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now) {
    if (entry.count >= 10) throw new AppError(429, 'Demasiados intentos. Intenta de nuevo en unos minutos.');
    entry.count += 1;
  } else {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
}

export async function buildSessionUser(user: AuthUser): Promise<SessionUser> {
  const [memberships, leads] = await Promise.all([
    db
      .select({ projectId: schema.projectMembers.projectId, role: schema.projectMembers.role })
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.userId, user.id)),
    db
      .select({ systemId: schema.systemMembers.systemId })
      .from(schema.systemMembers)
      .where(and(eq(schema.systemMembers.userId, user.id), eq(schema.systemMembers.role, 'lead'))),
  ]);
  return {
    ...serializeUser(user),
    memberships: memberships.map((m) => ({ projectId: m.projectId, role: m.role as 'lead' | 'member' })),
    systemLeadIds: leads.map((l) => l.systemId),
  };
}

export const authRoutes = new Hono<AppEnv>()
  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';
    throttle(`${ip}:${email.toLowerCase()}`);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) throw unauthorized('Correo o contraseña incorrectos');
    if (!user.isActive) throw unauthorized('Tu cuenta está desactivada. Contacta a un administrador.');

    const token = await createSession(user.id);
    setSessionCookie(c, token);
    const { passwordHash: _ph, ...safe } = user;
    return c.json({ user: await buildSessionUser(safe) });
  })
  .post('/logout', async (c) => {
    const token = getSessionToken(c);
    if (token) await invalidateSession(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  })
  .get('/me', requireAuth, async (c) => c.json({ user: await buildSessionUser(c.var.user) }))
  .post('/change-password', requireAuth, zValidator('json', changePasswordSchema), async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json');
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, c.var.user.id)).limit(1);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest('La contraseña actual es incorrecta');
    await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(schema.users.id, user.id));
    // Rotate: drop every session (including this one) and issue a fresh cookie.
    await invalidateUserSessions(user.id);
    setSessionCookie(c, await createSession(user.id));
    return c.json({ ok: true });
  });
