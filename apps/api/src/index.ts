import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { ensureAdmin } from './db/seed.js';
import { env } from './env.js';
import { purgeExpiredSessions } from './lib/auth.js';

async function main() {
  const app = createApp();

  if (env.isProd) {
    // Serve the compiled SPA (apps/web/dist) with history-API fallback.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [path.resolve(here, '../../web/dist'), path.resolve(here, '../web/dist'), path.resolve(process.cwd(), 'apps/web/dist'), path.resolve(process.cwd(), 'web/dist')];
    const webDist = candidates.find((p) => existsSync(path.join(p, 'index.html')));
    if (webDist) {
      const root = path.relative(process.cwd(), webDist) || '.';
      const indexHtml = readFileSync(path.join(webDist, 'index.html'), 'utf8');
      app.use('/assets/*', serveStatic({ root }));
      app.use('/*', serveStatic({ root }));
      app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml)));
      console.log(`Sirviendo SPA desde ${webDist}`);
    } else {
      console.warn('No se encontró apps/web/dist: solo se servirá el API.');
    }
  }

  const folder = await runMigrations();
  console.log(`Migraciones OK (${folder})`);
  await ensureAdmin();
  await purgeExpiredSessions().catch(() => undefined);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`RDMS API escuchando en http://localhost:${info.port} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});
