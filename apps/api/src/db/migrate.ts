import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index.js';

/** Runs all pending SQL migrations from apps/api/drizzle. Safe to run on every boot. */
export async function runMigrations() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // works both from src/db (tsx) and from dist (bundled)
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(process.cwd(), 'drizzle'), path.resolve(process.cwd(), 'apps/api/drizzle')];
  const { existsSync } = await import('node:fs');
  const migrationsFolder = candidates.find((p) => existsSync(p));
  if (!migrationsFolder) throw new Error(`No se encontró la carpeta de migraciones. Buscado en: ${candidates.join(', ')}`);
  await migrate(db, { migrationsFolder });
  return migrationsFolder;
}
