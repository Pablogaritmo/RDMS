import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env.js';
import { requireAuth, type AppEnv } from './lib/auth.js';
import { errorHandler } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes, projectScopedRoutes, searchRoutes } from './routes/projects.js';
import { userRoutes } from './routes/users.js';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);
  app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false }));
  if (!env.isProd) app.use('*', logger());
  app.use(
    '/api/*',
    cors({
      origin: env.isProd ? [] : [env.CORS_ORIGIN],
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );
  app.use('/api/*', csrf({ origin: env.isProd ? undefined : [env.CORS_ORIGIN] }));

  // Defense in depth: state-changing requests that carry an Origin header must come
  // from our own frontend (same host in production, the Vite origin in development).
  app.use('/api/*', async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
    const origin = c.req.header('origin');
    if (!origin) return next();
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
    const allowed = env.isProd ? [`https://${host}`, `http://${host}`] : [env.CORS_ORIGIN, `http://${host}`];
    if (!allowed.includes(origin)) return c.json({ error: 'Origen no permitido' }, 403);
    return next();
  });

  app.get('/api/health', (c) => c.json({ ok: true, env: env.NODE_ENV }));

  app.route('/api/auth', authRoutes);

  const protectedApi = new Hono<AppEnv>().use('*', requireAuth);
  protectedApi.route('/users', userRoutes);
  protectedApi.route('/projects', projectRoutes);
  protectedApi.route('/projects/:projectId', projectScopedRoutes);
  protectedApi.route('/search', searchRoutes);
  app.route('/api', protectedApi);

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Ruta no encontrada' }, 404) : c.text('Not found', 404)));

  return app;
}
