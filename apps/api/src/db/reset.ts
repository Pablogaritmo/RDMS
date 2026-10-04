// Development helper: drops everything and re-creates the schema + seed.
// Usage: pnpm db:reset -- --yes
import { sql } from 'drizzle-orm';
import { db, pool } from './index.js';
import { runMigrations } from './migrate.js';
import { ensureAdmin } from './seed.js';

if (!process.argv.includes('--yes')) {
  console.error('Esto BORRA toda la base de datos. Ejecuta con: pnpm db:reset -- --yes');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force-production')) {
  console.error('Negándose a resetear en producción sin --force-production');
  process.exit(1);
}

await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(sql`CREATE SCHEMA public`);
await runMigrations();
await ensureAdmin();
await pool.end();
console.log('Base de datos reiniciada.');
