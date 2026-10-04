// CLI: pnpm db:seed  — applies migrations, creates the admin if needed and loads demo data (SEED_DEMO=true)
import { env } from '../env.js';
import { pool } from './index.js';
import { runMigrations } from './migrate.js';
import { ensureAdmin, seedDemo } from './seed.js';

(async () => {
  await runMigrations();
  const created = await ensureAdmin();
  if (!created && env.SEED_DEMO) await seedDemo();
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
