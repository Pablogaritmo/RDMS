// CLI: pnpm db:migrate
import { pool } from './index.js';
import { runMigrations } from './migrate.js';

runMigrations()
  .then((folder) => {
    console.log(`Migraciones aplicadas desde ${folder}`);
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
