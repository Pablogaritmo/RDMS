import { and, eq, gt, lt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createHash, randomBytes } from 'node:crypto';
import { db, schema } from '../db/index.js';
import { env } from '../env.js';
import { forbidden, unauthorized } from './errors.js';

const COOKIE_NAME = 'rdms_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // extend when < 15 days remain

export type AuthUser = Omit<typeof schema.users.$inferSelect, 'passwordHash'>;

export type AppEnv = {
  Variables: {
    user: AuthUser;
    sessionToken: string;
  };
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function invalidateSession(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}

export async function invalidateUserSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

async function validateSession(token: string): Promise<AuthUser | null> {
  const id = hashToken(token);
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.user.isActive) return null;
  if (row.session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(schema.sessions.id, id));
  }
  const { passwordHash: _ph, ...user } = row.user;
  return user;
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.secureCookies,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

/** Requires an authenticated, active user. Sets c.var.user. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getSessionToken(c);
  if (!token) throw unauthorized();
  const user = await validateSession(token);
  if (!user) {
    clearSessionCookie(c);
    throw unauthorized('Sesión inválida o expirada');
  }
  c.set('user', user);
  c.set('sessionToken', token);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.user.role !== 'admin') throw forbidden('Solo administradores');
  await next();
};

/** Deletes expired sessions. Called opportunistically on boot. */
export async function purgeExpiredSessions() {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
